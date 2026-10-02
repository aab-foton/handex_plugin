// ============================================================
// onboarding.js — onboarding contextual por funcionalidade
//
// Inclui:
//   - catálogo de conteúdo por ferramenta (ONBOARDING_TOOLS), texto espelhado
//     dos accordions de views/guide.html (mesma fonte, não duplicar redação)
//   - banner "Primeira vez aqui?" por view, dispensável, não-bloqueante
//   - modal genérico de onboarding — stepper (múltiplos passos) ou cartão
//     único, conforme a ferramenta
//   - persistência via figma.clientStorage, chave própria
//     ('handex-onboarding-seen'), por instalação do plugin — não por projeto,
//     e deliberadamente fora de handoffData (sobrevive a "Limpar Dados")
//
// Depende de: openModal/closeModal (core.js), _refreshIcons, showToast
// ============================================================

// Estado "visto" por ferramenta, populado a partir de init-plugin
// (onboardingSeen) em messages.js. Nunca lido diretamente por outros
// módulos — sempre via _onboardingSeen()/markOnboardingSeen().
let onboardingSeen = {};

const ONBOARDING_TOOLS = {
  home: {
    view: 'view-home',
    title: 'Página Inicial',
    icon: 'layout-grid',
    color: '#404b52',
    format: 'single',
    docUrl: 'https://www.figma.com/design/SEBfJKxHu2SvLHnpw0FUVp/Handex---Handoff-Expresso?node-id=1-54',
    purpose: 'Painel central do handoff: abra cada ferramenta pelos cards e, no fim, gere a Ficha de Handoff no canvas.',
    steps: [
      { text: 'Abra a ferramenta que precisar pelos <strong>cards</strong>, em qualquer ordem.' },
      { text: 'Para reordenar os cards, arraste a alcinha <strong>⠿</strong> (a ordem fica salva só neste computador).' },
      { text: 'Ao terminar, use <strong>Gerar Ficha de Handoff</strong> no rodapé.' }
    ]
  },
  guide: {
    view: 'view-guide',
    title: 'Como usar o plugin',
    icon: 'book-open',
    color: '#005ca9',
    format: 'single',
    docUrl: 'https://www.figma.com/design/SEBfJKxHu2SvLHnpw0FUVp/Handex---Handoff-Expresso?node-id=1-54',
    purpose: 'O Handex reúne ferramentas independentes de documentação, sem ordem fixa. No fim, gere a Ficha de Handoff no canvas.',
    steps: [
      { text: 'Expanda uma ferramenta da lista para ver <strong>para que ela serve</strong>.' },
      { text: 'Use <strong>Ver documentação completa</strong> para o passo a passo no Figma.' },
      { text: 'Em cada tela, o ícone de ajuda no topo abre o guia daquela ferramenta.' }
    ]
  },
  dadosProjeto: {
    view: 'view-dados-projeto',
    title: 'Informações do Projeto',
    icon: 'clipboard-list',
    color: '#005ca9',
    format: 'single',
    docUrl: 'https://www.figma.com/design/SEBfJKxHu2SvLHnpw0FUVp/Handex---Handoff-Expresso?node-id=117-505',
    purpose: 'Registra título, objetivo, equipe, briefing, regras de negócio e links. Esse contexto abre a Ficha e responde ao dev o "porquê" da entrega.',
    steps: [
      { text: 'Preencha <strong>Título</strong>, <strong>Versão</strong> e <strong>Objetivo</strong> (obrigatórios).' },
      { text: 'Adicione ao menos <strong>1 membro da equipe</strong> com nome; o e-mail é opcional.' },
      { text: 'Se quiser, preencha <strong>Briefing</strong>, <strong>Regras de Negócio</strong> e <strong>Links</strong>; cada seção pode ser desativada sem apagar nada.' },
      { text: 'Para consulta rápida de outra tela, use o ícone <strong>📋</strong> no topo. Tudo é salvo automaticamente.' }
    ]
  },
  handoff: {
    view: 'view-frames',
    title: 'Escanear Tokens',
    icon: 'scan-line',
    color: '#006480',
    format: 'stepper',
    docUrl: 'https://www.figma.com/design/SEBfJKxHu2SvLHnpw0FUVp/Handex---Handoff-Expresso?node-id=117-342',
    purpose: 'Escaneia o frame e compara cores, tipografia e componentes com o Design System CAIXA. Você revisa os desvios e marca o que o dev precisa construir.',
    steps: [
      { text: 'Selecione um frame no canvas e clique em <strong>+ Escanear Frame</strong>.' },
      { text: 'Expanda o item para ver o token; props desligadas ficam em <strong>Mostrar N inativas</strong>.' },
      { text: 'No que o dev precisa <strong>construir</strong>, ligue <strong>Vai para a Ficha</strong>; use <strong>Detalhamento completo</strong> se ele precisar de mais.' },
      { text: 'Declare a <strong>Conformidade DSC</strong> e justifique por escrito os desvios.' },
      { text: 'Se o frame é um componente inédito, ligue <strong>Novo Componente</strong>: os itens personalizados já saem com <strong>Vai para a Ficha</strong> ligado, e você desmarca item a item.' }
    ]
  },
  specs: {
    view: 'view-specifications',
    title: 'Anotar Specs Detalhadas',
    icon: 'tag',
    color: '#00437a',
    format: 'stepper',
    docUrl: 'https://www.figma.com/design/SEBfJKxHu2SvLHnpw0FUVp/Handex---Handoff-Expresso?node-id=117-431',
    purpose: 'Registra o que o dev precisa saber e implementar sobre um elemento: regra, comportamento, exceção. Entra na Ficha e fica ancorada no elemento do canvas.',
    steps: [
      { text: 'Só precisa dos valores do elemento? Use <strong>Anotar Specs Rápidas</strong>.' },
      { text: 'Selecione um elemento no canvas e clique no <strong>botão +</strong> no topo.' },
      { text: 'Defina a <strong>Tag</strong> e a <strong>Categoria</strong>; nota e propriedades são opcionais.' },
      { text: 'Arraste a prévia até onde quiser e clique em <strong>Usar esta posição</strong> (ou em Pular).' }
    ],
    // Conteúdo migrado do popover "Tipo de especificação" (circle-help do
    // header e do modal de criação — ver spec-types-help-modal em
    // modals.html, que continua existindo como segundo ponto de acesso
    // com o mesmo conteúdo). Referência de consulta, sempre visível abaixo
    // dos steps.
    reference: {
      title: 'Tags, controles de grupo e tipos de especificação',
      items: [
        { icon: 'tag', text: '<strong>Tags:</strong> mesma tag empilha specs no mesmo grupo do canvas; tags diferentes ficam lado a lado, sem sobreposição. Renomeie o grupo pelo ícone de lápis na lista.' },
        { icon: 'sliders-horizontal', text: '<strong>Controles do grupo:</strong> ocultar linhas (esconde só os conectores), ocultar grupo (esconde as specs sem apagar) e cadeado (trava a posição no canvas).' },
        { icon: 'info', text: '<strong>Informação extra:</strong> o que não se encaixa nos demais tipos — pendências, decisões de reunião, componente legado ou fora do DSC.' },
        { icon: 'zap', text: '<strong>Comportamento:</strong> reação do sistema além do padrão do DSC — microinterações, abertura de modais, transições de estado.' },
        { icon: 'scale', text: '<strong>Regra de Negócio:</strong> lógica não visível na interface — campos obrigatórios, validações, restrições de ações.' },
        { icon: 'database', text: '<strong>Dados da API:</strong> informações técnicas de integração — endpoints, campos esperados, estados de carregamento.' },
        { icon: 'alert-triangle', text: '<strong>Cenário de Exceção</strong> não é uma categoria — é um registro à parte dentro da própria spec, com 4 subtipos: Sucesso, Erro, Alerta, Confirmação.' }
      ]
    }
  },
  quickSpec: {
    view: 'view-quick-spec',
    title: 'Anotar Specs Rápidas',
    icon: 'zap',
    color: '#216e62',
    format: 'stepper',
    purpose: 'Mostra os valores reais de um elemento (cor, espaçamento, tipografia, medidas) para o dev sem DevMode. É consulta pontual e não entra na Ficha.',
    steps: [
      { text: 'Precisa de regra, comportamento ou exceção? Use <strong>Anotar Specs Detalhadas</strong>.' },
      { text: 'Clique em <strong>Escanear</strong>, escolha as propriedades e <strong>segure Shift e clique</strong> nos elementos no canvas.' },
      { text: 'Clique em <strong>Concluir</strong> e expanda os itens para ver os valores, com token e biblioteca quando houver.' },
      { text: 'Use <strong>Inserir no canvas</strong> para deixar um card ao lado de cada elemento. A <strong>Observação</strong> fica só no card; para levá-la à Ficha, converta em Spec Detalhada.' }
    ]
  },
  medidas: {
    view: 'view-measurement',
    title: 'Anotar Medidas',
    icon: 'ruler',
    color: '#026273',
    format: 'stepper',
    docUrl: 'https://www.figma.com/design/SEBfJKxHu2SvLHnpw0FUVp/Handex---Handoff-Expresso?node-id=117-342',
    purpose: 'Transforma larguras, alturas, margens, paddings e gaps do canvas em anotações visíveis, para o dev implementar sem inspecionar medida por medida.',
    steps: [
      { text: 'Selecione 1 ou mais elementos no canvas e clique no <strong>botão +</strong> no topo.' },
      { text: 'Escolha o tipo de medida e confirme: as anotações aparecem no canvas e na lista.' },
      { text: 'Use <strong>Ocultar tudo</strong> para esconder as medidas do canvas sem excluí-las.' },
      { text: 'Medidas avulsas entram na Ficha num bloco próprio, só em texto.' }
    ],
    // Conteúdo migrado do popover "Tipos de medida" (circle-help do
    // header, removido — ver views/measurement.html). Referência de
    // consulta, sempre visível abaixo dos steps.
    reference: {
      title: 'Tipos de medida',
      items: [
        { icon: 'scaling', text: '<strong>Width e Height:</strong> dimensões do elemento selecionado.' },
        { icon: 'box-select', text: '<strong>Espaçamento Externo:</strong> distância entre o elemento e seus vizinhos.' },
        { icon: 'focus', text: '<strong>Padding:</strong> espaço entre a borda do frame e seu conteúdo.' },
        { icon: 'align-horizontal-space-between', text: '<strong>Padding e Gap:</strong> espaçamentos internos de um Auto Layout.' }
      ]
    }
  },
  fluxos: {
    view: 'view-flows',
    title: 'Fluxos de Tela',
    icon: 'git-branch',
    color: '#a65e00',
    format: 'single',
    docUrl: 'https://www.figma.com/design/SEBfJKxHu2SvLHnpw0FUVp/Handex---Handoff-Expresso?node-id=117-383',
    purpose: 'Mapeia a navegação entre telas, com sequências, decisões e eventos, para o dev ver a jornada completa antes de implementar cada tela.',
    steps: [
      { text: 'Selecione 2 ou mais elementos no canvas e clique em <strong>+ Conectar Frames</strong>.' },
      { text: 'Dê um <strong>Nome da Jornada</strong> e escolha o tipo: Sequência, Mensagem ou Decisão.' },
      { text: 'Se quiser, ajuste o lado de saída da seta no mini-mapa e o estilo da linha (Reta ou Angular).' },
      { text: 'Escolha a <strong>cor da linha</strong>; vale para a conexão ou a jornada toda.' },
      { text: 'Use o ícone de foco na lista para localizar a seta no canvas.' }
    ],
    // Conteúdo migrado do popover "Como funciona" (circle-help do header,
    // removido — ver views/flows.html). Referência de consulta, sempre
    // visível abaixo dos steps.
    reference: {
      title: 'Como funciona',
      items: [
        { icon: 'arrow-right', text: 'A seta desenhada no canvas segue a <strong>ordem de seleção</strong>: do primeiro elemento clicado para o segundo.' },
        { icon: 'eye', text: 'Use o ícone de <strong>olho</strong> no card para ocultar/exibir a conexão sem excluí-la.' },
        { icon: 'trash-2', text: 'Use o ícone de <strong>lixeira</strong> para remover a conexão do canvas e da lista.' }
      ]
    }
  },
  handoffSummary: {
    view: 'view-handoff-summary',
    title: 'Gerar Ficha de Handoff',
    icon: 'send',
    color: '#0d581d',
    format: 'single',
    docUrl: 'https://www.figma.com/design/SEBfJKxHu2SvLHnpw0FUVp/Handex---Handoff-Expresso?node-id=117-465',
    purpose: 'Reúne tudo o que foi documentado numa Ficha única e versionada no canvas, pronta para o time de desenvolvimento.',
    steps: [
      { text: 'Confira título, objetivo e ao menos 1 membro da equipe com nome.' },
      { text: 'Clique em <strong>Gerar Ficha</strong>. Se já existir uma, escolha entre <strong>Atualização</strong> e <strong>Nova Versão</strong>.' },
      { text: 'Na primeira vez, arraste a Ficha para o lugar desejado e confirme a posição.' },
      { text: 'Use <strong>Exportar</strong> para baixar Ficha em PDF, Briefing, Markdown ou JSON (só o JSON pode ser reimportado).' }
    ]
  }
};

