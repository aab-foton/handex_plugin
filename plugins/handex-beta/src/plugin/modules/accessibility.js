// ============================================================
// accessibility.js — aba "Acessibilidade" da tela "Anotar Specs"
//
// Cinco categorias de spec estruturada, criadas exatamente como uma spec
// normal (elemento selecionado no canvas → formulário → create-unified-spec).
// Cada categoria tem selo, cor e regra de numeração próprios — estrutura e
// cores confirmadas inspecionando o arquivo real da lib Figma "Design
// Acessível" (fileKey Wy0IhXRVZMSOOr8E609UqI) via REST API, ver
// refs/design-acessivel-content.json (fonte de conteúdo, espelhada em
// A11Y_CONTENT abaixo) e .claude/agents/accessibility-specialist.md:
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
//                  fora da ordem de leitura, o selo real é um ícone vetor
//                  (ainda não desenhado nesta fase).
//                  Cor: #D93636.
//   - informacoes  Informações adicionais (Handoffs / Conteúdo extra /
//                  Customizável). Tag MANUAL também.
//                  Cor: #F39200.
//
// Fase 2a: estrutura/UI/dados das 5 categorias com conteúdo real
// (Descrição/Observações/Notas de Código) copiado do material da vertical.
// Fase 2c: chave crua da subvariante escolhida (`a11ySubtype`) decide se dá
// pra usar o componente REAL da lib (importComponentByKeyAsync + setProperties
// na instância aninhada) ou se cai no card desenhado — decisão do backend
// (code.js, _tryImportA11yComponent). As 5 categorias tentam o import real,
// inclusive Estrutura da Página (2 níveis de instância aninhada, `variacao`
// → `tipo`, confirmado ao vivo no Figma). Só cai no card desenhado quando o
// designer escolhe de propósito uma opção sem variante catalogada (Outro,
// Customizável, "H" mobile) — comportamento esperado, sem notificação.
//
// Fase 3 (revertida em 2026-07-23) tentou virar "só mapeamento" (sem nó no
// canvas até "Gerar Ficha"). Testando ao vivo o usuário decidiu voltar pro
// comportamento original: confirmar o formulário cria o nó de verdade no
// canvas NA HORA (create-unified-spec, mesmo handler das specs normais,
// opts.a11yType diferencia) — tag + contorno + card, com "Concluir
// posicionamento" (pendingConfirmation/lock-spec) igual specs normais.
// "Marcar Área" continua igual (pré-requisito, organiza a listagem em
// accordions) — só o que acontece DENTRO de uma área mudou. "Gerar Ficha de
// Acessibilidade" (generateA11yFicha, monta um frame separado no canvas com
// colunas por área) coexiste com a aba "♿ Acessibilidade" do export HTML
// interativo (handoff.js) — dois formatos do mesmo conteúdo, por decisão do
// usuário, não um substituindo o outro. Não duplica o selo/card que cada
// spec já tem desde que aplicada individualmente, porque cria um container
// à parte no canvas em vez de mexer nos nós das specs originais.
//
// Array global dedicado `a11ySpecs` (espelha createdSpecs/frame.createdSpecs
// das specs normais, mas nunca compartilha item com elas — ver
// _migrateA11ySpecsFromCreatedSpecs em core.js para dados salvos antes dessa
// separação estrutural) e `a11yAreas` (mesmo padrão, pras Áreas Marcadas).
//
// O switcher de aba (Specs | Acessibilidade) vive em specifications.js
// (switchSpecsMainTab) e chama renderA11ySpecsList()/renderA11yAreasList()
// ao abrir esta aba.
//
// Decisão de produto: o campo Observações NUNCA é pré-preenchido a partir do
// material da vertical (mesmo quando o JSON tem um texto "real" ali, ex.: os
// níveis de título H1-H6) — fica sempre vazio e livre, para não confundir
// "sugestão automática" com "declaração do designer". Só Descrição e Nota de
// Código (quando existem) aparecem como preview somente-leitura, exceto nos
// subtipos "Customizável"/"Outro", onde a Descrição também vira campo livre.
//
// Não existe reordenação automática (como nas specs normais): as tags
// manuais (Elementos/Estrutura/Informações) são responsabilidade do
// designer, e Título/Decorativo têm selo fixo — nada aqui é recalculado a
// partir da posição no canvas.
//
// Depende de: handoffData, a11ySpecs, a11yAreas, activeFrameId, getFrame,
// syncAndRenderSpecs, saveToStorage, saveSpecsToStorage, showToast, focusNode,
// openModal/closeModal, escapeHtml
// ============================================================

// Cores reais extraídas dos fills dos componentes publicados na lib "Design
// Acessível" (ver tabela em accessibility-specialist.md). O selo (Tag/Chip)
// de cada categoria usa a cor "color" no stroke/texto e "fill" como tinta de
// fundo — mesmo padrão das categorias de spec normal.
const A11Y_CATEGORIES = {
  elemento:    { label: 'Elementos e Imagens',     icon: 'image',   color: '#FCBE05', fill: '#FFF6DC', badge: null },
  estrutura:   { label: 'Estrutura da Página',     icon: 'star',    color: '#EF765E', fill: '#FDEAE6', badge: null },
  titulo:      { label: 'Nível de Título',         icon: 'heading', color: '#AFCA0B', fill: '#F5F9DA', badge: 'H' },
  decorativo:  { label: 'Elemento Decorativo',     icon: 'ban',     color: '#D93636', fill: '#FBE4E4', badge: 'Ø' },
  informacoes: { label: 'Informações Adicionais',  icon: 'info',    color: '#F39200', fill: '#FEF1DE', badge: null },
};

// Conteúdo real da lib (Descrição / Observações / Notas de Código), copiado
// de refs/design-acessivel-content.json — ver esse arquivo pra fonte
// original e proveniência (extraído via REST API em 2026-07-23). Mantido
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

