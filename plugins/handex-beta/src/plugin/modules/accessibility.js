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
    tituloPagina: { descricao: 'Definir o título página como: [insira aqui o título].', notasCodigo: 'Definir usando a tag <title> no HTML.' },
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

// Campos opcionais que ficam escondidos atrás de um chip "+ Adicionar X" até o
// designer clicar — evita poluir o formulário com inputs vazios. O texto
// digitado é preservado se o campo for escondido de novo (só o CSS muda, o
// valor do input não é limpo pelo toggle).
const A11Y_OPTIONAL_FIELD_IDS = [
  'a11y-el-variante', 'a11y-el-hint', 'a11y-el-obs', 'a11y-el-link',
  'a11y-estrutura-obs',
  'a11y-titulo-obs',
  'a11y-decorativo-obs',
  'a11y-informacoes-obs',
];

function toggleA11yOptionalField(inputId) {
  const field = document.getElementById(inputId + '-field');
  const chip = document.getElementById(inputId + '-chip');
  if (!field) return;
  const willShow = field.classList.contains('hidden');
  field.classList.toggle('hidden', !willShow);
  if (chip) chip.classList.toggle('hidden', willShow);
  if (willShow) {
    const input = document.getElementById(inputId);
    if (input) input.focus();
  }
}
window.toggleA11yOptionalField = toggleA11yOptionalField;

function _collapseA11yOptionalFields() {
  A11Y_OPTIONAL_FIELD_IDS.forEach(id => {
    const field = document.getElementById(id + '-field');
    const chip = document.getElementById(id + '-chip');
    if (field) field.classList.add('hidden');
    if (chip) chip.classList.remove('hidden');
  });
}