function _onboardingSeen(toolKey) {
  return !!onboardingSeen[toolKey];
}

function markOnboardingSeen(toolKey) {
  onboardingSeen[toolKey] = true;
  parent.postMessage({ pluginMessage: { type: 'save-onboarding-state', data: onboardingSeen } }, '*');
}
window.markOnboardingSeen = markOnboardingSeen;

// Chamada por messages.js ao processar init-plugin — evita que o módulo
// dependa de saber quando o backend respondeu.
function setOnboardingSeenState(state) {
  onboardingSeen = state && typeof state === 'object' ? state : {};
}
window.setOnboardingSeenState = setOnboardingSeenState;

// Mostra o banner "Primeira vez aqui?" na view atual, se a ferramenta tiver
// onboarding cadastrado e ainda não tiver sido vista. Chamado ao navegar
// para cada view com onboarding (ver core.js, dentro de navigate()).
function maybeShowOnboardingBanner(toolKey) {
  const tool = ONBOARDING_TOOLS[toolKey];
  const banner = document.getElementById(`onboarding-banner-${toolKey}`);
  if (!tool || !banner) return;
  banner.classList.toggle('hidden', _onboardingSeen(toolKey));
}
window.maybeShowOnboardingBanner = maybeShowOnboardingBanner;

function dismissOnboardingBanner(toolKey) {
  const banner = document.getElementById(`onboarding-banner-${toolKey}`);
  if (banner) banner.classList.add('hidden');
  markOnboardingSeen(toolKey);
}
window.dismissOnboardingBanner = dismissOnboardingBanner;