// ══ BETA-ONLY: a11y-formulario-dinamico (início) ══
// Depende de: refs/design-acessivel-component-properties.json (colado aqui
// como literal, ver comentário abaixo). Ver MIGRATION-BETA-TO-MAIN.md,
// seção 1.
// ── Component properties reais dos 25 component sets internos "[a11y base]"
// da lib "Design Acessível" — extraído via REST API em 2026-08-19 (ver
// refs/design-acessivel-component-properties.json, fonte original e
// proveniência). Copiado como literal JS aqui pelo mesmo motivo de
// A11Y_CONTENT acima: o bundle do frontend é um único <script> concatenado
// sem require/import, não há como ler o JSON em runtime.
//
// Usado só pela categoria "elemento" (Elementos e Imagens) por ora — as
// outras 4 categorias têm estrutura de toggle mais simples/diferente (ex:
// "estrutura da página" não tem nenhum toggle na property de 1º nível) e
// ainda não têm formulário dinâmico equivalente.
//
// Backend (code.js) importa DIRETO o mesmo JSON de refs/ (esbuild já
// suporta import de .json, mesmo padrão usado pra A11Y_CONTENT/
// design-acessivel-content.json) — não há uma segunda cópia manual lá,
// só aqui no frontend, que não tem bundler de módulos.
const A11Y_COMPONENT_PROPERTIES = [{"shortName":"niveis de titulo","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"nivel","syncId":null,"type":"VARIANT","variantOptions":["h1","h2","h3","h4","h5","h6"],"defaultValue":"h1"}]},{"shortName":"ED gerais","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"notas","syncId":"7489:18","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["ignorar pelo LT","customizável"],"defaultValue":"ignorar pelo LT"}]},{"shortName":"estrutura da página","properties":[{"name":"variacao","syncId":null,"type":"VARIANT","variantOptions":["idiomas","marco de navegacao","titulo da pagina"],"defaultValue":"marco de navegacao"}]},{"shortName":"tab group","properties":[{"name":"nome acessivel","syncId":"742:10","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:115","type":"BOOLEAN"},{"name":"notas","syncId":"1327:118","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["tabs","customizável"],"defaultValue":"tabs"}]},{"shortName":"breadcrumb","properties":[{"name":"nome acessível","syncId":"741:15","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacao","syncId":"1325:19","type":"BOOLEAN"},{"name":"notas","syncId":"1325:25","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["link inicio","link secundario","texto truncado","pagina atual","customizável"],"defaultValue":"link inicio"}]},{"shortName":"stepper","properties":[{"name":"nome acessivel","syncId":"742:22","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:93","type":"BOOLEAN"},{"name":"notas","syncId":"1327:99","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["atual","editavel","preenchido","inativo","customizável"],"defaultValue":"atual"}]},{"shortName":"EE marco de navegacao","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7500:37","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["header","nav","main","aside","footer","customizável"],"defaultValue":"header"}]},{"shortName":"button","properties":[{"name":"nome acessivel","syncId":"742:67","type":"BOOLEAN"},{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7489:9","type":"TEXT"},{"name":"notas","syncId":"7489:18","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","desabilitado","com expansao","agrupado","de icone","de icone com expansao","com nome acessivel","customizável"],"defaultValue":"default"}]},{"shortName":"inputs","properties":[{"name":"nome acessivel","syncId":"742:0","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1325:49","type":"BOOLEAN"},{"name":"notas","syncId":"1325:59","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","tipo numero","tipo data","tipo selecao","tipo senha","somente leitura","botao (i) e tooltip","botao visualizar senha","customizável"],"defaultValue":"default"}]},{"shortName":"paginator","properties":[{"name":"nome acessivel","syncId":"742:31","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:69","type":"BOOLEAN"},{"name":"notas","syncId":"1327:73","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["caixa de selecao","listagem","customizável"],"defaultValue":"caixa de selecao"}]},{"shortName":"snackbar","properties":[{"name":"nome acessivel","syncId":"742:28","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:87","type":"BOOLEAN"},{"name":"notas de codigo","syncId":"1327:90","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["notificacao imediata","customizável"],"defaultValue":"notificacao imediata"}]},{"shortName":"checkbox","properties":[{"name":"nome acessivel","syncId":"742:46","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1325:31","type":"BOOLEAN"},{"name":"notas","syncId":"1325:37","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["somente caixa","Indeterminada em grupo","caixa e rotulo","customizável"],"defaultValue":"somente caixa"}]},{"shortName":"listas","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7500:37","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["ordenada","nao ordenada","de definicao","customizável"],"defaultValue":"ordenada"}]},{"shortName":"EE idiomas","properties":[{"name":"notas","syncId":"1417:0","type":"BOOLEAN"},{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7500:37","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["da pagina","das partes","customizável"],"defaultValue":"da pagina"}]},{"shortName":"table","properties":[{"name":"nome acessivel","syncId":"742:16","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:121","type":"BOOLEAN"},{"name":"notas","syncId":"1327:127","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["estruturada","cabecalho","celula","botao de ordenacao","customizável"],"defaultValue":"estruturada"}]},{"shortName":"accordion","properties":[{"name":"nome acessivel","syncId":"742:51","type":"BOOLEAN"},{"name":"notas de codigo","syncId":"742:54","type":"BOOLEAN"},{"name":"observacoes","syncId":"742:57","type":"BOOLEAN"},{"name":"letter","syncId":"1325:12","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","customizável"],"defaultValue":"default"}]},{"shortName":"informações adicionais","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7500:37","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["handoffs","conteudo extra","customizável"],"defaultValue":"handoffs"}]},{"shortName":"radio button","properties":[{"name":"nome acessivel","syncId":"742:42","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:77","type":"BOOLEAN"},{"name":"notas","syncId":"1327:82","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["Somente rádio","radio e rotulo","customizável"],"defaultValue":"Somente rádio"}]},{"shortName":"switch","properties":[{"name":"nome acesivel","syncId":"742:38","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:105","type":"BOOLEAN"},{"name":"notas","syncId":"1327:110","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["Somente switch","switch e rotulo","customizável"],"defaultValue":"Somente switch"}]},{"shortName":"texto alternativo para imagens","properties":[{"name":"nome acesivel","syncId":"742:13","type":"BOOLEAN"},{"name":"observacoes","syncId":"7500:34","type":"BOOLEAN"},{"name":"notas","syncId":"7500:35","type":"BOOLEAN"},{"name":"letter","syncId":"7500:36","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["texto alternativo","customizável"],"defaultValue":"texto alternativo"}]},{"shortName":"link","properties":[{"name":"nome acessivel","syncId":"742:60","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"notas","syncId":"1325:0","type":"BOOLEAN"},{"name":"observacoes","syncId":"1325:6","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","nova janela","com nome acessivel","agrupado","enviar email","customizável"],"defaultValue":"default"}]},{"shortName":"dialog","properties":[{"name":"nome acessivel","syncId":"742:35","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1325:43","type":"BOOLEAN"},{"name":"notas","syncId":"1325:46","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","customizável"],"defaultValue":"default"}]},{"shortName":"ED imagem","properties":[{"name":"observacoes","syncId":"7500:31","type":"BOOLEAN"},{"name":"notas","syncId":"7500:32","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["texto alternativo","customizável"],"defaultValue":"texto alternativo"}]},{"shortName":"componentes/icones/imagens","properties":[{"name":"variante","syncId":null,"type":"VARIANT","variantOptions":["componente","texto alternativo para imagens"],"defaultValue":"componente"},{"name":"componente","syncId":null,"type":"VARIANT","variantOptions":["accordion","breadcrumb","button","checkbox","dialog","inputs","link","listas","paginator","radio button","snackbar","stepper","switch","tab group","table","imagem"],"defaultValue":"accordion"}]},{"shortName":"elementos decorativos","properties":[{"name":"variacao","syncId":null,"type":"VARIANT","variantOptions":["gerais","imagem"],"defaultValue":"gerais"}]}];

// O <select> de "Elementos e Imagens" usa a chave "imagem" (mesma de
// A11Y_CONTENT.elemento.componentes), mas o component set real correspondente
// na lib se chama "texto alternativo para imagens" — os outros 15 valores do
// select já casam 1:1 com o shortName do component set. Sem esse mapeamento
// "imagem" não seria encontrado em A11Y_COMPONENT_PROPERTIES.
const _A11Y_SELECT_TO_SHORTNAME = {
  imagem: 'texto alternativo para imagens',
};

// Vocabulário canônico dos toggles booleanos encontrados nos 25 component
// sets — a lib tem erros de digitação inconsistentes entre componentes
// (confirmado lendo o catálogo completo, não só os exemplos citados no
// pedido original):
//   "nome acesivel" (Switch, Texto alternativo) / "nome acessivel" (maioria)
//   / "nome acessível" (Breadcrumb, com acento) → nomeAcessivel
//   "observacao" (Breadcrumb, singular) / "observacoes" (maioria)          → observacoes
//   "notas" (maioria) / "notas de codigo" (Accordion, Snackbar)            → notas
// Nunca há dois nomes do mesmo grupo coexistindo no mesmo componente (uma
// property já cobre o campo Nota de Código completo), então normalizar por
// string (sem acento, minúsculo, singular/plural tratado como equivalente)
// é seguro e não perde informação.
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
};

// Properties VARIANT que já são controladas pelo próprio <select> de
// "Componente" (nível 1, wrapper "componentes/icones/imagens") — nunca viram
// um segundo seletor redundante no formulário, mesmo aparecendo no array
// bruto de properties do catálogo.
const _A11Y_VARIANT_BLOCKLIST = new Set(['componente', 'variante']);

// Capitaliza só a primeira letra — suficiente pra rotular opções de variante
// (ex: "de icone" → "De icone") sem tradução extensa, como pedido.
function _capitalizeFirst(s) {
  const str = String(s || '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Dado o shortName do <select> de "Elementos e Imagens" (ex: 'button',
// 'imagem'), retorna { toggles: [{ key, label, syncId }], texts: [...],
// variants: [...], variantFields: [{ name, syncId, options, rawName }] } com
// os toggles/variantes canônicos DISPONÍVEIS naquele componente real, ou null
// se o componente não estiver catalogado (fallback gracioso — o formulário
// simplesmente não mostra nenhum campo extra nesse caso, sem travar).
// variantFields cobre a property "tipo" (ou equivalente) que cada componente
// ESPECÍFICO tem (ex: Button → default/desabilitado/de icone/...) — nunca a
// "componente"/"variante" do wrapper de nível 1, essa já é o próprio <select>.
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
// ══ BETA-ONLY: a11y-formulario-dinamico (pausa — próximo trecho é pré-existente) ══

// Procura uma Área Marcada pelo id em todos os escopos possíveis (avulsas +
// de cada frame) — usada pra mostrar o rótulo da área no modal de escolha de
// categoria e no formulário de spec.
function _findA11yAreaById(areaId) {
  if (!areaId) return null;
  const all = [
    ...(a11yAreas || []),
    ...(handoffData.frames || []).flatMap(f => f.a11yAreas || []),
  ];
  return all.find(a => a && a.id === areaId) || null;
}

// ── Criação ──────────────────────────────────────────────────────────────

// Botão "+" no cabeçalho de cada accordion de Área Marcada primeiro checa se
// a lib "Design Acessível" está acessível (fase 1 de FEAT-a11y-lib-reuse)
// antes de abrir o modal de escolha de categoria — ver handler
// 'check-a11y-library' em code.js. A área clicada fica guardada em
// window._a11yPendingAreaId até o formulário (openA11yModal) ler e gravar em
// modal.dataset.areaId — é assim que confirmA11ySpec sabe em qual área a nova
// spec deve nascer. Não existe mais criação de spec sem área (pré-requisito).
function openA11yCategoryPickerModal(areaId) {
  window._a11yPendingAreaId = areaId || null;
  // Token de correlação — se o designer clicar "+" em duas áreas diferentes
  // antes da primeira checagem responder, só a resposta do pedido MAIS
  // recente pode abrir o modal (ver a11y-library-status em messages.js).
  // Sem isso, uma resposta atrasada podia reabrir o seletor de categoria por
  // cima de um formulário que o designer já estava preenchendo.
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
  openA11yModal(category);
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
// nível, Decorativo usa selo fixo de ícone (ainda não desenhado nesta fase).
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

function openA11yModal(category, options) { // BETA-ONLY: a11y-deteccao-automatica — parâmetro `options`/presetComponente é novo (era só `category`)
  const meta = A11Y_CATEGORIES[category];
  if (!meta) return;
  const presetComponente = options && options.presetComponente; // BETA-ONLY: a11y-deteccao-automatica

  const modal = document.getElementById('a11y-spec-modal');
  if (!modal) return;
  modal.dataset.category = category;
  modal.dataset.areaId = window._a11yPendingAreaId || '';
  // BETA-ONLY: a11y-deteccao-automatica (início) — usado pelo lote automatizado
  // pra pré-selecionar o componente sugerido no <select>.
  if (presetComponente) modal.dataset.presetComponente = presetComponente;
  else delete modal.dataset.presetComponente;
  // BETA-ONLY: a11y-deteccao-automatica (fim do trecho acima)
  // editA11ySpec sobrescreve editingSpecId/editingOriginalIndex e o texto do
  // botão logo depois desta chamada — abrir pra criar uma spec nova sempre
  // limpa qualquer resquício de edição anterior.
  delete modal.dataset.editingSpecId;
  delete modal.dataset.editingOriginalIndex;
  const confirmBtnReset = document.getElementById('btn-a11y-confirm');
  if (confirmBtnReset) confirmBtnReset.textContent = 'Aplicar';

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

  const title = document.getElementById('a11y-modal-title-text');
  if (title) title.textContent = A11Y_MODAL_TITLE[category] || 'Especificação de Acessibilidade';

  const titleIconWrap = document.getElementById('a11y-modal-title-icon');
  if (titleIconWrap) {
    titleIconWrap.innerHTML = `<i data-lucide="${meta.icon}" class="w-4 h-4" style="color:${meta.color}" aria-hidden="true"></i>`;
    _refreshIcons(titleIconWrap);
  }

  ['elemento', 'estrutura', 'titulo', 'decorativo', 'informacoes'].forEach(c => {
    const block = document.getElementById(`a11y-fields-${c}`);
    if (block) block.classList.toggle('hidden', category !== c);
  });

[
    'a11y-el-label',
    'a11y-el-componente-outro',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const drawModeDefault = document.querySelector('input[name="a11y-draw-mode"][value="contorno"]');
  if (drawModeDefault) drawModeDefault.checked = true;

  if (category === 'elemento') {
    // Pré-preenche via seleção do canvas — puramente cosmético, ver
    // prefillA11yComponentName (mensagem 'get-selection-name' assíncrona).
    parent.postMessage({ pluginMessage: { type: 'get-selection-name' } }, '*');
    const select = document.getElementById('a11y-el-componente-select');
    if (select) {
      // BETA-ONLY: a11y-deteccao-automatica — antes sempre caía no primeiro
      // componente do catálogo; agora respeita presetComponente quando válido.
      const validPreset = presetComponente && A11Y_CONTENT.elemento.componentes[presetComponente];
      select.value = validPreset ? presetComponente : Object.keys(A11Y_CONTENT.elemento.componentes)[0];
    }
    updateA11yElementoFields();
  } else if (category === 'estrutura') {
    const subtipoSelect = document.getElementById('a11y-estrutura-subtipo-select');
    if (subtipoSelect) subtipoSelect.value = 'idiomas';
    const idiomasSelect = document.getElementById('a11y-estrutura-idiomas-select');
    if (idiomasSelect) idiomasSelect.value = 'da pagina';
    const marcoSelect = document.getElementById('a11y-estrutura-marco-select');
    if (marcoSelect) marcoSelect.value = 'header';
    updateA11yEstruturaFields();
  } else if (category === 'titulo') {
    const nivelSelect = document.getElementById('a11y-titulo-nivel-select');
    if (nivelSelect) nivelSelect.value = 'h1';
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
    // Sugestão compartilhada com specs normais (_suggestNextSpecTag, core.js)
    // — olha createdSpecs + a11ySpecs juntas do frame ativo, já que as duas
    // categorias compartilham o mesmo espaço de tags no canvas.
    if (tagInput) tagInput.value = typeof _suggestNextSpecTag === 'function' ? _suggestNextSpecTag(activeFrameId) : 'A';
  }
  validateA11yTagInput();

  openModal('a11y-spec-modal');
}
window.openA11yModal = openA11yModal;

// Tag manual (A, A1, A1.1...) — mesmo formato e mesma lógica de validação das
// specs normais (spec-letter-input em modals.html). Resolve o input/erro
// certo a partir da categoria aberta no momento (modal.dataset.category).
// Título e Elemento Decorativo usam selo fixo, não participam dessa
// numeração — nesse caso não há o que validar, botão sempre habilitado.
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
  const value = input.value.toUpperCase();
  const isValid = /^[A-Z]\d*(\.\d+)*$/.test(value);
  if (error) error.classList.toggle('hidden', isValid);
  if (confirmBtn) confirmBtn.disabled = !isValid;
  return isValid;
}
window.validateA11yTagInput = validateA11yTagInput;

// ── Elementos e Imagens ──────────────────────────────────────────────────
// Select com o catálogo real de 16 componentes do DSC + "Outro" (texto
// livre, pra telas com componentes fora do catálogo). Ao escolher um item do
// catálogo, mostra preview somente-leitura de Descrição/Nota de Código.
function updateA11yElementoFields() {
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
  // BETA-ONLY: a11y-formulario-dinamico — as 2 linhas abaixo são novas
  _renderA11yElementoVariants(isOutro ? null : select.value);
  _renderA11yElementoToggles(isOutro ? null : select.value);
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

// ══ BETA-ONLY: a11y-formulario-dinamico (retomada — funções de render/
// coleta/restore dos campos dinâmicos de "Elementos e Imagens") ══
// Renderiza, dentro de #a11y-el-variants-list, um <select> nativo por
// property VARIANT secundária REAL que o componente escolhido tem na lib
// (ex: Button → "tipo": default/desabilitado/de icone/...) — ver
// _getA11yComponentToggles/variantFields. Nunca duplica o próprio <select>
// de "Componente" (esse já é o nível 1, controlado por outro elemento do
// formulário) — variantFields já vem filtrado disso. A maioria dos
// componentes tem só um campo aqui ("tipo"), mas a função suporta múltiplos
// caso a lib venha a ter mais de um. Aparece ANTES dos toggles booleanos
// (característica mais estrutural do componente, não um campo opcional de
// texto) e roda antes deles em updateA11yElementoFields.
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
// existe "tipo" por componente, ver catálogo) ou null se não houver campo
// renderizado (componente sem variante secundária, ou "Outro").
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
// componentes diferentes mostram conjuntos diferentes (ex: "Estrutura da
// Página" não tem toggle nenhum nesse nível, então a lista fica vazia e o
// wrap some). Cada toggle começa DESLIGADO por padrão (decisão de produto: o
// designer escolhe explicitamente o que documentar a cada spec, não herda o
// defaultValue:true do componente base no Figma) e, quando ligado, revela um
// textarea de texto livre — é esse texto que o backend grava de verdade
// dentro do campo do componente real (ver _tryImportA11yComponent, code.js).
// Reconstrói a lista do zero a cada troca de componente — não preserva texto
// já digitado de um componente pro outro, porque os campos disponíveis
// mudam de conjunto.
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
        <textarea data-a11y-toggle-value rows="2" placeholder="Insira seu texto de ${escapeHtml(t.label.toLowerCase())}."
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg px-2.5 py-2 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-cyan-100 transition-all resize-none"></textarea>
      </div>
    `;
    list.appendChild(row);
  });
}

// Mostra/esconde o textarea do campo quando o toggle correspondente muda —
// mesmo padrão de toggleLinkInput (specifications.js): limpa o texto ao
// desligar, pra não persistir um valor "fantasma" de um toggle desativado.
// `row` é o container criado em _renderA11yElementoToggles (checkbox e
// textarea são sempre irmãos diretos dentro dele).
function _onA11yElementoToggleChange(checkbox) {
  const row = checkbox.closest('div');
  const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
  if (!wrap) return;
  wrap.classList.toggle('hidden', !checkbox.checked);
  if (!checkbox.checked) {
    const ta = wrap.querySelector('[data-a11y-toggle-value]');
    if (ta) ta.value = '';
  }
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
      if (ta) ta.value = p.value || '';
    }
  });
}
// ══ BETA-ONLY: a11y-formulario-dinamico (pausa — próximo trecho é pré-existente) ══

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

function prefillA11yComponentName(name, mainText) { // BETA-ONLY: label-automatico — parâmetro `mainText` é novo (era só `name`)
  const modal = document.getElementById('a11y-spec-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (modal.dataset.category !== 'elemento') return;
  // BETA-ONLY: label-automatico (início)
  // Label a partir do texto real do elemento (ver _findMainTextContent,
  // code.js) — independente do Componente ter sido reconhecido ou não, e
  // sem sobrescrever se o designer já digitou algo (nunca pisa em edição
  // nem em input manual já preenchido).
  _fillA11yLabelIfEmpty(mainText);
  // BETA-ONLY: label-automatico (fim do trecho acima)
  // Em modo edição (editA11ySpec) o formulário já foi preenchido com os
  // dados salvos da spec — o nome do que estiver selecionado no canvas
  // nesse momento é irrelevante e não pode pisar num "Componente" do
  // catálogo já escolhido (a resposta assíncrona de get-selection-name
  // chegaria depois do prefill síncrono e trocaria pra "Outro" silenciosamente).
  if (modal.dataset.editingSpecId) return;
  // BETA-ONLY: a11y-deteccao-automatica — proteção contra presetComponente
  // Mesma lógica de proteção do modo edição: se o formulário foi aberto com
  // um componente pré-selecionado (botão "Usar sugestão" da Detecção
  // Automática), o nome do canvas não pode trocar o select pra "Outro" por
  // cima da sugestão já escolhida.
  if (modal.dataset.presetComponente) return;
  const outro = document.getElementById('a11y-el-componente-outro');
  const select = document.getElementById('a11y-el-componente-select');
  // Nome do canvas raramente bate com uma chave do catálogo — cai sempre em
  // "Outro" com o nome pré-preenchido, o designer troca pro item certo se
  // reconhecer o componente na lista.
  if (select && outro && !outro.value && name) {
    select.value = 'outro';
    outro.value = name;
    updateA11yElementoFields();
  }
}
window.prefillA11yComponentName = prefillA11yComponentName;

// ══ BETA-ONLY: label-automatico (retomada) ══
// Escreve o texto real do elemento (primeiro TEXT visível encontrado no
// canvas, ver _findMainTextContent em code.js) no campo Label, só se ele
// ainda estiver vazio — nunca sobrescreve o que o designer já digitou.
function _fillA11yLabelIfEmpty(mainText) {
  if (!mainText) return;
  const labelInput = document.getElementById('a11y-el-label');
  if (labelInput && !labelInput.value.trim()) labelInput.value = mainText;
}

// Resposta de 'get-node-main-text' — mesmo preenchimento condicional de
// _fillA11yLabelIfEmpty, só que a partir de um nodeId específico, não da
// seleção atual do canvas. BETA-ONLY: a11y-injecao-em-massa — desde a
// remoção do fluxo individual "Usar sugestão" (único disparador desta
// mensagem), nenhum caminho do frontend envia mais 'get-node-main-text' —
// handler (code.js), roteamento (messages.js) e esta função ficaram
// inalcançáveis. Mantidos por ora (não é escopo desta mudança limpar),
// candidatos a remoção numa passada de limpeza futura.
function prefillA11yLabelFromMainText(mainText) {
  const modal = document.getElementById('a11y-spec-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (modal.dataset.category !== 'elemento') return;
  _fillA11yLabelIfEmpty(mainText);
}
window.prefillA11yLabelFromMainText = prefillA11yLabelFromMainText;
// ══ BETA-ONLY: label-automatico (fim) ══

// ══ BETA-ONLY: a11y-formulario-dinamico (retomada — toggles genéricos das 4
// categorias sem <select> de Componente) ══
// ── Toggles dinâmicos genéricos (Título/Decorativo/Estrutura/Informações) ──
// Mesmo padrão de _renderA11yElementoToggles/_collectA11yElementoToggleProperties/
// _restoreA11yElementoToggles, mas parametrizado por wrapId/listId/shortName
// em vez de fixo em "a11y-el-*" — usado pelas 4 categorias que não têm um
// <select> de "Componente" dinâmico (o shortName do component set é
// resolvido no momento da chamada, não a partir de um select). Reaproveita
// _getA11yComponentToggles inteiramente: essa função já faz
// `_A11Y_SELECT_TO_SHORTNAME[selectValue] || selectValue`, então passar o
// shortName exato do catálogo (ex: 'niveis de titulo', 'ED gerais') cai
// direto no fallback `|| selectValue` e funciona sem nenhuma mudança lá.
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
        <textarea data-a11y-toggle-value rows="2" placeholder="Insira seu texto de ${escapeHtml(t.label.toLowerCase())}."
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg px-2.5 py-2 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-cyan-100 transition-all resize-none"></textarea>
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
      if (ta) ta.value = p.value || '';
    }
  });
}
// ══ BETA-ONLY: a11y-formulario-dinamico (pausa — Estrutura da Página é pré-existente) ══

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
  }
  if (notaWrap) notaWrap.classList.toggle('hidden', !(entry && entry.notasCodigo));
  if (notaEl) notaEl.textContent = (entry && entry.notasCodigo) || '';

  // BETA-ONLY: a11y-formulario-dinamico
  // Toggles dos sub-níveis reais ("EE idiomas": notas+observacoes; "EE marco
  // de navegacao": observacoes) — só existem quando o import real é possível
  // (mesmas condições de _tryImportA11yComponent/code.js: "customizavel" no
  // nível 1 e "customizavel" dentro de marco de navegação não têm componente
  // catalogado). Não mexe em nenhum dos ramos condicionais acima — só decide
  // o shortName certo por último, sem alterar entry/isCustomizavel/descInput.
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

  // BETA-ONLY: a11y-formulario-dinamico
  // Toggle real do component set "niveis de titulo" (só "observacoes" —
  // catálogo confirmado via REST API, ver design-acessivel-component-properties.json).
  // Modo mobile ("H", sem nível) não tem componente real catalogado (ver
  // _tryImportA11yComponent, code.js: 'a11y-titulo-mobile-sem-variante-real'),
  // então não faz sentido mostrar o campo — cai sempre no card procedural.
  _renderA11yFixedToggles('a11y-titulo-toggles-wrap', 'a11y-titulo-toggles-list', isMobile ? null : 'niveis de titulo');
}
window.updateA11yTituloFields = updateA11yTituloFields;

// ── Elemento Decorativo ──────────────────────────────────────────────────
// Sub-select entre "Gerais" e "Imagem" — mesma Descrição, Nota de Código
// diferente (alt="" em HTML pra imagem, anotação genérica pra gerais).
// Subtipo do <select> (gerais/imagem) já controla a property VARIANT
// "variacao" do wrapper "elementos decorativos" (nível 1, ver
// _tryImportA11yComponent/code.js) — não duplicar select. Cada subtipo abre
// um component set PRÓPRIO com toggles diferentes: "ED gerais" tem
// observacoes+notas, "ED imagem" tem só observacoes+notas também (nomes
// idênticos por coincidência, mas são sets distintos no catálogo).
const _A11Y_DECORATIVO_SHORTNAME = { gerais: 'ED gerais', imagem: 'ED imagem' };

function updateA11yDecorativoFields() {
  const select = document.getElementById('a11y-decorativo-subtipo-select');
  if (!select) return;
  const entry = A11Y_CONTENT.decorativo[select.value];
  const descEl = document.getElementById('a11y-fixed-descricao-dec');
  const notaEl = document.getElementById('a11y-fixed-nota-dec');
  if (descEl) descEl.textContent = (entry && entry.descricao) || '';
  if (notaEl) notaEl.textContent = (entry && entry.notasCodigo) || '';

  // BETA-ONLY: a11y-formulario-dinamico
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
  }

  // BETA-ONLY: a11y-formulario-dinamico
  // "Customizável" não tem componente real catalogado (ver
  // _tryImportA11yComponent, code.js: 'a11y-informacoes-customizavel-sem-variante-real')
  // — sem sentido mostrar o toggle, cai sempre no card procedural.
  _renderA11yFixedToggles('a11y-informacoes-toggles-wrap', 'a11y-informacoes-toggles-list', isCustomizavel ? null : 'informações adicionais');
}
window.updateA11yInformacoesFields = updateA11yInformacoesFields;

function closeA11yModal() {
  closeModal('a11y-spec-modal');
}
window.closeA11yModal = closeA11yModal;

// Ponte de request/response com o backend para pegar {id, name} da seleção
// atual no canvas — usada por "Marcar Área" (confirmA11yArea, que cria um
// selo perto do elemento) e pelo pré-preenchimento cosmético do nome do
// componente em openA11yModal. confirmA11ySpec NÃO usa mais isso: desde a
// reversão da Fase 3, create-unified-spec usa a seleção atual do canvas
// direto no backend, igual specs normais. Só existe um pedido pendente por
// vez (não há fila): se um novo pedido for feito antes do anterior
// responder, o resolver antigo é perdido silenciosamente — cenário
// improvável nesse fluxo (um modal por vez).
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

// ══ BETA-ONLY: a11y-deteccao-automatica (início — payload builders puros
// reaproveitados pelo lote "Gerar Handoff Automatizado") ══
// Depende de: confirmA11yBatchGenerate/openA11yBatchSummaryModal mais abaixo.
// Ver MIGRATION-BETA-TO-MAIN.md.
// ── Payload puro de "Elementos e Imagens" ───────────────────────────────
// Extraído de confirmA11ySpec (fluxo manual) pra ser reaproveitado também
// pelo lote de "Gerar Handoff Automatizado" (confirmA11yBatchGenerate) — a
// ÚNICA categoria relevante pro lote, já que é a única com correspondência
// DSC detectável (ver handleA11yPostAreaDetectionResult). Recebe os dados JÁ RESOLVIDOS
// (nunca lê do DOM) e devolve { letter, properties, a11ySubtype } no mesmo
// formato que confirmA11ySpec monta pra 'create-unified-spec'. As outras 4
// categorias (estrutura/titulo/decorativo/informacoes) não têm equivalente
// em lote nesta fase — permanecem só dentro de confirmA11ySpec, lendo do
// DOM do formulário manual (decisão pragmática: extrair as 5 exigiria
// desacoplar toggles/variantes dinâmicas de cada uma sem ganho nesta fase).
//
// options:
//   componenteKey  chave do catálogo (ex: 'accordion') — nunca "outro" aqui,
//                  o lote só lida com componentes que o scan já reconheceu.
//   label          valor de accessibilityLabel. No fluxo manual é o que o
//                  designer digitou; no lote em massa (Fase 3) é o NOME DO
//                  NÓ no canvas como placeholder — decisão de UX deliberada,
//                  ver confirmA11yBatchGenerate.
//   tipo           variante secundária (ex: Button → "de icone") — no lote
//                  vem de _inferA11yVariantFromDsc quando há correspondência
//                  DSC conhecida (BETA-ONLY: a11y-inferencia-variante-lote),
//                  senão null (usa o defaultValue do catálogo, mesmo
//                  comportamento do formulário quando o designer não mexe
//                  em nada).
//   toggleProperties  array já no formato properties[] ({key,label,value})
//                  dos toggles dinâmicos ligados — no lote sempre [] (nenhum
//                  toggle ligado, Observações/Notas ficam vazias/desligadas).
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

// Payload puro pra categoria "titulo" no lote automatizado — mesmo espírito
// de _buildA11yElementoPayload, mas com nível FIXO em "h1" (default): a
// heurística de detecção de texto/título não sabe distinguir H1 de H3, então
// todo item detectado nasce como H1 e o designer corrige o nível manualmente
// depois (decisão consciente do usuário, ver pedido de incluir titulo/
// decorativo no lote "com os defaults").
function _buildA11yTituloPayload(letter, label) {
  const nivel = 'h1';
  const entry = A11Y_CONTENT.titulo.niveis[nivel];
  const properties = [
    { key: 'descricao', label: 'Descrição', value: (entry && entry.descricao) || '' },
    { key: 'label', label: 'Label', value: label },
  ].filter(p => p.value);
  return { letter, properties, a11ySubtype: { nivel } };
}

// Payload puro pra categoria "decorativo" no lote — subtipo fixo em "gerais"
// (o mais comum; "imagem" exige saber se é <img> ou background, o que a
// heurística de ícone/vetor não determina).
function _buildA11yDecorativoPayload(label) {
  const tipo = 'gerais';
  const entry = A11Y_CONTENT.decorativo[tipo];
  const properties = [
    { key: 'descricao', label: 'Descrição', value: (entry && entry.descricao) || '' },
    { key: 'label', label: 'Label', value: label },
  ].filter(p => p.value);
  return { letter: A11Y_CATEGORIES.decorativo.badge, properties, a11ySubtype: { tipo } };
}
// ══ BETA-ONLY: a11y-deteccao-automatica (pausa — confirmA11ySpec abaixo é pré-existente) ══

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
  // em properties[]) — usada só pelo backend na Fase 2c pra saber qual variante
  // ajustar na instância aninhada do componente real importado da lib. Specs
  // normais e o schema de properties[] continuam sem depender disso.
  let a11ySubtype = null;

  // ══ BETA-ONLY: a11y-formulario-dinamico (início — branch 'elemento'
  // reescrito para separar isOutro vs. componente real com toggles/variantes
  // dinâmicos; antes era um bloco único sem essa distinção). Ver
  // MIGRATION-BETA-TO-MAIN.md. ══
  if (category === 'elemento') {
    const tag = g('a11y-el-tag-input').toUpperCase();
    if (!validateA11yTagInput()) {
      showToast('Tag inválida. Use o formato A, B, A1, A1.1...');
      return;
    }
    const select = document.getElementById('a11y-el-componente-select');
    const isOutro = select && select.value === 'outro';
    const label = g('a11y-el-label');
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
      a11ySubtype = { componente: null, isOutro: true, tipo: null };
      properties = [
        { key: 'componente', label: 'Componente', value: componenteOutro },
        { key: 'label', label: 'Label', value: label },
      ].filter(p => p.value);
    } else {
      if (!label) {
        showToast('Informe o Label (accessibilityLabel) do elemento.');
        return;
      }
      // tipo: valor do <select> dinâmico de variante secundária (ex: Button →
      // "de icone") — null quando o componente não tem nenhuma variante
      // catalogada além de "componente" (ver _getA11yComponentToggles/
      // variantFields). Usado só pelo backend na Fase 2c
      // (_tryImportA11yComponent) pra aplicar setProperties na instância
      // aninhada certa.
      const tipo = _collectA11yElementoVariantValue();
      // Toggles dinâmicos do componente real (Nome Acessível/Observações/
      // Notas de Código, conforme disponíveis naquele componente específico —
      // ver _getA11yComponentToggles). Só entram os que o designer ligou E
      // preencheu; o backend usa properties[].key pra saber qual property
      // ativar via setProperties na instância aninhada certa (ver
      // _tryImportA11yComponent, code.js).
      const built = _buildA11yElementoPayload(tag, select.value, label, {
        tipo,
        toggleProperties: _collectA11yElementoToggleProperties(),
      });
      letter = built.letter;
      properties = built.properties;
      a11ySubtype = built.a11ySubtype;
    }
  // ══ BETA-ONLY: a11y-formulario-dinamico (fim do branch 'elemento') ══
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
    // Toggles dos sub-níveis "EE idiomas"/"EE marco de navegacao" (ver
    // updateA11yEstruturaFields) — mesma mecânica de "elemento": o backend
    // usa properties[].key pra ativar a property booleana real na instância
    // aninhada certa (ver _tryImportA11yComponent, code.js).
    properties.push(..._collectA11yFixedToggleProperties('a11y-estrutura-toggles-list')); // BETA-ONLY: a11y-formulario-dinamico
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
    properties.push(..._collectA11yFixedToggleProperties('a11y-titulo-toggles-list')); // BETA-ONLY: a11y-formulario-dinamico
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
    // (ED gerais / ED imagem) — ver updateA11yDecorativoFields.
    properties.push(..._collectA11yFixedToggleProperties('a11y-decorativo-toggles-list')); // BETA-ONLY: a11y-formulario-dinamico
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
    // aparece no subtipo "customizavel" (sem componente real catalogado, ver
    // updateA11yInformacoesFields).
    properties.push(..._collectA11yFixedToggleProperties('a11y-informacoes-toggles-list')); // BETA-ONLY: a11y-formulario-dinamico
    const infoSelect = document.getElementById('a11y-informacoes-subtipo-select');
    a11ySubtype = { subtipo: infoSelect ? infoSelect.value : 'handoffs' };
  }

  closeA11yModal();

  // Reversão da Fase 3 (2026-07-23): confirmar o formulário volta a criar o
  // nó de verdade no canvas na hora — mesmo handler 'create-unified-spec' das
  // specs normais (opts.a11yType diferencia). O backend usa a seleção atual
  // do canvas quando opts.targetNodeId não é informado (mesmo padrão de
  // confirmSpecProperties em specifications.js), então não precisamos mais
  // buscar a seleção de forma assíncrona aqui — se nada estiver selecionado,
  // o próprio backend avisa via figma.notify.
  //
  // A resposta 'spec-created' (messages.js) já sabe rotear pra a11ySpecs/
  // frame.a11ySpecs quando newSpec.a11yType existe, preenchendo o id REAL do
  // nó e pendingConfirmation:true — não duplicar esse trabalho aqui.
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
    // reativa o conector (real da lib quando disponível, ver
    // A11Y_CONECTOR_LINHA_KEYS em code.js; vetor procedural como fallback).
    drawMode,
    drawConnection: drawMode === 'linha',
    // --- Acessibilidade --- diferencia a categoria na hora de renderizar/agrupar.
    a11yType: category,
    // Chave crua da subvariante — usada pelo backend pra tentar o import real
    // do componente da lib (ver code.js, _tryImportA11yComponent).
    a11ySubtype,
    // Área Marcada onde a spec nasceu — associação explícita, escolhida no
    // momento da criação. O backend ecoa esse campo de volta em spec-created
    // pra spec.a11yAreaId continuar presente no objeto salvo localmente.
    a11yAreaId: areaId || null,
    // ══ BETA-ONLY: a11y-layout-colunas (início) ══
    // IDs das specs irmãs (mesma área + mesma categoria) já no canvas —
    // permite ao backend alinhar o card novo na mesma sub-coluna X das
    // demais specs da área+categoria, mesmo quando usam letras ou lados de
    // conector diferentes (ver _areaMap em code.js, create-unified-spec).
    existingAreaSpecIds: _collectAreaSiblingSpecIds(areaId, category),
    // Todas as specs da área (qualquer categoria) — só usado quando a
    // categoria acima é nova na área, pra decidir ao lado de qual sub-coluna
    // existente posicionar a nova (ver _areaMap em code.js).
    existingAreaAllSpecIds: _collectAreaAllSpecIds(areaId),
    // ══ BETA-ONLY: a11y-layout-colunas (fim) ══
  };

  if (areaId) {
    window._a11yExpandedAreaIds = window._a11yExpandedAreaIds || new Set();
    window._a11yExpandedAreaIds.add(areaId);
  }

  // Editar = apagar o nó antigo (selo + card real) e recriar do zero com os
  // dados atualizados, fixando targetNodeId pra não depender da seleção
  // atual do canvas (o elemento já foi escolhido na criação original).
  const editingSpec = editingOriginalIndex >= 0 ? a11ySpecs[editingOriginalIndex] : null;
  if (editingSpecId && editingSpec) {
    opts.targetNodeId = editingSpec.targetNodeId;
    // Mantém a spec exatamente onde estava no canvas — sem isso o backend
    // trata a recriação como spec nova e a empilha no fim do grupo (ver
    // opts.pinnedPosition em code.js, create-unified-spec).
    if (typeof editingSpec.cardX === 'number' && typeof editingSpec.cardY === 'number') {
      opts.pinnedPosition = { x: editingSpec.cardX, y: editingSpec.cardY };
    }
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: editingSpecId } }, '*');
    a11ySpecs.splice(editingOriginalIndex, 1);
    (handoffData.frames || []).forEach(frame => {
      if (!frame.a11ySpecs) return;
      const idx = frame.a11ySpecs.indexOf(editingSpec);
      if (idx !== -1) {
        // Guarda a posição original pra spec-created (messages.js) reinserir
        // no mesmo lugar em vez de só empilhar no fim do array — evita que
        // ela "desça" na lista quando duas specs da mesma área compartilham
        // a mesma letra (ordenação por letra é estável, desempate é a ordem
        // de inserção).
        window._a11yEditingReinsertIndex = idx;
        frame.a11ySpecs.splice(idx, 1);
      }
    });
  }

  parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
}
window.confirmA11ySpec = confirmA11ySpec;

// ── Listagem ─────────────────────────────────────────────────────────────
// Reformulação: Áreas Marcadas viram o agrupamento principal (accordion, mesmo
// padrão visual/funcional dos accordions de frame — ver toggleFrameAccordion
// em core.js). Toda spec de A11y nasce DENTRO de uma área específica; não
// existe mais spec "solta" no fluxo novo. renderA11ySpecsList/renderA11yAreasList
// viram wrappers finos pra não quebrar quem ainda chama esses nomes (core.js
// syncAndRenderSpecs, messages.js, specifications.js switchSpecsMainTab).

// Reversão da Fase 3: specs de A11y voltam a nascer com nó real no canvas
// (spec.id === id do specGroup, não mais um id local). Diferente das specs
// normais, nascem TRAVADAS (não soltas pra arrastar) — o marcador já é
// calculado pra contornar o elemento certo. Sem fluxo de "Concluir
// posicionamento"; a listagem tem focar, ocultar/mostrar, cadeado
// (destravar/travar) e excluir (remove o nó do canvas também).
function _a11ySpecItemHtml(spec) {
  const meta = A11Y_CATEGORIES[spec.a11yType] || { label: 'Acessibilidade', icon: 'accessibility' };
  const color = spec.color || meta.color || '#0891B2';
  const fill = spec.fillColor || meta.fill || '#E0F5FA';
  const props = spec.properties || [];
  const isHidden = spec.visible === false;
  const isUnlocked = spec.locked === false;

  // BETA-ONLY: specs-busca-filtro — searchText + data-attrs consumidos por
  // _applyA11yFilters mais abaixo neste arquivo.
  const searchText = _normalizeSearchText(
    [spec.letter, spec.targetNodeName, spec.name, meta.label, spec.a11yType]
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
            ${spec.needsReview ? `
            <button type="button" title="Criado em lote com baixa confiança — clique para revisar" aria-label="Verificar especificação — criada em lote com baixa confiança"
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
          <div class="flex items-center justify-between gap-2 px-2 py-1 bg-white dark:bg-dark-surface rounded-lg">
            <span class="text-[9px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider">${escapeHtml(p.label)}</span>
            <span class="text-[10px] font-semibold text-slate-700 dark:text-white text-right">${escapeHtml(String(p.value))}</span>
          </div>`).join('')}
      </div>` : ''}
    </div>
  `;
}

// Conjunto persistente de áreas expandidas — sobrevive a re-renders (ex.:
// criar/editar qualquer spec, normal ou de A11y, dispara syncAndRenderSpecs
// e reconstrói a lista do zero). Sem isso, cada re-render colapsava de volta
// qualquer área que o designer tivesse aberto manualmente pra consulta.
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

// ══ BETA-ONLY: a11y-subaccordions (início) ══
// Depende de: chamada em _a11yAreaAccordionEl mais abaixo. Ver
// MIGRATION-BETA-TO-MAIN.md.
// Subaccordion por categoria (elemento/estrutura/titulo/decorativo/informacoes)
// dentro de cada Área. Nasce expandido por padrão — diferente do accordion de
// Área (que lembra estado via _a11yExpandedAreaIds), aqui não persistimos
// estado entre re-renders porque normalmente uma área tem poucas categorias
// populadas e o designer quer ver tudo de cara ao abrir a área; recolher é só
// pra reduzir ruído visual num caso pontual, não um hábito recorrente.
function _a11yCategoryAccordionEl(uid, catKey, catSpecs) {
  const meta = A11Y_CATEGORIES[catKey] || { label: _capitalizeFirst(catKey), icon: 'accessibility', color: '#0891B2', fill: '#E0F5FA' };
  return `
    <div class="rounded-lg border border-gray-100 dark:border-dark-line overflow-hidden ml-1" data-a11y-subcat="${escapeHtml(catKey)}">
      <div class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none bg-gray-50/60 dark:bg-dark-bg/30 hover:bg-gray-100/60 dark:hover:bg-dark-line/20 transition-colors"
        onclick="toggleA11yAreaAccordion('${uid}')">
        <div class="w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0" style="background-color:${meta.fill}">
          <i data-lucide="${meta.icon}" class="w-2.5 h-2.5" style="color:${meta.color}"></i>
        </div>
        <p class="flex-1 min-w-0 text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide truncate">${escapeHtml(meta.label)} (${catSpecs.length})</p>
        <i data-lucide="chevron-down" id="chevron-${uid}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0" style="transform:rotate(180deg)"></i>
      </div>
      <div id="body-${uid}" class="accordion-content border-t border-gray-50 dark:border-dark-line p-1.5 space-y-1.5">
        ${catSpecs.map(_a11ySpecItemHtml).join('')}
      </div>
    </div>
  `;
}
// ══ BETA-ONLY: a11y-subaccordions (fim) ══

// ══ BETA-ONLY: a11y-ordem-tabulacao-por-area (início) ══
// Markup da seção "Ordem de Tabulação" dentro do accordion de UMA área —
// reaproveitado tanto por _a11yAreaAccordionEl (área real, com botões de
// criação) quanto por _a11ySemAreaAccordionEl (bucket "Sem área", read-only,
// sem botões — não há área real pra escopar clique manual ou varredura de
// camadas). O <ul> nasce vazio (id previsível ulId) e é preenchido depois,
// no DOM já inserido, por _renderTabOrderListForArea (ver chamada em
// renderA11yGroupedList) — não dá pra montar os <li> aqui porque esta função
// só produz string, e a numeração/ordenação real depende do estado vivo em
// tabOrderItems no momento do render.
function _tabOrderSectionHtml(uid, area) {
  const ulId = `tab-order-list-${uid}`;
  const readOnly = !area;
  const areaIdAttr = area ? area.id : '__sem_area__';

  if (readOnly) {
    return `
      <div class="rounded-lg border border-gray-100 dark:border-dark-line overflow-hidden ml-1">
        <div class="flex items-center gap-2 px-2 py-1.5 bg-gray-50/60 dark:bg-dark-bg/30">
          <div class="w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 bg-gray-100 dark:bg-dark-line/40">
            <i data-lucide="list-ordered" class="w-2.5 h-2.5 text-gray-400"></i>
          </div>
          <p class="flex-1 min-w-0 text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide truncate">Ordem de Tabulação</p>
        </div>
        <div class="p-1.5">
          <ul id="${ulId}" class="flex flex-col gap-1.5 min-h-[10px]"></ul>
        </div>
      </div>
    `;
  }

  return `
    <div class="rounded-lg border border-gray-100 dark:border-dark-line overflow-hidden ml-1">
      <div class="flex items-center gap-2 px-2 py-1.5 bg-gray-50/60 dark:bg-dark-bg/30">
        <div class="w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0" style="background-color:#E0F5FA">
          <i data-lucide="list-ordered" class="w-2.5 h-2.5" style="color:#0891B2"></i>
        </div>
        <p class="flex-1 min-w-0 text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide truncate">Ordem de Tabulação</p>
      </div>
      <div class="p-1.5 space-y-1.5">
        <button type="button" data-tab-order-btn-toggle="${escapeHtml(areaIdAttr)}" onclick="toggleTabOrderMode('${escapeHtml(areaIdAttr)}', this)"
          class="w-full flex items-center justify-center gap-2 h-8 rounded-xl text-[10.5px] font-bold transition-all bg-[#0891B2] text-white hover:bg-cyan-700 active:scale-[0.99] shadow-sm shadow-cyan-500/20">
          <i data-lucide="list-ordered" class="w-3.5 h-3.5" aria-hidden="true"></i>
          <span data-tab-order-toggle-label>Iniciar Ordem de Tabulação</span>
        </button>
        <button type="button" onclick="_confirmGenerateTabOrderFromLayers('${escapeHtml(areaIdAttr)}', '${escapeHtml(area.targetNodeId || '')}')"
          class="w-full flex items-center justify-center gap-2 h-8 rounded-xl text-[10.5px] font-bold transition-all border border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 active:scale-[0.99]">
          <i data-lucide="sparkles" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Gerar Automaticamente
        </button>
        <ul id="${ulId}" class="flex flex-col gap-1.5 min-h-[10px]"></ul>
        <button type="button" onclick="updateTabOrderNumbering('${escapeHtml(areaIdAttr)}')"
          class="w-full flex items-center justify-center gap-2 h-7 mt-1 rounded-2xl text-[10.5px] font-bold border border-gray-200 dark:border-dark-line text-slate-600 dark:text-dark-muted hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-slate-300 transition-all">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Atualizar
        </button>
      </div>
    </div>
  `;
}
// ══ BETA-ONLY: a11y-ordem-tabulacao-por-area (fim) ══

function _a11yAreaAccordionEl(area, areaSpecs) {
  const uid = `a11y-area-${area.originalIndex}`;
  const expand = window._a11yExpandedAreaIds.has(area.id);
  const li = document.createElement('li');
  li.className = 'list-none bg-white dark:bg-dark-surface rounded-xl border border-gray-100 dark:border-dark-line overflow-hidden';
  li.setAttribute('data-a11y-area', area.id); // BETA-ONLY: specs-busca-filtro
  li.setAttribute('data-a11y-area-search', escapeHtml(_normalizeSearchText(area.label))); // BETA-ONLY: specs-busca-filtro
  li.innerHTML = `
    <div class="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors"
      onclick="toggleA11yAreaAccordion('${uid}', '${area.id}')">
      <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shrink-0" style="background-color:#0070AF">${escapeHtml(String(area.number))}</div>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-slate-700 dark:text-white break-words leading-snug">${escapeHtml(area.label || '')}</p>
        <p class="text-[9px] text-slate-400 dark:text-dark-muted">${areaSpecs.length} especificaç${areaSpecs.length === 1 ? 'ão' : 'ões'}</p>
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
      <button type="button" title="Remover área" aria-label="Remover área"
        onclick="event.stopPropagation(); deleteA11yArea(${area.originalIndex})"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
      <i data-lucide="chevron-down" id="chevron-${uid}" class="w-4 h-4 text-gray-400 transition-transform shrink-0" style="transform:${expand ? 'rotate(180deg)' : 'rotate(0deg)'}"></i>
    </div>
    <div id="body-${uid}" class="accordion-content ${expand ? '' : 'hidden'} border-t border-gray-50 dark:border-dark-line p-2 space-y-2">
      <!-- BETA-ONLY: a11y-subaccordions — antes era areaSpecs.map(_a11ySpecItemHtml)
           direto, sem agrupar por categoria dentro da área. -->
      ${areaSpecs.length > 0
        ? Object.keys(A11Y_CATEGORIES)
            .map(catKey => ({ catKey, catSpecs: areaSpecs.filter(s => s.a11yType === catKey) }))
            .filter(({ catSpecs }) => catSpecs.length > 0)
            .map(({ catKey, catSpecs }) => _a11yCategoryAccordionEl(`${uid}-cat-${catKey}`, catKey, catSpecs))
            .join('')
        : `<p class="text-[10px] text-slate-400 dark:text-dark-muted text-center py-3">Nenhuma especificação nesta área ainda. Use o botão "+" acima.</p>`}
      <!-- BETA-ONLY: a11y-ordem-tabulacao-por-area — seção escopada a esta área. -->
      ${_tabOrderSectionHtml(uid, area)}
    </div>
  `;
  return li;
}

// Bucket "Sem área" — specs que não têm a11yAreaId (dado de testes anteriores
// a esta reformulação; não deveria mais acontecer no fluxo novo, área é
// pré-requisito pra criar spec). Nunca tenta adivinhar a área certa.
// BETA-ONLY: a11y-ordem-tabulacao-por-area — também acolhe itens de Ordem de
// Tabulação legados sem a11yAreaId, na mesma vitrine read-only (sem botões
// de criação — não há área real pra escopar clique manual ou varredura).
function _a11ySemAreaAccordionEl(specs, tabItemsCount) {
  const uid = 'a11y-area-sem';
  const li = document.createElement('li');
  li.className = 'list-none bg-white dark:bg-dark-surface rounded-xl border border-amber-200 dark:border-amber-800/40 overflow-hidden';
  li.setAttribute('data-a11y-area', '__sem_area__'); // BETA-ONLY: specs-busca-filtro
  li.setAttribute('data-a11y-area-search', 'sem area'); // BETA-ONLY: specs-busca-filtro
  const parts = [`${specs.length} especificaç${specs.length === 1 ? 'ão' : 'ões'}`];
  if (tabItemsCount > 0) parts.push(`${tabItemsCount} item${tabItemsCount === 1 ? '' : 'ns'} de ordem de tabulação`);
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

// ══ BETA-ONLY: a11y-ordenacao-espacial (início) ══
// A listagem agrupada (renderA11yGroupedList) ordenava as specs de cada área
// alfabeticamente pela tag (letter), o que reflete ORDEM DE CRIAÇÃO, não a
// ordem real de leitura de tela (esquerda→direita, cima→baixo). Aqui só a
// EXIBIÇÃO muda — tags/selos no canvas continuam intocados.
//
// Cache em memória (não persiste entre sessões/reload do plugin — é só pra
// não repetir a mesma consulta de bounds a cada re-render dentro da mesma
// sessão da UI). Chave: targetNodeId; valor: {x,y} ou null (node não existe
// mais / sem absoluteBoundingBox).
window._a11yNodeBoundsCache = window._a11yNodeBoundsCache || {};

// Tolerância (px) pra considerar duas specs "na mesma linha de leitura"
// antes de desempatar por y e cair no desempate final por x. Valor escolhido
// sem dado da vertical de a11y — 24px cobre a maioria dos selos/cards
// pequenos do canvas sem juntar linhas genuinamente distintas; ajustar se
// a vertical validar um valor melhor.
const A11Y_SPATIAL_ROW_THRESHOLD = 24;

function _a11ySortSpecsSpatially(specsList) {
  const cache = window._a11yNodeBoundsCache;
  return specsList.slice().sort((a, b) => {
    const boundsA = a.targetNodeId ? cache[a.targetNodeId] : undefined;
    const boundsB = b.targetNodeId ? cache[b.targetNodeId] : undefined;
    if (!boundsA || !boundsB) {
      return String(a.letter || '').localeCompare(String(b.letter || ''));
    }
    if (Math.abs(boundsA.y - boundsB.y) > A11Y_SPATIAL_ROW_THRESHOLD) {
      return boundsA.y - boundsB.y;
    }
    return boundsA.x - boundsB.x;
  });
}

// Coleta os targetNodeId ainda não cacheados (de todas as specs passadas,
// tipicamente todas as visíveis na listagem inteira) e consulta o backend
// de uma vez só. Re-renderiza ao final — chamada "fire and forget" a partir
// de renderA11yGroupedList, que já rendeu uma vez com o fallback alfabético
// enquanto a consulta está em voo (evita bloquear a UI, aceita um re-render
// rápido em vez de esperar a resposta antes do primeiro paint).
function _a11yQueueBoundsResolution(specsList) {
  const cache = window._a11yNodeBoundsCache;
  const missingIds = Array.from(new Set(
    specsList
      .map(s => s.targetNodeId)
      .filter(id => id && !(id in cache))
  ));
  if (missingIds.length === 0) return;

  parent.postMessage({ pluginMessage: { type: 'resolve-nodes-bounds', ids: missingIds } }, '*');
}
// ══ BETA-ONLY: a11y-ordenacao-espacial (fim) ══

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

  const hint = document.getElementById('hint-a11y-areas');
  if (hint) hint.classList.toggle('hidden', areas.length > 0);

  // Marcar Área é pré-requisito: sem nenhuma área, nem mostramos a lista —
  // orienta a marcar a primeira antes de anotar qualquer spec.
  if (areas.length === 0) {
    list.innerHTML = `
      <li class="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500 list-none">
        <div class="relative mb-4">
          <i data-lucide="map-pin" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
        </div>
        <p class="text-[12px] font-bold text-slate-500 dark:text-dark-muted text-center px-4 mb-1">Nenhuma área marcada ainda</p>
        <p class="text-[10px] text-slate-400 dark:text-dark-muted text-center px-6">Toque em "Marcar Área" no topo para identificar a primeira seção da tela — as especificações de acessibilidade nascem dentro de uma área.</p>
      </li>
    `;
    _refreshIcons();
    return;
  }

  areas.forEach(area => {
    const areaSpecs = _a11ySortSpecsSpatially( // BETA-ONLY: a11y-ordenacao-espacial
      specs.filter(s => s.a11yAreaId === area.id)
    );
    const areaLi = _a11yAreaAccordionEl(area, areaSpecs);
    list.appendChild(areaLi);
    // BETA-ONLY: a11y-ordem-tabulacao-por-area — o <ul> nasce vazio no
    // template de _a11yAreaAccordionEl; preenche agora que já está no DOM.
    const uid = `a11y-area-${area.originalIndex}`;
    _renderTabOrderListForArea(area.id, document.getElementById(`tab-order-list-${uid}`));
  });

  const semArea = _a11ySortSpecsSpatially( // BETA-ONLY: a11y-ordenacao-espacial
    specs.filter(s => !s.a11yAreaId || !areas.some(a => a.id === s.a11yAreaId))
  );
  // BETA-ONLY: a11y-ordem-tabulacao-por-area — itens legados sem a11yAreaId
  // válido (área inexistente/excluída) também entram no bucket "Sem área".
  const semAreaTabItems = _currentTabOrderItems('__sem_area__');
  if (semArea.length > 0 || semAreaTabItems.length > 0) {
    const semLi = _a11ySemAreaAccordionEl(semArea, semAreaTabItems.length);
    list.appendChild(semLi);
    if (semAreaTabItems.length > 0) {
      _renderTabOrderListForArea('__sem_area__', document.getElementById('tab-order-list-a11y-area-sem'));
    }
  }

  _refreshIcons();
  _setupA11ySearchBar(); // BETA-ONLY: specs-busca-filtro
  _a11yQueueBoundsResolution(specs); // BETA-ONLY: a11y-ordenacao-espacial
}
window.renderA11yGroupedList = renderA11yGroupedList;

// ══ BETA-ONLY: specs-busca-filtro (início, aba Acessibilidade) ══
// Depende de: #a11y-search-bar/#a11y-search-input/#a11y-category-filter/
// #a11y-search-empty (views/specifications.html), data-a11y-area/
// data-a11y-spec-item/data-a11y-category/data-a11y-search/data-a11y-subcat
// (funções de render acima neste arquivo). Ver MIGRATION-BETA-TO-MAIN.md.
// ── Busca + filtro por categoria (aba Acessibilidade) ───────────────────
// Mesmo padrão da aba Specs (ver _setupSpecsSearchBar em specifications.js):
// filtro só de EXIBIÇÃO sobre a lista já renderizada, não persiste entre
// sessões, não altera a11ySpecs/a11yAreas. Estrutura em 3 níveis (Área >
// subaccordion de categoria > spec) — um nível só some se TODOS os filhos
// não baterem o filtro, pra nunca deixar accordion pai vazio visível.
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
// ══ BETA-ONLY: specs-busca-filtro (fim, aba Acessibilidade) ══

// Wrappers pra não quebrar chamadores existentes (core.js syncAndRenderSpecs,
// messages.js, specifications.js switchSpecsMainTab) que ainda pedem a lista
// de specs ou a de áreas separadamente — agora ambos renderizam o mesmo
// accordion unificado.
function renderA11ySpecsList() { renderA11yGroupedList(); }
window.renderA11ySpecsList = renderA11ySpecsList;
function renderA11yAreasList() { renderA11yGroupedList(); }
window.renderA11yAreasList = renderA11yAreasList;

// ══ BETA-ONLY: a11y-deteccao-automatica (bloco grande — Detecção Automática
// pós-Marcar-Área + Fase 3 "Gerar Handoff Automatizado") (início) ══
// Depende de: #a11y-post-area-detect-modal/#a11y-batch-summary-modal
// (modals.html), a11y-area-created/scan-result com origin (messages.js),
// dscComponentMatch no scan (code.js). Ver MIGRATION-BETA-TO-MAIN.md, seção 4.
// ── Detecção Automática pós-Marcar-Área (Fase 2, revisada 2026-08) ──────
// Antes existia um botão solto "Detectar Componentes" sempre visível na aba
// Acessibilidade, dependente de activeFrameId (setado só pelo seletor "Frames
// Mapeados" da aba Escanear Tokens — controle desrelacionado a este fluxo).
// Se o designer nunca mexesse nesse seletor, activeFrameId ficava null pra
// sempre e o botão não fazia nada, sem aviso (bug de raiz). Resolvido por
// eliminação: a detecção agora nasce escopada ao elemento que ACABOU de virar
// Área (targetNodeId, já resolvido no backend em create-a11y-area) — nunca
// mais depende de activeFrameId pra saber "o quê" escanear.
//
// Fluxo: a11y-area-created (messages.js) guarda o contexto pendente em
// window._a11yPendingDetectionArea e abre #a11y-post-area-detect-modal. Um
// único modal evolui pergunta → loading → resultado (ver estados
// #a11y-post-area-ask/-loading/-result em modals.html), reaproveitando o
// mesmo HTML/classes de item que a extinta renderA11yDetections desenhava —
// só o container de destino mudou. Se activeFrameId existir (designer também
// usa a aba Escanear Tokens), o resultado é persistido em frame.a11yDetections
// como antes; se não existir, funciona igual mas guarda o resultado em
// window._a11yLooseDetections (não perde a função, só não fica atrelado a
// nenhum frame no schema salvo).
function openA11yPostAreaDetectModal(area) {
  if (!area || !area.targetNodeId) return;
  window._a11yPendingDetectionArea = {
    targetNodeId: area.targetNodeId,
    areaId: area.id,
    label: area.label,
  };
  const ask = document.getElementById('a11y-post-area-ask');
  const loading = document.getElementById('a11y-post-area-loading');
  const result = document.getElementById('a11y-post-area-result');
  const footerAsk = document.getElementById('a11y-post-area-footer-ask');
  const footerResult = document.getElementById('a11y-post-area-footer-result');
  if (ask) ask.classList.remove('hidden');
  if (loading) loading.classList.add('hidden');
  if (result) result.classList.add('hidden');
  if (footerAsk) footerAsk.classList.remove('hidden');
  if (footerResult) footerResult.classList.add('hidden');
  openModal('a11y-post-area-detect-modal');
}
window.openA11yPostAreaDetectModal = openA11yPostAreaDetectModal;

function closeA11yPostAreaDetectModal() {
  closeModal('a11y-post-area-detect-modal');
  window._a11yPendingDetectionArea = null;
}
window.closeA11yPostAreaDetectModal = closeA11yPostAreaDetectModal;

// Agrega os 4 buckets do scan (components/icons/typography/vectors) que
// vierem com dscComponentMatch preenchido — components/icons cobrem os 16
// componentes reais do DSC (confidence pode ser 'alta' ou 'baixa');
// typography/vectors só existem por heurística de nome de camada/estilo
// (categorias 'titulo'/'decorativo' — ver _resolveTypographyA11yMatch/
// _resolveDecorativeA11yMatch em code.js) e por isso vêm sempre 'baixa'.
// Usado tanto no fluxo pós-Marcar-Área quanto no scan normal de Tokens
// (messages.js, handler scan-result) — ver ambos os pontos de chamada.
function _collectA11yDetections(data) {
  if (!data) return [];
  return [
    ...(data.components || []),
    ...(data.icons || []),
    ...(data.typography || []),
    ...(data.vectors || []),
  ].filter(c => c && c.dscComponentMatch);
}
window._collectA11yDetections = _collectA11yDetections;

// Dispara o mesmo scan de conformidade DSC usado pela aba "Escanear Tokens"
// (postMessage scan-frame), mas escopado ao targetNodeId da área (não mais ao
// frame inteiro) e com origin: 'a11y-detection' — o backend só repassa esse
// campo de volta na resposta; é o handler scan-result (messages.js) que usa
// esse campo pra rotear a resposta pra cá em vez do fluxo normal de tokens.
function runA11yPostAreaDetection() {
  const pending = window._a11yPendingDetectionArea;
  if (!pending || !pending.targetNodeId) return;

  const ask = document.getElementById('a11y-post-area-ask');
  const loading = document.getElementById('a11y-post-area-loading');
  const footerAsk = document.getElementById('a11y-post-area-footer-ask');
  if (ask) ask.classList.add('hidden');
  if (loading) loading.classList.remove('hidden');
  if (footerAsk) footerAsk.classList.add('hidden');

  parent.postMessage({
    pluginMessage: {
      type: 'scan-frame',
      frameId: activeFrameId || null,
      nodeId: pending.targetNodeId,
      isAudit: false,
      referenceTokens: null,
      selectedLibSlugs: null,
      categories: null,
      origin: 'a11y-detection'
    }
  }, '*');
}
window.runA11yPostAreaDetection = runA11yPostAreaDetection;

// Chamado pelo handler scan-result (messages.js) quando origin ===
// 'a11y-detection' — recebe as detecções já filtradas (components com
// dscComponentMatch) e desenha o estado de resultado dentro do modal aberto
// por runA11yPostAreaDetection. Persiste em frame.a11yDetections quando há
// activeFrameId (best-effort, mantém compatibilidade com quem também usa a
// aba Escanear Tokens); sem frame ativo, guarda em window._a11yLooseDetections
// só pra alimentar o botão de lote nesta sessão do modal.
function handleA11yPostAreaDetectionResult(detections) {
  window._a11yLooseDetections = detections;

  const loading = document.getElementById('a11y-post-area-loading');
  const result = document.getElementById('a11y-post-area-result');
  const footerResult = document.getElementById('a11y-post-area-footer-result');
  if (loading) loading.classList.add('hidden');
  if (result) result.classList.remove('hidden');
  if (footerResult) footerResult.classList.remove('hidden');

  const emptyEl = document.getElementById('a11y-post-area-result-empty');
  const foundEl = document.getElementById('a11y-post-area-result-found');
  const list = document.getElementById('a11y-post-area-results-list');
  const batchBtn = document.getElementById('btn-a11y-post-area-batch-generate');

  if (!detections || detections.length === 0) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (foundEl) foundEl.classList.add('hidden');
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');
  if (foundEl) foundEl.classList.remove('hidden');

  const alta = detections.filter(d => d.dscComponentMatch.confidence === 'alta');
  const baixa = detections.filter(d => d.dscComponentMatch.confidence !== 'alta');

  // shortName aqui pode ser (a) um dos 16 componentes reais do catálogo
  // "elemento" (A11Y_COMPONENTE_LABELS) ou (b) a própria chave de categoria
  // 'titulo'/'decorativo' quando a detecção veio de heurística de texto/ícone
  // (ver _resolveTypographyA11yMatch/_resolveDecorativeA11yMatch em code.js)
  // — essas duas não têm entrada em A11Y_COMPONENTE_LABELS, então cai no
  // label da categoria inteira (A11Y_CATEGORIES).
  const _a11yDetectionLabel = (shortName) => {
    if (shortName === 'titulo' || shortName === 'decorativo') {
      return A11Y_CATEGORIES[shortName] ? A11Y_CATEGORIES[shortName].label : _capitalizeFirst(shortName);
    }
    return A11Y_COMPONENTE_LABELS[shortName] || _capitalizeFirst(shortName);
  };

  // BETA-ONLY: a11y-injecao-em-massa — item passou a ser só informativo (sem
  // ação de clique). O único caminho de criação agora é o lote
  // (confirmA11yBatchGenerate); o botão "Usar sugestão" por item foi removido
  // por decisão de produto (fluxo individual descontinuado).
  const itemHtml = (item, confidence) => {
    const shortName = item.dscComponentMatch.a11yCategory;
    const label = _a11yDetectionLabel(shortName);
    const isBaixa = confidence !== 'alta';
    return `
      <li class="list-none flex items-center gap-2 px-2.5 py-2 rounded-xl border ${isBaixa ? 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40' : 'bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-line'}">
        <div class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isBaixa ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-[#FFF6DC] text-[#FCBE05]'}">
          <i data-lucide="${isBaixa ? 'help-circle' : 'sparkles'}" class="w-3.5 h-3.5"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-semibold text-slate-700 dark:text-white truncate">${escapeHtml(item.name || 'Elemento')}</p>
          <p class="text-[9px] text-slate-400 dark:text-dark-muted truncate">Sugestão: ${escapeHtml(label)}</p>
        </div>
      </li>
    `;
  };

  const blockHtml = (title, icon, items, confidence) => {
    if (items.length === 0) return '';
    return `
      <div class="mb-2">
        <div class="flex items-center gap-1.5 mb-1.5">
          <i data-lucide="${icon}" class="w-3 h-3 ${confidence === 'alta' ? 'text-slate-400' : 'text-amber-500'}"></i>
          <span class="text-[9px] font-bold uppercase tracking-wider ${confidence === 'alta' ? 'text-slate-400 dark:text-dark-muted' : 'text-amber-600 dark:text-amber-400'}">${title}</span>
        </div>
        <ul class="flex flex-col gap-1.5">
          ${items.map(i => itemHtml(i, confidence)).join('')}
        </ul>
      </div>
    `;
  };

  if (list) {
    list.innerHTML =
      blockHtml('Detectado automaticamente', 'check-circle-2', alta, 'alta') +
      blockHtml('Confirmar categoria', 'alert-triangle', baixa, 'baixa');
  }

  // "Gerar Handoff Automatizado" em lote — único caminho de criação a partir
  // da Detecção Automática (ver BETA-ONLY: a11y-injecao-em-massa). Só faz
  // sentido oferecer se houver ao menos 1 item elegível — ver
  // _filterA11yBatchEligible (inclui 'elemento', 'titulo' e 'decorativo').
  if (batchBtn) batchBtn.classList.toggle('hidden', _filterA11yBatchEligible(detections).length === 0);

  _refreshIcons();
}
window.handleA11yPostAreaDetectionResult = handleA11yPostAreaDetectionResult;

// BETA-ONLY: a11y-injecao-em-massa — useA11yDetection (fluxo individual de
// "Usar sugestão" por item) foi removida por decisão de produto. O único
// caminho de criação a partir da Detecção Automática agora é o lote
// (confirmA11yBatchGenerate, abaixo), que já cria todas as specs elegíveis
// de uma vez (alta e baixa confiança) sem confirmação item a item.

// ── Fase 3: "Gerar Handoff Automatizado" (lote) ─────────────────────────
// Processa as detecções da área/frame corrente (alta E baixa confiança,
// ver _currentA11yDetectionsSource) de uma vez: mostra um modal de resumo
// agregado, o designer escolhe a Área de destino (pré-requisito — toda spec
// de A11y precisa de a11yAreaId) e confirma uma única vez.
//
// BETA-ONLY: a11y-injecao-em-massa — o lote é o ÚNICO caminho de criação a
// partir da Detecção Automática (fluxo individual "Usar sugestão" removido).
// _filterA11yBatchEligible inclui 'titulo'/'decorativo' (sempre confidence
// 'baixa') com o default mais comum (H1, subtipo "gerais") — o designer
// revisa/corrige depois via o badge "Verificar" na listagem (ver
// _a11ySpecItemHtml), em vez de confirmar item a item antes de criar.
function _allA11yAreas() {
  return [
    ...(a11yAreas || []),
    ...(handoffData.frames || []).flatMap(f => f.a11yAreas || []),
  ];
}

// Todo item com dscComponentMatch é elegível pro lote — inclui 'titulo'
// (nasce como H1, ver _buildA11yTituloPayload) e 'decorativo' (nasce como
// subtipo "gerais", ver _buildA11yDecorativoPayload), sempre com o default
// mais comum. Decisão consciente do usuário: velocidade acima de precisão
// perfeita — o designer revisa/corrige nível de título e subtipo decorativo
// manualmente depois, em vez de precisar confirmar item a item no lote.
function _filterA11yBatchEligible(detections) {
  return (detections || []).filter(d => d && d.dscComponentMatch && d.dscComponentMatch.a11yCategory);
}

// Fonte das detecções pro lote: prioriza frame.a11yDetections (quando há
// activeFrameId, ver comentário de handleA11yPostAreaDetectionResult), com
// fallback pra window._a11yLooseDetections (fluxo pós-área sem frame ativo,
// caso comum do designer que nunca mexeu no seletor "Frames Mapeados").
function _currentA11yDetectionsSource() {
  const frame = activeFrameId ? getFrame(activeFrameId) : null;
  if (frame && frame.a11yDetections && frame.a11yDetections.length > 0) return frame.a11yDetections;
  return window._a11yLooseDetections || [];
}

function openA11yBatchSummaryModal() {
  const allDetections = _currentA11yDetectionsSource();
  const detections = _filterA11yBatchEligible(allDetections);
  const skippedCount = allDetections.length - detections.length;
  if (detections.length === 0) return;

  const areas = _allA11yAreas();
  if (areas.length === 0) {
    showToast('Marque uma área da tela antes de gerar o handoff automatizado.');
    return;
  }

  // Agrupa por shortName de componente + confiança, pra mostrar contagem
  // agregada ("2 Accordion (alta confiança)") em vez de listar item a item.
  const groups = {};
  detections.forEach(item => {
    const shortName = item.dscComponentMatch.a11yCategory;
    const confidence = item.dscComponentMatch.confidence === 'alta' ? 'alta' : 'baixa';
    const key = shortName + '|' + confidence;
    if (!groups[key]) groups[key] = { shortName, confidence, count: 0 };
    groups[key].count++;
  });
  const groupList = Object.values(groups).sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'alta' ? -1 : 1;
    return (A11Y_COMPONENTE_LABELS[a.shortName] || a.shortName).localeCompare(A11Y_COMPONENTE_LABELS[b.shortName] || b.shortName);
  });

  const groupsWrap = document.getElementById('a11y-batch-summary-groups');
  if (groupsWrap) {
    groupsWrap.innerHTML = groupList.map(g => {
      const label = A11Y_COMPONENTE_LABELS[g.shortName] || _capitalizeFirst(g.shortName);
      const isBaixa = g.confidence !== 'alta';
      return `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl border ${isBaixa ? 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40' : 'bg-gray-50 dark:bg-dark-bg border-gray-100 dark:border-dark-line'}">
          <div class="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-extrabold ${isBaixa ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-[#FFF6DC] text-[#FCBE05]'}">${g.count}</div>
          <p class="flex-1 text-[11px] font-semibold text-slate-700 dark:text-white">${escapeHtml(label)}</p>
          <span class="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isBaixa ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-dark-muted'}">${isBaixa ? 'Baixa confiança' : 'Alta confiança'}</span>
        </div>
      `;
    }).join('');
  }

  const areaSelect = document.getElementById('a11y-batch-area-select');
  const areaWrap = document.getElementById('a11y-batch-area-wrap');
  if (areaSelect) {
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

  const confirmBtn = document.getElementById('btn-a11y-batch-confirm');
  if (confirmBtn) {
    confirmBtn.textContent = `Criar ${detections.length} Especifica${detections.length === 1 ? 'ção' : 'ções'}`;
    confirmBtn.disabled = false;
  }

  // Hoje _filterA11yBatchEligible não exclui mais nenhuma categoria (titulo/
  // decorativo entram no lote com defaults) — skippedCount deve ficar sempre
  // 0, mas mantém o aviso condicional caso uma categoria futura precise de
  // exclusão de novo (evita reintroduzir esse bloco do zero).
  const skippedNotice = document.getElementById('a11y-batch-summary-skipped-notice');
  if (skippedNotice) {
    if (skippedCount > 0) {
      skippedNotice.textContent = `${skippedCount} item${skippedCount === 1 ? '' : 'ns'} não ${skippedCount === 1 ? 'entra' : 'entram'} neste lote.`;
      skippedNotice.classList.remove('hidden');
    } else {
      skippedNotice.classList.add('hidden');
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
// backend calcula posição/import da lib de forma assíncrona por chamada; sem
// serializar, duas criações concorrentes poderiam colidir (ex: cálculo de
// posição do próximo card, ou duas leituras de figma.currentPage.selection
// se o usuário mexer no canvas no meio do lote). Timeout de segurança evita
// travar o lote inteiro se uma resposta nunca chegar (ex: erro silencioso).
function _createA11ySpecAndWait(opts) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window._a11yBatchCreateResolve = null;
      resolve(ok);
    };
    const timeoutId = setTimeout(() => finish(false), 8000);
    window._a11yBatchCreateResolve = (ok) => { clearTimeout(timeoutId); finish(ok); };
    parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
  });
}

// IDs (node.id reais no canvas) das specs já criadas na mesma Área Marcada E
// na mesma categoria (a11yType) — usado pelo backend (create-unified-spec,
// code.js) pra alinhar o card novo na mesma SUB-COLUNA X das demais specs da
// área+categoria, independente de letra/lado do conector. Categorias
// diferentes da mesma área ganham colunas X distintas (ver _areaMap em
// code.js, chave composta areaId::a11yType) — por isso o filtro aqui precisa
// dos dois campos, não só da área. a11ySpecs já é o merge consolidado
// (avulsas + de todos os frames, ver syncAndRenderSpecs em core.js), então um
// único filtro cobre os dois contextos sem precisar checar activeFrameId.
function _collectAreaSiblingSpecIds(areaId, a11yType) {
  if (!areaId) return [];
  return (a11ySpecs || [])
    .filter(s => s && s.a11yAreaId === areaId && s.a11yType === a11yType && s.id)
    .map(s => s.id);
}

// Todas as specs da mesma área, de QUALQUER categoria — usado pelo backend
// só quando a categoria da spec sendo criada ainda não tem nenhuma spec na
// área (existingAreaSpecIds vem vazio nesse caso): precisa achar a coluna
// mais à direita já ocupada por OUTRA categoria da mesma área pra posicionar
// a nova sub-coluna ao lado dela, e não em relação ao canvas inteiro (ver
// _areaMap em code.js, create-unified-spec).
function _collectAreaAllSpecIds(areaId) {
  if (!areaId) return [];
  return (a11ySpecs || [])
    .filter(s => s && s.a11yAreaId === areaId && s.id)
    .map(s => s.id);
}

// Próxima letra livre DENTRO DA ÁREA de destino — não usar _suggestNextSpecTag
// aqui: ela conta specs avulsas de todo o projeto/frame quando activeFrameId é
// null (caso comum no fluxo pós-Marcar-Área), o que fazia o lote começar em
// letras tipo "K" mesmo numa área nova, sem nenhuma relação com o que já
// existe ali. Cada área tem seu próprio namespace de letras.
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

// BETA-ONLY: a11y-inferencia-variante-lote — Fase 1 do "mapeamento profundo"
// pedido pelo designer (ver MIGRATION-BETA-TO-MAIN.md). Cruza as variantes
// REAIS do componente DSC detectado no canvas (item.variants, já vêm do scan
// — ver extractNodeProperties/addElement, code.js) com a variante secundária
// ("tipo") do catálogo de a11y, pra não deixar todo item do lote nascer com
// o default (ex: um Button já desabilitado no canvas vira spec "default" em
// vez de "desabilitado"). Só cobre os pares com correspondência CLARA e
// confirmada contra a lib real — não é heurística especulativa. Nenhum outro
// componente (checkbox/radio/switch/...) tem correspondência segura hoje:
// os variantOptions deles são sobre presença de rótulo/agrupamento, não
// estado, e não dá pra inferir isso a partir das variantes do DSC.
function _inferA11yVariantFromDsc(shortName, itemVariants) {
  const variants = Array.isArray(itemVariants) ? itemVariants : [];
  const has = (propName, propValue) => variants.some(v =>
    v && String(v.name || '').trim().toLowerCase() === propName
      && String(v.value || '').trim().toLowerCase() === propValue
  );

  if (shortName === 'button') {
    // Prioridade: estado tem precedência sobre variação visual — um botão
    // desabilitado E de ícone documenta-se primeiro como "desabilitado"
    // (é a informação mais crítica pro leitor de tela).
    if (has('state', 'disabled')) return 'desabilitado';
    if (has('icon only', 'true')) return 'de icone';
    return null;
  }
  if (shortName === 'inputs') {
    if (has('state', 'readonly')) return 'somente leitura';
    return null;
  }
  return null;
}

// Confirma o lote: para cada detecção, monta letra sequencial + payload puro
// (_buildA11yElementoPayload) e chama create-unified-spec SEQUENCIALMENTE
// (await uma de cada vez, ver _createA11ySpecAndWait) — nunca em paralelo.
async function confirmA11yBatchGenerate() {
  const detections = window._a11yBatchDetections || [];
  const areaSelect = document.getElementById('a11y-batch-area-select');
  const areaId = areaSelect ? areaSelect.value : null;
  if (!areaId) {
    showToast('Selecione a área de destino.');
    return;
  }

  const confirmBtn = document.getElementById('btn-a11y-batch-confirm');
  if (confirmBtn) confirmBtn.disabled = true;
  closeA11yBatchSummaryModal();

  window._a11yExpandedAreaIds = window._a11yExpandedAreaIds || new Set();
  window._a11yExpandedAreaIds.add(areaId);

  let created = 0;
  let failed = 0;
  // Tag sequencial: começa na próxima letra livre do frame e avança uma por
  // item criado — reaproveita _suggestNextSpecTag pro ponto de partida, mas
  // não pode chamar de novo a cada iteração (ela só enxerga specs JÁ
  // salvas em a11ySpecs/createdSpecs, que só são atualizadas quando a
  // resposta 'spec-created' anterior chega — o awaiting sequencial garante
  // isso, mas recalcular a cada volta seria redundante e mais lento).
  let nextLetterIndex = 0;
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
  const startTag = _suggestNextA11yTagForArea(areaId);
  const startIndex = startTag.length === 1 ? startTag.charCodeAt(0) - 65 : 0;

  for (const item of detections) {
    const shortName = item.dscComponentMatch.a11yCategory;
    const letter = toLetters(startIndex + nextLetterIndex);
    nextLetterIndex++;
    // BETA-ONLY: a11y-injecao-em-massa — itens de baixa confiança nascem
    // marcados pra revisão (badge "Verificar" na listagem, ver
    // _a11ySpecItemHtml) já que não passam mais por confirmação item a item.
    const needsReview = item.dscComponentMatch.confidence !== 'alta';

    // 'titulo'/'decorativo' vêm da heurística de texto/ícone (ver
    // _resolveTypographyA11yMatch/_resolveDecorativeA11yMatch, code.js) — o
    // shortName JÁ É a12yType nesses casos, diferente de 'elemento' onde
    // shortName é o componente (button/checkbox/...) dentro da categoria fixa
    // 'elemento'. Cada categoria nasce com o default mais comum (H1, subtipo
    // "gerais") — decisão consciente do usuário de priorizar velocidade,
    // revisão manual depois.
    const a11yType = (shortName === 'titulo' || shortName === 'decorativo') ? shortName : 'elemento';
    // BETA-ONLY: a11y-inferencia-variante-lote — pré-seleciona a variante
    // secundária quando o componente real no canvas já sinaliza um estado/
    // variação com correspondência DSC conhecida (ver _inferA11yVariantFromDsc).
    // undefined (não null) pra cair no comportamento padrão já existente em
    // _buildA11yElementoPayload quando não há correspondência.
    const built = a11yType === 'titulo' ? _buildA11yTituloPayload(letter, item.name || 'Elemento')
      : a11yType === 'decorativo' ? _buildA11yDecorativoPayload(item.name || 'Elemento')
      : _buildA11yElementoPayload(letter, shortName, item.name || 'Elemento', {
        tipo: _inferA11yVariantFromDsc(shortName, item.variants) || undefined,
      });
    const catMeta = A11Y_CATEGORIES[a11yType];
    const opts = {
      category: 'acessibilidade',
      categoryLabel: catMeta.label,
      letter: built.letter,
      color: catMeta.color,
      fillColor: catMeta.fill,
      properties: built.properties,
      guideSide: 'right',
      drawMode: 'contorno',
      drawConnection: false,
      a11yType,
      a11ySubtype: built.a11ySubtype,
      a11yAreaId: areaId,
      // Recalculado a cada volta do loop sequencial — a11ySpecs já reflete a
      // spec anterior do próprio lote assim que 'spec-created' responde (ver
      // _createA11ySpecAndWait), então o card seguinte já enxerga a
      // sub-coluna certa (mesma área + mesma categoria).
      existingAreaSpecIds: _collectAreaSiblingSpecIds(areaId, a11yType),
      existingAreaAllSpecIds: _collectAreaAllSpecIds(areaId),
      targetNodeId: item.nodeId || null,
      needsReview,
    };
    const ok = await _createA11ySpecAndWait(opts);
    if (ok) created++; else failed++;
  }

  window._a11yBatchDetections = null;

  // Fecha o modal de Detecção Automática (pós-Marcar-Área) que ficava aberto
  // por cima da tela depois do lote terminar — o usuário criava as specs mas
  // continuava preso atrás do modal, sem ver o resultado na listagem de Áreas
  // Marcadas (que já reabre a área expandida, ver window._a11yExpandedAreaIds
  // logo acima). É um modal diferente do "resumo do lote" (já fechado no
  // início desta função) — precisa fechar os dois.
  if (typeof closeA11yPostAreaDetectModal === 'function') closeA11yPostAreaDetectModal();

  if (created > 0 && failed === 0) {
    showToast(`${created} especifica${created === 1 ? 'ção criada' : 'ções criadas'} — revise as de baixa confiança.`);
  } else if (created > 0 && failed > 0) {
    showToast(`${created} especifica${created === 1 ? 'ção criada' : 'ções criadas'}, ${failed} falharam — tente criar essas manualmente.`);
  } else {
    showToast('Não foi possível criar as especificações do lote.');
  }
}
window.confirmA11yBatchGenerate = confirmA11yBatchGenerate;
// ══ BETA-ONLY: a11y-deteccao-automatica (fim do bloco grande) ══

// Reversão da Fase 3: specs de A11y voltam a ter nó real no canvas desde a
// criação — remover a entrada também remove o nó (mesmo padrão de
// deleteSpecFromFrame em specifications.js e deleteA11yArea logo abaixo).
function deleteA11ySpec(originalIndex) {
  const spec = a11ySpecs[originalIndex];
  if (!spec) return;
  if (spec.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: spec.id } }, '*');
  }
  a11ySpecs.splice(originalIndex, 1);
  removeA11ySpecById(spec.id);
  saveSpecsToStorage();
  renderA11yGroupedList();
}
window.deleteA11ySpec = deleteA11ySpec;

// Mostrar/ocultar o nó da spec no canvas — mesmo par de mensagens
// ('hide-node'/'show-node') que specifications.js usa pra specs normais.
function toggleA11ySpecVisibility(originalIndex) {
  const spec = a11ySpecs[originalIndex];
  if (!spec || !spec.id) return;
  spec.visible = spec.visible === false ? true : false;
  parent.postMessage({ pluginMessage: { type: spec.visible === false ? 'hide-node' : 'show-node', id: spec.id } }, '*');
  saveToStorage();
  renderA11yGroupedList();
}
window.toggleA11ySpecVisibility = toggleA11ySpecVisibility;

// BETA-ONLY: a11y-toggle-visibilidade-tipo — dois atalhos de "tudo de uma
// vez" por TIPO de marcação no canvas, independentes do toggle por item
// acima (toggleA11ySpecVisibility): um pra todas as specs de leitor de tela
// (áreas marcadas + cards de a11y) e outro só pros selos de Ordem de
// Tabulação. A distinção de quem é o quê é feita no BACKEND direto no canvas
// (handler 'toggle-a11y-category-visibility', code.js), nunca a partir de
// a11ySpecs/tabOrderItems locais — que podem estar desatualizados se o
// designer mexeu manualmente no canvas. Estado local aqui só controla
// ícone/label do botão (efêmero, não persiste entre sessões).
let _a11ySpecsHiddenAll = false;
let _a11yTabOrderHiddenAll = false;

function _setA11yCategoryToggleBtnState(btnId, hidden, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.innerHTML = hidden
    ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i> Mostrar ${label}`
    : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i> Ocultar ${label}`;
  _refreshIcons();
}

function toggleAllA11ySpecsVisibility() {
  _a11ySpecsHiddenAll = !_a11ySpecsHiddenAll;
  _setA11yCategoryToggleBtnState('btn-hide-all-a11y-specs', _a11ySpecsHiddenAll, 'Specs');
  parent.postMessage({ pluginMessage: { type: 'toggle-a11y-category-visibility', category: 'specs', visible: !_a11ySpecsHiddenAll } }, '*');
}
window.toggleAllA11ySpecsVisibility = toggleAllA11ySpecsVisibility;

function toggleAllTabOrderVisibility() {
  _a11yTabOrderHiddenAll = !_a11yTabOrderHiddenAll;
  _setA11yCategoryToggleBtnState('btn-hide-all-tab-order', _a11yTabOrderHiddenAll, 'Ordem de Tabulação');
  parent.postMessage({ pluginMessage: { type: 'toggle-a11y-category-visibility', category: 'tabOrder', visible: !_a11yTabOrderHiddenAll } }, '*');
}
window.toggleAllTabOrderVisibility = toggleAllTabOrderVisibility;

// "Concluir posicionamento" — trava o specGroup no canvas (lock-spec já
// aceita o prefixo '[SpecA11y | ...]', ver regex em code.js). A UI só some o
// aviso "Posicionando…" quando a resposta 'spec-locked' chega (messages.js).
// Specs de A11y nascem travadas (ver messages.js, spec-created) — este
// toggle é o único jeito de mexer nelas depois, mesmo padrão de
// toggleSpecLock (specifications.js) pras specs normais.
function toggleA11ySpecLock(originalIndex) {
  const spec = a11ySpecs[originalIndex];
  if (!spec || !spec.id) return;
  const isNowUnlocked = spec.locked === false;
  spec.locked = isNowUnlocked ? true : false;
  parent.postMessage({ pluginMessage: { type: 'unlock-spec-group', specIds: [spec.id], locked: spec.locked } }, '*');
  saveSpecsToStorage();
  renderA11yGroupedList();
  showToast(isNowUnlocked
    ? 'Especificação travada novamente.'
    : 'Especificação destravada — edite com cuidado e trave novamente ao concluir.');
}
window.toggleA11ySpecLock = toggleA11ySpecLock;

// Abre o mesmo formulário usado pra criar (sem passar pelo seletor de
// categoria — a categoria de uma spec existente não muda, ver decisão do
// usuário) já preenchido com os dados atuais. confirmA11ySpec detecta
// modal.dataset.editingSpecId e, em vez de só criar, apaga o nó antigo no
// canvas e recria com os valores atualizados (ver confirmA11ySpec).
function editA11ySpec(originalIndex) {
  const spec = a11ySpecs[originalIndex];
  if (!spec || !spec.a11yType) return;
  window._a11yPendingAreaId = spec.a11yAreaId || null;
  openA11yModal(spec.a11yType);
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
    if (el && val) el.value = val;
  };

  const tagInputId = A11Y_TAG_INPUT_ID[category];
  if (tagInputId) setVal(tagInputId, spec.letter || 'A');

  if (category === 'elemento') {
    const select = document.getElementById('a11y-el-componente-select');
    if (sub.isOutro) {
      if (select) select.value = 'outro';
      setVal('a11y-el-componente-outro', getProp('componente'));
    } else if (sub.componente && select) {
      select.value = sub.componente;
    }
    updateA11yElementoFields();
    setVal('a11y-el-label', getProp('label'));
    // Restaura a variante secundária salva (ex: Button → "de icone") —
    // updateA11yElementoFields acima já recriou o <select> pro componente
    // certo, aqui só aplicamos o valor gravado em cima do default.
    _restoreA11yElementoVariant(sub.tipo);
    // Restaura os toggles dinâmicos salvos (Nome Acessível/Observações/Notas
    // de Código) — updateA11yElementoFields acima já recriou a lista vazia
    // pro componente certo, aqui só religamos o que tinha valor gravado.
    _restoreA11yElementoToggles(props);
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
    // updateA11yEstruturaFields acima já recriou a lista de toggles vazia pro
    // sub-nível certo (EE idiomas/EE marco de navegacao/nenhum) — aqui só
    // religamos o que tinha valor gravado.
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
// nasce dentro de uma área (ver renderA11yGroupedList). Numeração sequencial
// por PROJETO inteiro (nunca reaproveita número de área excluída).
function openA11yAreaModal() {
  const input = document.getElementById('a11y-area-label-input');
  if (input) input.value = '';
  // ══ BETA-ONLY: a11y-marcar-area (início — trecho intercalado nesta função
  // pré-existente) ══
  const conectorDefault = document.querySelector('input[name="a11y-area-conector"][value="superior"]');
  if (conectorDefault) conectorDefault.checked = true;
  // Sugere o próximo número livre, mas deixa editável — o designer pode
  // querer reordenar áreas ou pular números de propósito.
  const numberInput = document.getElementById('a11y-area-number-input');
  if (numberInput) numberInput.value = _nextA11yAreaNumber();
  // ══ BETA-ONLY: a11y-marcar-area (fim do trecho acima) ══
  openModal('a11y-area-modal');
  setTimeout(() => { if (input) input.focus(); }, 50);
  // Pré-preenche com o nome do frame/elemento selecionado no canvas — só
  // cosmético, o designer pode sobrescrever antes de confirmar.
  _getA11ySelectionInfo().then(sel => {
    const modal = document.getElementById('a11y-area-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (input && !input.value && sel && sel.name) input.value = sel.name;
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
    if (input) input.value = sel.name;
  });
}
window.refreshA11yAreaLabelFromSelection = refreshA11yAreaLabelFromSelection;

function closeA11yAreaModal() {
  closeModal('a11y-area-modal');
}
window.closeA11yAreaModal = closeA11yAreaModal;

function _nextA11yAreaNumber() {
  const all = [
    ...(a11yAreas || []),
    ...(handoffData.frames || []).flatMap(f => f.a11yAreas || []),
  ];
  const max = all.reduce((m, a) => Math.max(m, (a && a.number) || 0), 0);
  return max + 1;
}

function confirmA11yArea() {
  const input = document.getElementById('a11y-area-label-input');
  const label = input ? input.value.trim() : '';
  if (!label) {
    showToast('Informe o rótulo da área.');
    return;
  }
  // BETA-ONLY: a11y-marcar-area (início — leitura dos 2 campos novos)
  const conectorInput = document.querySelector('input[name="a11y-area-conector"]:checked');
  const conector = conectorInput ? conectorInput.value : 'superior';
  const numberInput = document.getElementById('a11y-area-number-input');
  const number = numberInput && numberInput.value ? parseInt(numberInput.value, 10) : _nextA11yAreaNumber();
  // BETA-ONLY: a11y-marcar-area (fim)
  closeA11yAreaModal();
  _getA11ySelectionInfo().then(sel => {
    if (!sel || !sel.id) {
      showToast('Selecione um elemento no canvas antes de marcar a área.');
      return;
    }
    parent.postMessage({ pluginMessage: { type: 'create-a11y-area', targetNodeId: sel.id, label, number, conector } }, '*'); // BETA-ONLY: a11y-marcar-area — payload ganhou `conector`
  });
}
window.confirmA11yArea = confirmA11yArea;

// ══ BETA-ONLY: bugfixes-a11y-diversos (início) — exclusão de área em cascata
// (antes specs vinculadas viravam órfãs no bucket "Sem área"). Ver
// MIGRATION-BETA-TO-MAIN.md. ══
// Excluir uma área remove o selo do canvas, a entrada do array, E TODAS AS
// SPECS vinculadas a ela (a11yAreaId === area.id) — exclusão em cascata, sem
// confirmação extra (decisão do usuário). Antes as specs vinculadas viravam
// órfãs no bucket "Sem área"; isso deixava specs de canvas "mortas" (a área
// que as contextualizava já não existe mais). Specs que já eram avulsas
// (sem a11yAreaId, nunca tiveram área) continuam intocadas — só as que
// pertenciam especificamente a esta área é que somem junto.
function deleteA11yArea(originalIndex) {
  const area = a11yAreas[originalIndex];
  if (!area) return;

  const specsToRemove = (a11ySpecs || []).filter(s => s && s.a11yAreaId === area.id);
  specsToRemove.forEach(spec => {
    if (spec.id) parent.postMessage({ pluginMessage: { type: 'delete-node', id: spec.id } }, '*');
    removeA11ySpecById(spec.id);
  });
  if (specsToRemove.length > 0) {
    a11ySpecs = a11ySpecs.filter(s => !(s && s.a11yAreaId === area.id));
  }
  // ══ BETA-ONLY: bugfixes-a11y-diversos (fim) ══

  if (area.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: area.id } }, '*');
  }
  a11yAreas.splice(originalIndex, 1);
  removeA11yAreaById(area.id);
  saveSpecsToStorage();
  renderA11yGroupedList();
}
window.deleteA11yArea = deleteA11yArea;

// ══ BETA-ONLY: a11y-ordem-tabulacao-por-area (bloco grande — frontend
// completo da feature, reformulado pra viver dentro do accordion de cada
// Área Marcada) (início) ══
// Depende de: tabOrderItems (core.js, campo a11yAreaId por item), handlers
// 'start-tab-order-mode'/'stop-tab-order-mode'/'create-tab-order-item'/
// 'generate-tab-order-from-layers'/'renumber-tab-order-items' (code.js —
// já aceitam/ecoam areaId, ver comentários lá), roteamento em messages.js,
// _a11yAreaAccordionEl/_a11ySemAreaAccordionEl/renderA11yGroupedList (mais
// acima neste arquivo). NÃO depende mais de #tab-order-* fixo em
// views/specifications.html (seção removida) nem de
// #tab-order-generate-area-modal (modals.html, removido — cada botão
// "Gerar Automaticamente" já nasce escopado à área do próprio accordion).
// Ver MIGRATION-BETA-TO-MAIN.md.
// ── Ordem de Tabulação ───────────────────────────────────────────────────
// Ferramenta SEPARADA de "Especificação para Leitor de Tela" (Áreas Marcadas
// acima) — documenta a sequência de foco do teclado (tecla Tab), não uma
// marcação de seção/região. Usa o componente real "[a11y] Item Number"
// (family "handoff", key catalogada em
// refs/design-acessivel-marker-component-properties.json), não o
// "[a11y] Conectores" usado por Marcar Área.
//
// Escopo por área: cada Área Marcada tem sua própria sequência 1,2,3... —
// os itens continuam numa lista solta só (tabOrderItems/frame.tabOrderItems,
// mesma estrutura de sempre), só ganharam o campo a11yAreaId. "Reiniciar por
// área" é sempre uma questão de FILTRAR por a11yAreaId ao calcular o próximo
// número e ao exibir/reordenar — nunca de reestruturar o array em
// sub-arrays. Itens legados sem a11yAreaId caem no bucket "Sem área" (mesmo
// padrão visual do bucket de specs órfãs, _a11ySemAreaAccordionEl acima),
// só como vitrine read-only (sem botões de criação — não há área real pra
// escopar/varrer).
//
// Fluxo de "clique sequencial": ativar o modo (start-tab-order-mode) faz o
// backend estender o listener global de selectionchange (code.js) para
// postar tab-order-selection-changed a cada elemento único selecionado. Cada
// mensagem dispara automaticamente create-tab-order-item com o próximo
// número (calculado só dentro da área ativa) — sem formulário, sem clique de
// confirmação extra. O item some da sequência corrente só ao excluir
// (deleteTabOrderItem), que renumera localmente os posteriores DA MESMA
// ÁREA e propaga pro canvas via renumber-tab-order-items.
window._tabOrderModeOn = false;
// Área escopada do modo de clique manual ativo no momento — setada por
// toggleTabOrderMode ao ligar (o botão "Iniciar" vive dentro do accordion de
// uma área específica, então a área já é conhecida pelo contexto, sem
// select). handleTabOrderSelectionChanged lê daqui a cada elemento clicado.
window._tabOrderActiveAreaId = null;

// areaId é obrigatório no fluxo normal — o botão "Iniciar Ordem de
// Tabulação" agora vive dentro do accordion de uma Área Marcada específica
// (ver _a11yAreaAccordionEl), nunca solto. btnEl é o próprio elemento
// clicado, pra alternar estilo sem depender de um id fixo (cada área tem o
// seu).
function toggleTabOrderMode(areaId, btnEl) {
  if (!window._tabOrderModeOn && !areaId) {
    showToast('Marque uma área da tela antes de iniciar a ordem de tabulação.');
    return;
  }

  window._tabOrderModeOn = !window._tabOrderModeOn;
  const btn = btnEl || null;
  const label = btn ? btn.querySelector('[data-tab-order-toggle-label]') : null;

  if (window._tabOrderModeOn) {
    window._tabOrderActiveAreaId = areaId;
    parent.postMessage({ pluginMessage: { type: 'start-tab-order-mode' } }, '*');
    if (label) label.textContent = 'Clique nos elementos em ordem — Encerrar';
    if (btn) {
      btn.classList.remove('bg-[#0891B2]', 'hover:bg-cyan-700');
      btn.classList.add('bg-red-500', 'hover:bg-red-600');
    }
    showToast('Modo ativo: clique nos elementos do canvas, em sequência.');
  } else {
    parent.postMessage({ pluginMessage: { type: 'stop-tab-order-mode' } }, '*');
    if (label) label.textContent = 'Iniciar Ordem de Tabulação';
    if (btn) {
      btn.classList.remove('bg-red-500', 'hover:bg-red-600');
      btn.classList.add('bg-[#0891B2]', 'hover:bg-cyan-700');
    }
    window._tabOrderActiveAreaId = null;
  }
  _refreshIcons();
}
window.toggleTabOrderMode = toggleTabOrderMode;

// Chamado por messages.js a cada tab-order-selection-changed recebido do
// backend enquanto o modo está ativo — cria o próximo item da sequência sem
// nenhuma etapa intermediária, numerado só dentro da área ativa.
function handleTabOrderSelectionChanged(nodeId, nodeName) {
  if (!window._tabOrderModeOn || !nodeId) return;
  const areaId = window._tabOrderActiveAreaId;
  const number = _currentTabOrderItems(areaId).length + 1;
  parent.postMessage({ pluginMessage: { type: 'create-tab-order-item', targetNodeId: nodeId, number, conector: 'direita', areaId } }, '*');
}
window.handleTabOrderSelectionChanged = handleTabOrderSelectionChanged;

// Defensivo: itens salvos antes da introdução de canvasNumber (reordenação
// via drag-and-drop) não têm o campo — assume-se sincronizado com o canvas
// na primeira leitura, senão o botão "Atualizar" reenviaria tudo à toa.
// areaId filtra o subconjunto escopado à área (numeração reinicia por
// área); passe null/undefined só quando genuinamente precisar de todos os
// itens (ex: dedupe global). Sentinel '__sem_area__' filtra o bucket
// "Sem área" (itens legados sem a11yAreaId, ou cuja área foi excluída).
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
// manter o mesmo padrão de a11y-area-created (push no array certo,
// avulso vs. por-frame, depois salva e renderiza). Re-render é sempre da
// lista agrupada inteira (renderA11yGroupedList) — mais simples e menos
// propenso a bug do que atualizar cirurgicamente um único accordion.
function addTabOrderItem(item) {
  if (!item) return;
  item.canvasNumber = item.number;
  if (activeFrameId) {
    const frame = getFrame(activeFrameId);
    if (frame) {
      if (!frame.tabOrderItems) frame.tabOrderItems = [];
      frame.tabOrderItems.push(item);
    } else {
      tabOrderItems.push(item);
    }
  } else {
    tabOrderItems.push(item);
  }
  saveSpecsToStorage();
  renderA11yGroupedList();
}
window.addTabOrderItem = addTabOrderItem;

// ── Geração automática por varredura de camadas ─────────────────────────
// Complementar ao clique sequencial acima: varre a árvore de uma Área
// Marcada já existente e cria os selos de uma vez, na ordem real das
// camadas (profundidade, node.children — ver generate-tab-order-from-layers
// em code.js). Fluxo real esperado (confirmado pelo designer): gera
// automático, reordena via drag-and-drop se a ordem não ficar perfeita, e
// clica "Atualizar" pra aplicar no canvas — os itens entram na MESMA lista
// dos criados por clique manual, nunca uma lista à parte.
// Cada botão "Gerar Automaticamente" já nasce dentro do accordion de uma
// área específica — não há mais modal de escolha de área (removido de
// modals.html); chama direto com a área do próprio accordion.
function _confirmGenerateTabOrderFromLayers(areaId, targetNodeId) {
  if (!areaId || !targetNodeId) return;
  const startNumber = _currentTabOrderItems(areaId).length + 1;
  parent.postMessage({ pluginMessage: { type: 'generate-tab-order-from-layers', areaId, targetNodeId, startNumber } }, '*');
}
window._confirmGenerateTabOrderFromLayers = _confirmGenerateTabOrderFromLayers;

// Resposta de tab-order-generated-from-layers (messages.js) — mesmo padrão
// de push (avulso vs. por-frame) que addTabOrderItem já usa, reaproveitado
// item a item pra não duplicar a lógica de merge.
function addTabOrderItemsFromLayers(items) {
  if (!Array.isArray(items) || items.length === 0) {
    showToast('Nenhum elemento interativo (instância ou componente) encontrado dentro dessa área.');
    return;
  }
  items.forEach(item => addTabOrderItem(item));
  showToast(`${items.length} elemento${items.length === 1 ? '' : 's'} numerado${items.length === 1 ? '' : 's'} automaticamente — reordene se precisar e clique em "Atualizar".`);
}
window.addTabOrderItemsFromLayers = addTabOrderItemsFromLayers;

// Reordenação manual (drag-and-drop) é só de LISTA — a ordem visual normal
// é sempre derivada de it.number (ver .sort abaixo), então redistribuir a
// posição no array não muda nada sozinho. Ao soltar um item em nova posição
// (_tabOrderDrop), recalculamos number = index+1 pra TODOS os itens DA
// MESMA ÁREA (dado do plugin, sem tocar canvas) e guardamos o número já
// aplicado no canvas em canvasNumber, pra saber depois — no clique em
// "Atualizar" — quais itens realmente precisam de renumber-tab-order-items.
// canvasNumber nasce igual a number na criação (create-tab-order-item) e só
// é atualizado quando o backend confirma a renumeração.
let _tabOrderDragIndex = null;
let _tabOrderDragAreaId = null;

// Renderiza a lista de itens de Ordem de Tabulação escopada a UMA área
// (ou ao bucket "Sem área", passando areaId = '__sem_area__') dentro do
// containerEl fornecido (o <ul> específico daquele accordion). Chamada uma
// vez por accordion de área em _a11yAreaAccordionEl/_a11ySemAreaAccordionEl
// — substitui a antiga renderTabOrderList() única e global.
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

// Reordena o array em memória (fonte real: frame.tabOrderItems ou
// handoffData.tabOrderItems, a mesma resolvida por addTabOrderItem) e
// recalcula number = index+1 pra refletir a nova posição visual DENTRO DA
// MESMA ÁREA — sem enviar nada ao canvas aqui; a divergência com
// canvasNumber é o que o botão "Atualizar" (updateTabOrderNumbering) usa
// depois pra saber quem precisa de renumber-tab-order-items.
function _tabOrderDrop(ev, targetListIndex, areaId) {
  ev.preventDefault();
  const sourceListIndex = _tabOrderDragIndex;
  if (sourceListIndex === null || sourceListIndex === targetListIndex || areaId !== _tabOrderDragAreaId) return;

  const ordered = _currentTabOrderItems(areaId).sort((a, b) => (a.number || 0) - (b.number || 0));
  const [moved] = ordered.splice(sourceListIndex, 1);
  ordered.splice(targetListIndex, 0, moved);

  ordered.forEach((it, i) => { it.number = i + 1; });

  saveSpecsToStorage();
  renderA11yGroupedList();
}
window._tabOrderDrop = _tabOrderDrop;

// Clique em "Atualizar" (escopado a uma área) — só ENTÃO o canvas é tocado.
// Compara number (já recalculado pelo drag-and-drop) contra canvasNumber (o
// que de fato está desenhado nos selos) e manda pro backend só quem
// realmente mudou, mesma lógica de comparação que deleteTabOrderItem já
// usa. Reaproveita o handler renumber-tab-order-items existente — nenhuma
// mudança em code.js.
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

  saveSpecsToStorage();
  showToast('Ordem atualizada no canvas.');
}
window.updateTabOrderNumbering = updateTabOrderNumbering;

// Excluir um item do MEIO da sequência renumera localmente todos os
// posteriores DA MESMA ÁREA (-1) antes de salvar/renderizar, e propaga a
// mudança pros selos já desenhados no canvas via renumber-tab-order-items —
// o backend só aplica os números recalculados (setProperties), a decisão
// de "quem muda" é sempre do front, seguindo a orientação da tarefa.
function deleteTabOrderItem(originalIndex) {
  const raw = tabOrderItems[originalIndex];
  if (!raw) return;

  const areaId = raw.a11yAreaId || null;

  if (raw.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: raw.id } }, '*');
  }
  tabOrderItems.splice(originalIndex, 1);
  removeTabOrderItemById(raw.id);

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

  saveSpecsToStorage();
  renderA11yGroupedList();
}
window.deleteTabOrderItem = deleteTabOrderItem;
// ══ BETA-ONLY: a11y-ordem-tabulacao-por-area (fim do bloco grande) ══

// ── Guia de categorias ───────────────────────────────────────────────────
function openA11yCategoriesHelp() {
  openModal('a11y-categories-help-modal');
}
window.openA11yCategoriesHelp = openA11yCategoriesHelp;
