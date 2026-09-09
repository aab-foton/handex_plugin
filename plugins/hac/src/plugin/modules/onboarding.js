// ============================================================
// onboarding.js — hac
//
// ADAPTAÇÃO do onboarding contextual do Handex (main,
// src/plugin/modules/onboarding.js) para o hac — 2026-08-24. No Handex,
// o onboarding é por FERRAMENTA (6 entradas, uma por view) porque são 6
// telas independentes. O hac é mono-funcional (só a11y, 2 views: home e
// specifications) — não faz sentido fatiar em várias entradas.
//
// Mesma arquitetura do Handex, preservada de propósito (não redesenhar):
//   - banner "Primeira vez aqui?" por view, dispensável, não-bloqueante
//   - modal genérico — stepper (múltiplos passos) com tela de "propósito"
//     antes do Passo 1
//   - persistência via figma.clientStorage, chave própria
//     ('hac-onboarding-seen'), por instalação do plugin — não por sessão
//     de trabalho, e fora de hacData (sobrevive a "Limpar Cache")
//
// Depende de: openModal/closeModal (core.js), _refreshIcons, showToast,
// getA11yProjectOrigin (accessibility.js)
// ============================================================

// Estado "visto" por jornada, populado a partir de init-plugin
// (onboardingSeen) em messages.js. Nunca lido diretamente por outros
// módulos — sempre via _onboardingSeen()/markOnboardingSeen().
let onboardingSeen = {};