// Abre o modal de onboarding — chamado tanto pelo banner ("Ver agora") quanto
// pelo botão "?" de revisão no subheader de cada view (a qualquer momento,
// sem alterar o estado "visto" nesse segundo caso — só o fluxo do banner
// marca como visto).
let _onboardingCurrentTool = null;
let _onboardingCurrentStep = 0;

function openOnboarding(toolKey, { markSeenOnOpen = false } = {}) {
  const tool = ONBOARDING_TOOLS[toolKey];
  if (!tool) return;
  _onboardingCurrentTool = toolKey;
  // -1 é a tela de "propósito" (para que serve), exibida sozinha antes do
  // Passo 1 -- só existe quando a ferramenta tem tool.purpose cadastrado.
  _onboardingCurrentStep = tool.purpose ? -1 : 0;
  const banner = document.getElementById(`onboarding-banner-${toolKey}`);
  if (banner) banner.classList.add('hidden');
  if (markSeenOnOpen) markOnboardingSeen(toolKey);
  _renderOnboardingModal();
  openModal('onboarding-modal');
}
window.openOnboarding = openOnboarding;

// Mídia opcional por passo — GIF/imagem gravada da interação real no Figma.
// Uso: adicionar `media: 'https://.../passo-1.gif'` ao objeto do passo em
// ONBOARDING_TOOLS (nunca base64/embarcado — infla o ui.html; sempre URL
// externa hospedada fora do plugin). Passo sem `media` não renderiza nada
// aqui, sem quebrar o layout — é aditivo, retrocompatível com o catálogo
// atual (nenhum passo tem media ainda).
function _onboardingMediaHTML(step) {
  if (!step.media) return '';
  return `<img src="${step.media}" alt="" class="w-full rounded-xl border border-gray-100 dark:border-dark-line mb-3" loading="lazy" />`;
}