function openA11yModal(category) {
  const meta = A11Y_CATEGORIES[category];
  if (!meta) return;

  const modal = document.getElementById('a11y-spec-modal');
  if (!modal) return;
  modal.dataset.category = category;
  modal.dataset.areaId = window._a11yPendingAreaId || '';
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
    'a11y-el-variante', 'a11y-el-label', 'a11y-el-hint', 'a11y-el-obs', 'a11y-el-link',
    'a11y-el-componente-outro',
    'a11y-titulo-obs',
    'a11y-decorativo-obs',
    'a11y-estrutura-obs',
    'a11y-informacoes-obs',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  _collapseA11yOptionalFields();

  if (category === 'elemento') {
    // Pré-preenche via seleção do canvas — puramente cosmético, ver
    // prefillA11yComponentName (mensagem 'get-selection-name' assíncrona).
    parent.postMessage({ pluginMessage: { type: 'get-selection-name' } }, '*');
    const select = document.getElementById('a11y-el-componente-select');
    if (select) select.value = Object.keys(A11Y_CONTENT.elemento.componentes)[0];
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

function prefillA11yComponentName(name) {
  const modal = document.getElementById('a11y-spec-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (modal.dataset.category !== 'elemento') return;
  // Em modo edição (editA11ySpec) o formulário já foi preenchido com os
  // dados salvos da spec — o nome do que estiver selecionado no canvas
  // nesse momento é irrelevante e não pode pisar num "Componente" do
  // catálogo já escolhido (a resposta assíncrona de get-selection-name
  // chegaria depois do prefill síncrono e trocaria pra "Outro" silenciosamente).
  if (modal.dataset.editingSpecId) return;
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
}
window.updateA11yTituloFields = updateA11yTituloFields;

// ── Elemento Decorativo ──────────────────────────────────────────────────
// Sub-select entre "Gerais" e "Imagem" — mesma Descrição, Nota de Código
// diferente (alt="" em HTML pra imagem, anotação genérica pra gerais).
function updateA11yDecorativoFields() {
  const select = document.getElementById('a11y-decorativo-subtipo-select');
  if (!select) return;
  const entry = A11Y_CONTENT.decorativo[select.value];
  const descEl = document.getElementById('a11y-fixed-descricao-dec');
  const notaEl = document.getElementById('a11y-fixed-nota-dec');
  if (descEl) descEl.textContent = (entry && entry.descricao) || '';
  if (notaEl) notaEl.textContent = (entry && entry.notasCodigo) || '';
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

  if (category === 'elemento') {
    const tag = g('a11y-el-tag-input').toUpperCase();
    if (!validateA11yTagInput()) {
      showToast('Tag inválida. Use o formato A, B, A1, A1.1...');
      return;
    }
    letter = tag;
    const select = document.getElementById('a11y-el-componente-select');
    const isOutro = select && select.value === 'outro';
    const componente = isOutro ? g('a11y-el-componente-outro') : (A11Y_COMPONENTE_LABELS[select.value] || select.value);
    a11ySubtype = { componente: isOutro ? null : select.value, isOutro };
    const label = g('a11y-el-label');
    if (isOutro && !componente) {
      showToast('Informe o Componente documentado.');
      return;
    }
    if (!label) {
      showToast('Informe o Label (accessibilityLabel) do elemento.');
      return;
    }
    properties = [
      { key: 'componente', label: 'Componente', value: componente },
      { key: 'variante', label: 'Variante', value: g('a11y-el-variante') },
      { key: 'label', label: 'Label', value: label },
      { key: 'hint', label: 'Hint', value: g('a11y-el-hint') },
    ];
    if (!isOutro) {
      const entry = A11Y_CONTENT.elemento.componentes[select.value];
      if (entry && entry.descricao) properties.push({ key: 'descricao', label: 'Descrição', value: entry.descricao });
      if (entry && entry.notasCodigo) properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: entry.notasCodigo });
    }
    properties.push({ key: 'observacoes', label: 'Observações', value: g('a11y-el-obs') });
    properties.push({ key: 'link', label: 'Link do componente', value: g('a11y-el-link') });
    properties = properties.filter(p => p.value);
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
    const obs = g('a11y-estrutura-obs');
    if (obs) properties.push({ key: 'observacoes', label: 'Observações', value: obs });
    const subtipoSelect = document.getElementById('a11y-estrutura-subtipo-select');
    const marcoSelect = document.getElementById('a11y-estrutura-marco-select');
    const idiomasSelect = document.getElementById('a11y-estrutura-idiomas-select');
    const variacao = subtipoSelect ? subtipoSelect.value : 'idiomas';
    a11ySubtype = {
      variacao,
      tipo: variacao === 'marco de navegacao' ? (marcoSelect ? marcoSelect.value : 'header') : null,
      idioma: variacao === 'idiomas' ? (idiomasSelect ? idiomasSelect.value : 'da pagina') : null,
    };
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
    const obs = g('a11y-titulo-obs');
    if (obs) properties.push({ key: 'observacoes', label: 'Observações', value: obs });
    a11ySubtype = { nivel };
  } else if (category === 'decorativo') {
    letter = meta.badge;
    const descEl = document.getElementById('a11y-fixed-descricao-dec');
    const notaEl = document.getElementById('a11y-fixed-nota-dec');
    properties = [
      { key: 'descricao', label: 'Descrição', value: descEl ? descEl.textContent : '' },
    ];
    if (notaEl && notaEl.textContent) properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: notaEl.textContent });
    const obs = g('a11y-decorativo-obs');
    if (obs) properties.push({ key: 'observacoes', label: 'Observações', value: obs });
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
    const obs = g('a11y-informacoes-obs');
    if (obs) properties.push({ key: 'observacoes', label: 'Observações', value: obs });
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

  const opts = {
    category: 'acessibilidade',
    categoryLabel: meta.label,
    letter,
    color: meta.color,
    fillColor: meta.fill,
    properties,
    guideSide: guideSideEl ? guideSideEl.value : 'right',
    // Funcionalidade de conector removida por decisão do usuário — o
    // marcador real "Agrupamento" já envolve o elemento, não precisa de
    // linha ligando ele ao card de detalhamento.
    drawConnection: false,
    // --- Acessibilidade --- diferencia a categoria na hora de renderizar/agrupar.
    a11yType: category,
    // Chave crua da subvariante — usada pelo backend pra tentar o import real
    // do componente da lib (ver code.js, _tryImportA11yComponent).
    a11ySubtype,
    // Área Marcada onde a spec nasceu — associação explícita, escolhida no
    // momento da criação. O backend ecoa esse campo de volta em spec-created
    // pra spec.a11yAreaId continuar presente no objeto salvo localmente.
    a11yAreaId: areaId || null,
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

  return `
    <div class="relative bg-gray-50/60 dark:bg-dark-bg/40 rounded-xl border ${isUnlocked ? 'border-amber-200 dark:border-amber-800/40' : isHidden ? 'border-gray-100 opacity-50' : 'border-gray-100 dark:border-dark-line'} overflow-hidden">
      <div class="flex items-start px-2.5 py-2 gap-2">
        <div class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white shrink-0 mt-0.5" style="background-color:${color}">${escapeHtml(spec.letter || 'A')}</div>
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-semibold text-slate-700 dark:text-white truncate">${escapeHtml(spec.targetNodeName || spec.name || 'Elemento')}</p>
          <span class="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-bold" style="background-color:${fill};border-color:${color};color:${color};">
            <i data-lucide="${meta.icon}" class="w-2.5 h-2.5"></i> ${meta.label}
          </span>
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

function _a11yAreaAccordionEl(area, areaSpecs) {
  const uid = `a11y-area-${area.originalIndex}`;
  const expand = window._a11yExpandedAreaIds.has(area.id);
  const li = document.createElement('li');
  li.className = 'list-none bg-white dark:bg-dark-surface rounded-xl border border-gray-100 dark:border-dark-line overflow-hidden';
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
      ${areaSpecs.length > 0
        ? areaSpecs.map(_a11ySpecItemHtml).join('')
        : `<p class="text-[10px] text-slate-400 dark:text-dark-muted text-center py-3">Nenhuma especificação nesta área ainda. Use o botão "+" acima.</p>`}
    </div>
  `;
  return li;
}

// Bucket "Sem área" — specs que não têm a11yAreaId (dado de testes anteriores
// a esta reformulação; não deveria mais acontecer no fluxo novo, área é
// pré-requisito pra criar spec). Nunca tenta adivinhar a área certa.
function _a11ySemAreaAccordionEl(specs) {
  const uid = 'a11y-area-sem';
  const li = document.createElement('li');
  li.className = 'list-none bg-white dark:bg-dark-surface rounded-xl border border-amber-200 dark:border-amber-800/40 overflow-hidden';
  li.innerHTML = `
    <div class="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
      onclick="toggleA11yAreaAccordion('${uid}')">
      <div class="w-6 h-6 rounded-full flex items-center justify-center bg-amber-50 dark:bg-amber-900/30 text-amber-500 shrink-0">
        <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-slate-700 dark:text-white truncate">Sem área</p>
        <p class="text-[9px] text-slate-400 dark:text-dark-muted">${specs.length} especificaç${specs.length === 1 ? 'ão' : 'ões'} sem área associada</p>
      </div>
      <i data-lucide="chevron-down" id="chevron-${uid}" class="w-4 h-4 text-gray-400 transition-transform shrink-0"></i>
    </div>
    <div id="body-${uid}" class="accordion-content hidden border-t border-gray-50 dark:border-dark-line p-2 space-y-2">
      ${specs.map(_a11ySpecItemHtml).join('')}
    </div>
  `;
  return li;
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
    const areaSpecs = specs
      .filter(s => s.a11yAreaId === area.id)
      .sort((a, b) => String(a.letter || '').localeCompare(String(b.letter || '')));
    list.appendChild(_a11yAreaAccordionEl(area, areaSpecs));
  });

  const semArea = specs
    .filter(s => !s.a11yAreaId || !areas.some(a => a.id === s.a11yAreaId))
    .sort((a, b) => String(a.letter || '').localeCompare(String(b.letter || '')));
  if (semArea.length > 0) {
    list.appendChild(_a11ySemAreaAccordionEl(semArea));
  }

  _refreshIcons();
}
window.renderA11yGroupedList = renderA11yGroupedList;