// UMA jornada por origem — 'web' e 'mobile' (2026-09-09, decisão de
// produto). Antes existiam 4 entradas: 'especificar' (7 passos gerais,
// sem diferenciação de origem, aberta pelo banner "Primeira vez aqui?"
// e pelo ícone de chapéu) + 'lib-web-angular-react'/'lib-super-dsc-web'/
// 'lib-super-app' (3 passos cada, específicos de LIB, disparadas
// automaticamente e SEM ícone ao escolher a lib na Home). O designer via
// dois onboardings diferentes pro mesmo momento de "sou novo aqui": o
// automático (curto, específico) e o do banner/chapéu (mais longo,
// genérico) — sentindo que existiam "dois onboardings" quando clicava no
// chapéu depois. Pedido explícito do usuário: "Eu tenho uma jornada de
// onboarding pra web e outra pra mobile [...] esse onboarding precisa
// ter o mesmo conteúdo interno [...] tanto no banner, como clicando no
// ícone." Fundido numa jornada só por origem — banner, chapéu e a
// escolha da lib na Home (que não abre mais modal sozinha, só o banner)
// sempre convergem pra ESTA mesma fonte, nunca mais conteúdos
// divergentes. As 2 libs web (Web Angular&React/Super DSC Web) tinham
// texto quase idêntico e caem na mesma jornada 'web' (o hac já reconhece
// as duas simultaneamente, sem precisar de conteúdo por lib individual).
const ONBOARDING_TOOLS = {
  web: {
    view: 'view-specifications',
    title: 'Documentação de Acessibilidade — Web',
    icon: 'monitor',
    color: '#0891B2',
    format: 'stepper',
    // Onboarding é só o essencial pra começar a usar — não tenta cobrir
    // toda regra da vertical de acessibilidade (categorias, quando cada
    // uma se aplica, exceções por origem web/mobile). Quem quiser se
    // aprofundar vai direto na lib real "Design Acessível", fonte de
    // verdade de tudo que o hac referencia (mesmo link usado em
    // _renderA11yModalDscComponentName pra abrir um componente específico).
    purpose: 'O hac documenta, direto no canvas do Figma, como cada elemento da tela deve ser interpretado por um leitor de tela e em que ordem o teclado deve navegar por ela — para o time de desenvolvimento implementar acessibilidade sem depender de especificação à parte. O hac reconhece componentes das libs <strong>DSC Web Angular & React</strong> (legado) e <strong>Super DSC Web</strong> na mesma tela, já que as duas coexistem enquanto a migração de design system não termina. Os passos a seguir cobrem só o essencial para começar; para as regras completas de cada categoria, consulte a lib <a href="https://www.figma.com/design/3zdtN13YvPlCGPdXeL0Y2i" target="_blank" rel="noopener noreferrer" class="text-[#0891B2] dark:text-cyan-400 underline decoration-dotted hover:decoration-solid font-semibold">Design Acessível</a>.',
    steps: [
      { text: 'Clique em <strong>Marcar Área</strong> no topo da tela e selecione a seção que você quer documentar — vira um selo azul numerado no canvas. Pense na área como uma "pasta": ela não carrega regra de acessibilidade nenhuma sozinha, só organiza — as especificações criadas dentro dela aparecem juntas na listagem lateral do plugin, mesmo ficando soltas ao lado no canvas.' },
      { text: 'Dentro do espaço de trabalho da área, na aba Leitor de Tela, use <strong>Mapeamento Automático</strong> para o hac sugerir a categoria de cada componente do DSC ali dentro, comparando com o catálogo da lib "Design Acessível" — ou o botão <strong>Nova spec</strong> para começar do zero, manualmente, quando o elemento não bate com nenhum componente reconhecido (por exemplo, uma composição customizada que não existe no DSC).' },
      { text: 'No resumo do Mapeamento Automático, revise os grupos sugeridos e clique em <strong>Iniciar Revisão</strong> — cada item detectado abre para você confirmar, ajustar a categoria ou descartar antes de virar especificação, um de cada vez. O hac sugere a categoria pelo tipo de componente, mas quem decide é você: revise principalmente ícones e imagens, onde decorativo vs. informativo depende do contexto de uso, não só do componente em si.' },
      { text: 'Clique no card da área para abrir o espaço de trabalho dela, organizado em abas: <strong>Tabulação</strong> (ordem de navegação por teclado), <strong>Leitor de Tela</strong> (as especificações de conteúdo/semântica) e <strong>Handoff</strong> (o painel de status que consolida tudo o que já foi documentado nessa área). Web não tem a aba Swipe — esse gesto é exclusivo de leitores de tela mobile.' },
      { text: 'Cada especificação cai numa das <strong>5 categorias</strong>, todas com componente real nesta origem, e é criada/editada na aba <strong>Leitor de Tela</strong>: Elementos e Imagens, Estrutura da Página, Nível de Título, Elemento Decorativo ou Informações Adicionais. Toda categoria usa os mesmos dois campos de fundo — <strong>Descrição</strong> (como o elemento deve ou não ser lido em voz alta) e <strong>Notas de Código</strong> (o apontamento técnico que o dev usa para implementar, quando a variante tiver um). Veja o guia <strong>"?"</strong> no cabeçalho a qualquer momento para saber quando usar cada categoria e ver exemplos de código reais.' },
      { text: '<strong>Nível de Título</strong> segue a hierarquia H1-H6 — o H1 é o título único da página, os demais estruturam o conteúdo em ordem lógica. <strong>Elementos interativos e imagens</strong> cobre botões, links e imagens estáticas — ícones sozinhos precisam de texto alternativo descrevendo a função, não a aparência.' },
      { text: 'Componentes que o scan encontrou mas ainda não viraram especificação ficam no accordion <strong>"Não Documentados"</strong>, dentro da aba Leitor de Tela — clique em <strong>Criar spec</strong> para documentar qualquer um deles. É o jeito de garantir que nenhum componente da área fique de fora do handoff por esquecimento.' },
      { text: 'Para a <strong>Ordem de Tabulação</strong>, abra essa aba dentro do espaço de trabalho da área: clique nos elementos em sequência no canvas ou use <strong>Gerar Automaticamente</strong>. O hac cria uma cópia da área pra marcar, sem tocar no design original. Essa ordem é o que garante que quem navega só de teclado (sem mouse) passe pelos elementos numa sequência que faz sentido — normalmente a mesma ordem visual, de cima para baixo e da esquerda para a direita.' }
    ]
    // Bloco `reference` ("Quando usar cada categoria") REMOVIDO daqui
    // (2026-09-08) — vivia só neste onboarding, duplicando/competindo com
    // o conteúdo do modal "Entendendo as categorias"
    // (modals.html #a11y-categories-help-modal), que já é a fonte de
    // referência mais completa (definições das 5 categorias, filtro real
    // por origem web/mobile). Movido pra lá como accordion "Casos de
    // borda comuns", junto dos outros 2 blocos que já existiam ali
    // (Estrutura padrão de cada spec / Área → Especificação) — pedido
    // explícito do usuário. O passo 5 acima já aponta pro guia "?" pra
    // esse aprofundamento, sem duplicar o conteúdo aqui.
  },
  mobile: {
    view: 'view-specifications',
    title: 'Documentação de Acessibilidade — Mobile',
    icon: 'smartphone',
    color: '#0891B2',
    format: 'stepper',
    purpose: 'O hac documenta, direto no canvas do Figma, como cada elemento da tela deve ser interpretado por um leitor de tela e em que ordem o teclado/gesto deve navegar por ela — para o time de desenvolvimento implementar acessibilidade sem depender de especificação à parte. O hac reconhece componentes da lib <strong>Super DSC Mobile</strong> (DSC | Super App, React Native) — algumas categorias e regras são diferentes das libs web, cobertas nos passos abaixo. Os passos a seguir cobrem só o essencial para começar; para as regras completas de cada categoria, consulte a lib <a href="https://www.figma.com/design/3zdtN13YvPlCGPdXeL0Y2i" target="_blank" rel="noopener noreferrer" class="text-[#0891B2] dark:text-cyan-400 underline decoration-dotted hover:decoration-solid font-semibold">Design Acessível</a>.',
    steps: [
      { text: 'Clique em <strong>Marcar Área</strong> no topo da tela e selecione a seção que você quer documentar — vira um selo azul numerado no canvas. Pense na área como uma "pasta": ela não carrega regra de acessibilidade nenhuma sozinha, só organiza — as especificações criadas dentro dela aparecem juntas na listagem lateral do plugin, mesmo ficando soltas ao lado no canvas.' },
      { text: 'Dentro do espaço de trabalho da área, na aba Leitor de Tela, use <strong>Mapeamento Automático</strong> para o hac sugerir a categoria de cada componente do DSC ali dentro, comparando com o catálogo da lib "Design Acessível" — ou o botão <strong>Nova spec</strong> para começar do zero, manualmente, quando o elemento não bate com nenhum componente reconhecido (por exemplo, uma composição customizada que não existe no DSC).' },
      { text: 'No resumo do Mapeamento Automático, revise os grupos sugeridos e clique em <strong>Iniciar Revisão</strong> — cada item detectado abre para você confirmar, ajustar a categoria ou descartar antes de virar especificação, um de cada vez. O hac sugere a categoria pelo tipo de componente, mas quem decide é você: revise principalmente ícones e imagens, onde decorativo vs. informativo depende do contexto de uso, não só do componente em si.' },
      { text: 'Clique no card da área para abrir o espaço de trabalho dela, organizado em abas: <strong>Tabulação</strong> (ordem de navegação por teclado), <strong>Swipe</strong> (ordem de navegação por gesto, exclusiva do leitor de tela mobile), <strong>Leitor de Tela</strong> (as especificações de conteúdo/semântica) e <strong>Handoff</strong> (o painel de status que consolida tudo o que já foi documentado nessa área).' },
      { text: 'Só <strong>3 categorias</strong> têm componente real nesta lib: Elementos e Imagens, Nível de Título e Elemento Decorativo. Estrutura da Página e Informações Adicionais não existem no vocabulário desta lib e ficam ocultas na escolha. Toda categoria usa os mesmos dois campos de fundo — <strong>Descrição</strong> (como o elemento deve ou não ser lido em voz alta) e <strong>Notas de Código</strong> (o apontamento técnico que o dev usa para implementar). Veja o guia <strong>"?"</strong> no cabeçalho a qualquer momento para saber quando usar cada categoria e ver exemplos de código reais.' },
      { text: '<strong>Nível de Título</strong> não tem hierarquia H1-H6 como no desktop — todo título usa o mesmo marcador único "H". <strong>Elementos e Imagens</strong> tem 3 sub-variantes aqui: <strong>Componente</strong> (com campo Link do Componente, apontando pro nome/URL do componente no DSC | Super App), <strong>Link</strong> e <strong>Texto Alternativo</strong> (alt-text de mídia).' },
      { text: 'Componentes que o scan encontrou mas ainda não viraram especificação ficam no accordion <strong>"Não Documentados"</strong>, dentro da aba Leitor de Tela — clique em <strong>Criar spec</strong> para documentar qualquer um deles. É o jeito de garantir que nenhum componente da área fique de fora do handoff por esquecimento.' },
      { text: 'Para a <strong>Ordem de Tabulação</strong>, abra essa aba dentro do espaço de trabalho da área: clique nos elementos em sequência no canvas ou use <strong>Gerar Automaticamente</strong>. O hac cria uma cópia da área pra marcar, sem tocar no design original. Essa ordem é o que garante que quem navega só de teclado passe pelos elementos numa sequência que faz sentido.' },
      { text: 'Para a <strong>Trilha de Swipe</strong>, use o botão <strong>"ou usar a Ordem de Tabulação já mapeada"</strong> pra reaproveitar a sequência que você já revisou na Ordem de Tabulação, ou marque manualmente segurando shift e clicando nos elementos no canvas. É o gesto que quem usa o leitor de tela sem teclado físico percorre pra navegar pela tela.' }
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

// Qual jornada mostrar pra origem ATUAL do projeto (2026-09-09) — fonte
// única usada por banner, chapéu e pela escolha de lib na Home
// (chooseA11yHomeOrigin, accessibility.js, que não abre mais modal
// sozinha). getA11yProjectOrigin() é definida em accessibility.js.
function _onboardingKeyForCurrentOrigin() {
  return (typeof getA11yProjectOrigin === 'function' && getA11yProjectOrigin() === 'mobile') ? 'mobile' : 'web';
}

// Mostra o banner "Primeira vez aqui?" da jornada da origem ATUAL —
// mantém 1 elemento no HTML por jornada (#onboarding-banner-web/-mobile,
// mesmo padrão já usado por toolKey), escondendo explicitamente o da
// OUTRA origem: sem isso, trocar de origem no meio da sessão podia
// deixar os dois banners visíveis ao mesmo tempo (um já visto que nunca
// tinha sido escondido, outro novo). Chamado ao navegar para
// view-specifications (ver core.js, dentro de navigate()) e depois de
// escolher a lib na Home.
function maybeShowOnboardingBanner() {
  const currentKey = _onboardingKeyForCurrentOrigin();
  for (const key of Object.keys(ONBOARDING_TOOLS)) {
    const banner = document.getElementById(`onboarding-banner-${key}`);
    if (!banner) continue;
    banner.classList.toggle('hidden', key !== currentKey || _onboardingSeen(currentKey));
  }
}
window.maybeShowOnboardingBanner = maybeShowOnboardingBanner;

function dismissOnboardingBanner() {
  const toolKey = _onboardingKeyForCurrentOrigin();
  const banner = document.getElementById(`onboarding-banner-${toolKey}`);
  if (banner) banner.classList.add('hidden');
  markOnboardingSeen(toolKey);
}
window.dismissOnboardingBanner = dismissOnboardingBanner;

// Ponto de entrada único pro banner ("Ver agora") e pro ícone de chapéu
// ("Rever passo a passo") — os dois SEMPRE abrem a mesma jornada
// (web/mobile) da origem atual do projeto, nunca conteúdos divergentes
// (bug real corrigido 2026-09-09: antes, escolher a lib na Home abria um
// onboarding curto/específico automaticamente, e o chapéu abria outro
// mais longo/genérico — dois conteúdos diferentes pro mesmo momento).
function openOnboardingForCurrentOrigin(opts) {
  openOnboarding(_onboardingKeyForCurrentOrigin(), opts);
}
window.openOnboardingForCurrentOrigin = openOnboardingForCurrentOrigin;

// Abre o modal de onboarding — chamado tanto pelo banner ("Ver agora") quanto
// pelo botão de revisão no cabeçalho de specifications.html (a qualquer
// momento, sem alterar o estado "visto" nesse segundo caso — só o fluxo do
// banner marca como visto).
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
// aqui, sem quebrar o layout — nenhum passo tem media ainda (mesma
// pendência do Handex: hospedagem ainda não decidida).
function _onboardingMediaHTML(step) {
  if (!step.media) return '';
  return `<img src="${step.media}" alt="" class="w-full rounded-xl border border-gray-100 dark:border-dark-line mb-3" loading="lazy" />`;
}

// "Para que serve" -- sempre a PRIMEIRA coisa que o modal mostra, antes de
// qualquer passo de "como fazer" (tool.purpose, ver ONBOARDING_TOOLS).
function _onboardingPurposeHTML(tool) {
  if (!tool.purpose) return '';
  return `
    <div class="rounded-xl p-3.5 mb-4" style="background-color:${tool.color}0d">
      <p class="text-[12px] text-slate-700 dark:text-white leading-relaxed">${tool.purpose}</p>
    </div>
  `;
}

// Seção de referência rápida, sempre visível abaixo dos steps (não é um
// step do stepper — não força navegação). Nenhuma entrada do hac usa isso
// hoje, mas o formato fica pronto (mesmo padrão do Handex: `items` — lista
// ícone + texto — ou `html` bruto).
// Bug real corrigido (2026-09-08): o bloco de referência exibia
// categorias/regras exclusivas de libs WEB (ex.: "Estrutura da Página",
// "Informações Adicionais" — o próprio texto do item já dizia "Só existe
// em libs web") mesmo com um projeto MOBILE já escolhido, porque
// `reference.items` era renderizado sem nenhum filtro por origem —
// diferente do resto do produto, que já respeita esse filtro em todo
// lugar (ver _applyA11yCategoriesHelpOriginFilter, mesmo princípio "a
// origem mobile/web declarada filtra TODO catálogo/matching", memória
// de projeto hac_principio_origem_filtra_tudo). Cada item de
// `reference.items` pode declarar `originScope: 'web'|'mobile'` — item
// sem essa propriedade aparece nas duas origens (regra universal, ex.
// o caso de borda ícone-decorativo). Filtra ANTES de montar o HTML,
// usando a mesma fonte de verdade que o resto do onboarding/produto já
// usa (getA11yProjectOrigin()).
function _onboardingReferenceHTML(reference) {
  if (!reference) return '';
  const currentOrigin = (typeof getA11yProjectOrigin === 'function' && getA11yProjectOrigin()) || 'web';
  const visibleItems = (reference.items || []).filter(item => !item.originScope || item.originScope === currentOrigin);
  const body = reference.html || `
    <div class="space-y-2.5">
      ${visibleItems.map(item => `
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

  if (_onboardingCurrentStep === -1) {
    // Tela de propósito: sozinha, sem numeração "Passo N de M" (não é um
    // passo do stepper) -- só "para que serve" e um Próximo que avança pro
    // Passo 1.
    body.innerHTML = `
      <div class="rounded-xl p-3.5" style="background-color:${tool.color}0d">
        <p class="text-[13px] text-slate-700 dark:text-white leading-relaxed">${tool.purpose}</p>
      </div>
    `;
    footer.innerHTML = `
      <button type="button" onclick="closeOnboarding()" class="px-4 py-2 text-slate-500 dark:text-dark-muted font-bold text-[12px] rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Pular</button>
      <button type="button" onclick="_onboardingStep(1)" class="px-6 py-2 text-white font-bold text-[12px] rounded-xl transition-all" style="background-color:${tool.color}">Próximo</button>
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
        ${tool.steps.map((_, i) => `<span class="h-1.5 rounded-full transition-all ${i === _onboardingCurrentStep ? 'w-6' : 'w-1.5'}" style="background-color:${i <= _onboardingCurrentStep ? tool.color : '#e2e8f0'}"></span>`).join('')}
      </div>
      ${_onboardingMediaHTML(step)}
      <p class="text-[10px] font-bold uppercase tracking-wider mb-2" style="color:${tool.color}">Passo ${_onboardingCurrentStep + 1} de ${tool.steps.length}</p>
      <p class="text-[13px] text-slate-700 dark:text-white leading-relaxed">${step.text}</p>
      ${_onboardingReferenceHTML(tool.reference)}
    `;
    const showBack = !isFirst || !!tool.purpose;
    footer.innerHTML = `
      <button type="button" onclick="closeOnboarding()" class="px-4 py-2 text-slate-500 dark:text-dark-muted font-bold text-[12px] rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Pular</button>
      <div class="flex items-center gap-2">
        ${showBack ? '<button type="button" onclick="_onboardingStep(-1)" class="px-4 py-2 text-slate-600 dark:text-dark-muted font-bold text-[12px] rounded-xl border border-gray-200 dark:border-dark-line hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Voltar</button>' : ''}
        <button type="button" onclick="${isLast ? 'closeOnboarding()' : '_onboardingStep(1)'}" class="px-6 py-2 text-white font-bold text-[12px] rounded-xl transition-all" style="background-color:${tool.color}">${isLast ? 'Concluir' : 'Próximo'}</button>
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
      ${tool.purpose ? '<button type="button" onclick="_onboardingStep(-1)" class="px-4 py-2 text-slate-600 dark:text-dark-muted font-bold text-[12px] rounded-xl border border-gray-200 dark:border-dark-line hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Voltar</button>' : '<div></div>'}
      <button type="button" onclick="closeOnboarding()" class="px-6 py-2 text-white font-bold text-[12px] rounded-xl transition-all" style="background-color:${tool.color}">Entendi</button>
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