// "Para que serve" -- sempre a PRIMEIRA coisa que o modal mostra, antes de
// qualquer passo de "como fazer" (tool.purpose, ver ONBOARDING_TOOLS). O
// designer precisa entender o propósito da ferramenta antes do
// passo-a-passo, senão o "como" fica sem contexto. Visualmente distinto do
// "Passo N de M" -- sem numeração, num destaque de fundo leve na cor da
// própria ferramenta, pra não competir com os passos mas deixar claro que é
// uma categoria de informação diferente (o "porquê", não o "como").
function _onboardingPurposeHTML(tool) {
  if (!tool.purpose) return '';
  return `
    <div class="rounded-xl p-3.5 mb-4" style="background-color:${tool.color}0d">
      <p class="text-[12px] text-slate-700 dark:text-white leading-relaxed">${tool.purpose}</p>
    </div>
  `;
}

// Seção de referência rápida, sempre visível abaixo dos steps (não é mais
// um step do stepper — não força navegação). Migrada dos antigos popovers
// "?" de Fluxos de Tela e Anotar Medidas, únicas ferramentas com esse
// conteúdo (ver ONBOARDING_TOOLS.fluxos/medidas.reference). Suporta dois
// formatos: `items` (lista ícone + texto, o caso comum) ou `html` bruto
// (para conteúdo rico demais pro formato item-a-item — nenhuma ferramenta
// usa isso hoje, mas o formato fica pronto).
function _onboardingReferenceHTML(reference) {
  if (!reference) return '';
  const body = reference.html || `
    <div class="space-y-2.5">
      ${(reference.items || []).map(item => `
        <div class="flex items-start gap-2">
          <i data-lucide="${item.icon}" class="w-3.5 h-3.5 text-slate-500 dark:text-dark-muted shrink-0 mt-0.5"></i>
          <p class="text-[10px] text-slate-500 dark:text-dark-muted leading-tight">${item.text}</p>
        </div>
      `).join('')}
    </div>
  `;
  return `
    <div class="border-t border-gray-100 dark:border-dark-line my-4"></div>
    <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-dark-muted mb-2.5">${reference.title}</p>
    ${body}
  `;
}