// Wrappers pra não quebrar chamadores existentes (core.js syncAndRenderSpecs,
// messages.js, specifications.js switchSpecsMainTab) que ainda pedem a lista
// de specs ou a de áreas separadamente — agora ambos renderizam o mesmo
// accordion unificado.
function renderA11ySpecsList() { renderA11yGroupedList(); }
window.renderA11ySpecsList = renderA11ySpecsList;
function renderA11yAreasList() { renderA11yGroupedList(); }
window.renderA11yAreasList = renderA11yAreasList;

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
  (handoffData.frames || []).forEach(frame => {
    if (!frame.a11ySpecs) return;
    const idx = frame.a11ySpecs.indexOf(spec);
    if (idx !== -1) frame.a11ySpecs.splice(idx, 1);
  });
  saveToStorage();
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
// categoria. Campos opcionais (chip "+ Observações" etc.) são revelados só
// quando já têm valor salvo.
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
  const reveal = (id) => {
    const field = document.getElementById(id + '-field');
    const chip = document.getElementById(id + '-chip');
    if (field) field.classList.remove('hidden');
    if (chip) chip.classList.add('hidden');
  };
  const setAndReveal = (id, val) => {
    if (!val) return;
    setVal(id, val);
    reveal(id);
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
    setAndReveal('a11y-el-variante', getProp('variante'));
    setAndReveal('a11y-el-hint', getProp('hint'));
    setAndReveal('a11y-el-obs', getProp('observacoes'));
    setAndReveal('a11y-el-link', getProp('link'));
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
    setAndReveal('a11y-estrutura-obs', getProp('observacoes'));
  } else if (category === 'titulo') {
    const nivelSelect = document.getElementById('a11y-titulo-nivel-select');
    if (nivelSelect) nivelSelect.value = sub.nivel || 'h1';
    updateA11yTituloFields();
    setAndReveal('a11y-titulo-obs', getProp('observacoes'));
  } else if (category === 'decorativo') {
    const decSelect = document.getElementById('a11y-decorativo-subtipo-select');
    if (decSelect) decSelect.value = sub.tipo || 'gerais';
    updateA11yDecorativoFields();
    setAndReveal('a11y-decorativo-obs', getProp('observacoes'));
  } else if (category === 'informacoes') {
    const infoSelect = document.getElementById('a11y-informacoes-subtipo-select');
    if (infoSelect) infoSelect.value = sub.subtipo || 'handoffs';
    updateA11yInformacoesFields();
    const isCustom = sub.subtipo === 'customizavel';
    if (isCustom) setVal('a11y-informacoes-descricao', getProp('descricao'));
    setAndReveal('a11y-informacoes-obs', getProp('observacoes'));
  }

  validateA11yTagInput();

  const guideRadio = document.querySelector(`input[name="a11y-guide-side"][value="${spec.guideSide || 'right'}"]`);
  if (guideRadio) guideRadio.checked = true;
}