// Link pro frame correspondente na documentação oficial do Handex (arquivo
// Figma "Handex - Handoff Expresso", páginas de metodologia -- não o
// docs/site/ técnico, que é sobre arquitetura/código do plugin, não sobre
// como fazer handoff). Só aparece na tela de propósito (Passo -1), logo
// abaixo do bloco que já explica "para que serve" essa ferramenta.
function _onboardingDocLinkHTML(tool) {
  if (!tool.docUrl) return '';
  return `
    <a href="${tool.docUrl}" target="_blank" rel="noopener noreferrer"
      class="flex items-center gap-2 mt-3 text-[11px] font-bold" style="color:${tool.color}">
      <i data-lucide="book-open" class="w-3.5 h-3.5 shrink-0"></i>
      Ver documentação completa
    </a>
  `;
}

function _renderOnboardingModal() {
  const tool = ONBOARDING_TOOLS[_onboardingCurrentTool];
  if (!tool) return;
  const isStepper = tool.format === 'stepper';

  const titleEl = document.getElementById('onboarding-modal-title');
  const iconWrap = document.getElementById('onboarding-modal-icon-wrap');
  const iconEl = document.getElementById('onboarding-modal-icon');
  if (titleEl) titleEl.textContent = tool.title;
  if (iconWrap) iconWrap.style.backgroundColor = `${tool.color}1a`;
  if (iconEl) { iconEl.setAttribute('data-lucide', tool.icon); iconEl.style.color = tool.color; }

  const body = document.getElementById('onboarding-modal-body');
  const footer = document.getElementById('onboarding-modal-footer');
  if (!body || !footer) return;

  // Botões de rodapé do onboarding sempre azul de marca (primária) / branco
  // com borda (outline) -- nunca a cor de identidade por ferramenta
  // (tool.color), que fica só nos elementos decorativos (ícone, barra de
  // progresso, número do passo, destaque de propósito). Corrigido em
  // 2026-09: o botão de ação mudava de cor por ferramenta (indigo em Specs,
  // purple em Fluxos etc.), quebrando a expectativa de "botão primário =
  // azul de marca" em qualquer outro lugar do plugin.
  const _outlineBtnClasses = 'bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-2xl py-3 px-4 text-[12px] font-bold text-slate-600 dark:text-dark-muted hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors';
  const _primaryBtnClasses = 'bg-blue-500 hover:bg-blue-600 text-white rounded-2xl py-3 px-6 text-[12px] font-bold transition-colors';

  if (_onboardingCurrentStep === -1) {
    // Tela de propósito: sozinha, sem numeração "Passo N de M" (não é um
    // passo do stepper) -- só "para que serve" e um Próximo que avança pro
    // Passo 1. Mesmo layout pras ferramentas 'single' e 'stepper'.
    body.innerHTML = `
      <div class="rounded-xl p-3.5" style="background-color:${tool.color}0d">
        <p class="text-[13px] text-slate-700 dark:text-white leading-relaxed">${tool.purpose}</p>
      </div>
      ${_onboardingDocLinkHTML(tool)}
    `;
    footer.innerHTML = `
      <button type="button" onclick="closeOnboarding()" class="${_outlineBtnClasses}">Pular</button>
      <button type="button" onclick="_onboardingStep(1)" class="${_primaryBtnClasses}">Próximo</button>
    `;
    _refreshIcons();
    return;
  }

  if (isStepper) {
    const step = tool.steps[_onboardingCurrentStep];
    const isLast = _onboardingCurrentStep === tool.steps.length - 1;
    const isFirst = _onboardingCurrentStep === 0;
    body.innerHTML = `
      <div class="flex items-center justify-center gap-1.5 mb-4">
        ${tool.steps.map((_, i) => `<span class="h-1.5 rounded-full transition-all ${i === _onboardingCurrentStep ? 'w-6' : 'w-1.5'}" style="background-color:${i <= _onboardingCurrentStep ? tool.color : '#d0e0e3'}"></span>`).join('')}
      </div>
      ${_onboardingMediaHTML(step)}
      <p class="text-[10px] font-bold uppercase tracking-wider mb-2" style="color:${tool.color}">Passo ${_onboardingCurrentStep + 1} de ${tool.steps.length}</p>
      <p class="text-[13px] text-slate-700 dark:text-white leading-relaxed">${step.text}</p>
      ${_onboardingReferenceHTML(tool.reference)}
    `;
    const showBack = !isFirst || !!tool.purpose;
    footer.innerHTML = `
      <button type="button" onclick="closeOnboarding()" class="${_outlineBtnClasses}">Pular</button>
      <div class="flex items-center gap-2">
        ${showBack ? `<button type="button" onclick="_onboardingStep(-1)" class="${_outlineBtnClasses}">Voltar</button>` : ''}
        <button type="button" onclick="${isLast ? 'closeOnboarding()' : '_onboardingStep(1)'}" class="${_primaryBtnClasses}">${isLast ? 'Concluir' : 'Próximo'}</button>
      </div>
    `;
  } else {
    body.innerHTML = `
      <ol class="space-y-3 list-none">
        ${tool.steps.map((s, i) => `
          <li class="flex gap-2.5">
            <span class="w-5 h-5 rounded-full font-black text-[9px] flex items-center justify-center shrink-0 mt-0.5" style="background-color:${tool.color}1a;color:${tool.color}">${i + 1}</span>
            <div class="flex-1 min-w-0">
              <span class="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">${s.text}</span>
              ${_onboardingMediaHTML(s)}
            </div>
          </li>
        `).join('')}
      </ol>
      ${_onboardingReferenceHTML(tool.reference)}
    `;
    footer.innerHTML = `
      ${tool.purpose ? `<button type="button" onclick="_onboardingStep(-1)" class="${_outlineBtnClasses}">Voltar</button>` : '<div></div>'}
      <button type="button" onclick="closeOnboarding()" class="${_primaryBtnClasses}">Entendi</button>
    `;
  }
  _refreshIcons();
}

function _onboardingStep(delta) {
  const tool = ONBOARDING_TOOLS[_onboardingCurrentTool];
  if (!tool) return;
  const minStep = tool.purpose ? -1 : 0;
  const maxStep = tool.format === 'stepper' ? tool.steps.length - 1 : 0;
  _onboardingCurrentStep = Math.max(minStep, Math.min(maxStep, _onboardingCurrentStep + delta));
  _renderOnboardingModal();
}
window._onboardingStep = _onboardingStep;

function closeOnboarding() {
  if (_onboardingCurrentTool) markOnboardingSeen(_onboardingCurrentTool);
  closeModal('onboarding-modal');
  _onboardingCurrentTool = null;
  _onboardingCurrentStep = 0;
}
window.closeOnboarding = closeOnboarding;