// ── Áreas Marcadas ───────────────────────────────────────────────────────
// Selo azul numerado (1, 2, 3...) apontando uma seção/região da tela. Vira o
// agrupamento principal da aba: cada área é um accordion e toda spec de A11y
// nasce dentro de uma área (ver renderA11yGroupedList). Numeração sequencial
// por PROJETO inteiro (nunca reaproveita número de área excluída).
function openA11yAreaModal() {
  const input = document.getElementById('a11y-area-label-input');
  if (input) input.value = '';
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
  closeA11yAreaModal();
  _getA11ySelectionInfo().then(sel => {
    if (!sel || !sel.id) {
      showToast('Selecione um elemento no canvas antes de marcar a área.');
      return;
    }
    const number = _nextA11yAreaNumber();
    parent.postMessage({ pluginMessage: { type: 'create-a11y-area', targetNodeId: sel.id, label, number } }, '*');
  });
}
window.confirmA11yArea = confirmA11yArea;

// Excluir uma área remove o selo do canvas e a entrada do array — specs que
// pertenciam a ela (associação explícita via a11yAreaId) caem no bucket
// "Sem área" na próxima renderização.
function deleteA11yArea(originalIndex) {
  const area = a11yAreas[originalIndex];
  if (!area) return;
  if (area.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: area.id } }, '*');
  }
  a11yAreas.splice(originalIndex, 1);
  (handoffData.frames || []).forEach(frame => {
    if (!frame.a11yAreas) return;
    const idx = frame.a11yAreas.indexOf(area);
    if (idx !== -1) frame.a11yAreas.splice(idx, 1);
  });
  saveToStorage();
  renderA11yGroupedList();
}
window.deleteA11yArea = deleteA11yArea;

// ── Guia de categorias ───────────────────────────────────────────────────
function openA11yCategoriesHelp() {
  openModal('a11y-categories-help-modal');
}
window.openA11yCategoriesHelp = openA11yCategoriesHelp;
