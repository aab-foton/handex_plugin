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
// e pelo ícone de chapéu) + uma por LIB (3 passos cada, específicos de LIB, disparadas
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
// divergentes. A web tem uma jornada só ('web').
// Compilado por funcionalidade (2026-10-06, pedido do usuário): cada passo é
// uma funcionalidade, com o MESMO texto dos frames de instrução do Figma
// ("📱 | Template de Handoff Mobile" / "🖥️ | Template de Handoff Web"), lido de
// FICHA_INSTRUCTION_CONTENT_UI (refs/ficha-instruction-content.json — fonte
// única, a mesma das modais de instrução de cada aba). Web e mobile têm textos
// próprios; o Swipe só existe no mobile. Os passos são montados na abertura
// (_onboardingStepsFromContent), nunca escritos à mão aqui.
const ONBOARDING_TOOLS = {
  web: {
    view: 'view-specifications',
    title: 'Como utilizar o Plugin: Web',
    icon: 'monitor',
    color: '#005ca9',
    format: 'stepper',
    features: ['tabulacao', 'leitorTela'],
    steps: [],
  },
  mobile: {
    view: 'view-specifications',
    title: 'Como utilizar o Plugin: Mobile',
    icon: 'smartphone',
    color: '#005ca9',
    format: 'stepper',
    features: ['tabulacao', 'swipe', 'leitorTela'],
    steps: [],
  },
};

// Conteúdo de uma funcionalidade já resolvido para a plataforma (bloco `web`
// sobrepõe o texto-base, mesma regra de _resolveFichaInstructionContent).
function _onboardingFeatureContent(feature, toolKey) {
  const all = (typeof FICHA_INSTRUCTION_CONTENT_UI !== 'undefined') ? FICHA_INSTRUCTION_CONTENT_UI : null;
  let c = all && all[feature];
  if (!c) return null;
  if (toolKey === 'web' && c.web) {
    const { web, ...base } = c;
    c = { ...base, ...web };
  }
  return c;
}

function _onboardingStepsFromContent(toolKey) {
  const tool = ONBOARDING_TOOLS[toolKey];
  return (tool.features || []).map(feature => {
    const c = _onboardingFeatureContent(feature, toolKey);
    if (!c) return null;
    const steps = Array.isArray(c.steps) ? c.steps : [];
    const stepHtml = st => {
      const k = st.indexOf(':');
      return k > 0 ? `<strong>${escapeHtml(st.slice(0, k + 1))}</strong>${escapeHtml(st.slice(k + 1))}` : escapeHtml(st);
    };
    return {
      title: c.title,
      html: `
        <div class="space-y-3">
          <div class="rounded-dsc-medium border border-gray-100 dark:border-dark-line p-3">
            <p class="text-[12px] font-bold text-slate-800 dark:text-white mb-1.5">${escapeHtml(c.instructionsHeading || 'Instruções sobre a documentação')}</p>
            <p class="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">${escapeHtml(c.instructionsBody || '')}</p>
          </div>
          ${steps.length ? `
          <div class="rounded-dsc-medium border border-gray-100 dark:border-dark-line p-3">
            <p class="text-[12px] font-bold text-slate-800 dark:text-white mb-1.5">${escapeHtml(c.stepsHeading || 'Como fazer')}</p>
            <ol class="list-decimal pl-4 space-y-1.5 text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">
              ${steps.map(st => `<li>${stepHtml(st)}</li>`).join('')}
            </ol>
          </div>` : ''}
        </div>`,
    };
  }).filter(Boolean);
}

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
  return (typeof isA11yMobileProject === 'function' && isA11yMobileProject()) ? 'mobile' : 'web';
}

// Ponto de entrada único pro onboarding — chamado tanto automaticamente
// ao escolher a lib na Home (chooseA11yHomeOrigin, accessibility.js)
// quanto pelo ícone de chapéu ("Como utilizar o Plugin") a qualquer
// momento. SEMPRE abre a mesma jornada (web/mobile) da origem atual do
// projeto, nunca conteúdos divergentes (bug real corrigido 2026-09-09).
// Banner "Primeira vez aqui?" removido (2026-09-10, pedido do usuário) —
// ficou redundante com a abertura automática ao escolher a lib.
function openOnboardingForCurrentOrigin(opts) {
  openOnboarding(_onboardingKeyForCurrentOrigin(), opts);
}
window.openOnboardingForCurrentOrigin = openOnboardingForCurrentOrigin;

// Abre o modal de onboarding — chamado automaticamente ao escolher a lib
// (onlyIfUnseen: true, só abre se ainda não visto por essa jornada) e
// pelo botão de revisão no cabeçalho de specifications.html (sem
// onlyIfUnseen, sempre abre, sem alterar o estado "visto" nesse caso).
let _onboardingCurrentTool = null;
let _onboardingCurrentStep = 0;

function openOnboarding(toolKey, { markSeenOnOpen = false, onlyIfUnseen = false } = {}) {
  const tool = ONBOARDING_TOOLS[toolKey];
  if (!tool) return;
  if (onlyIfUnseen && _onboardingSeen(toolKey)) return;
  _onboardingCurrentTool = toolKey;
  tool.steps = _onboardingStepsFromContent(toolKey);
  if (!tool.steps.length) return;
  // -1 é a tela de "propósito" (para que serve), exibida sozinha antes do
  // Passo 1 -- só existe quando a ferramenta tem tool.purpose cadastrado.
  _onboardingCurrentStep = tool.purpose ? -1 : 0;
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
  return `<img src="${step.media}" alt="" class="w-full rounded-dsc-medium border border-gray-100 dark:border-dark-line mb-3" loading="lazy" />`;
}

// Bloco expansível (<details>) com os passos NUMERADOS reais do template
// oficial de Handoff (FICHA_INSTRUCTION_CONTENT_UI.tabulacao/.leitorTela —
// ver refs/build-ficha-instruction-constants.cjs), usado dentro do texto
// dos passos de Ordem de Tabulação/Leitor de Tela dos dois onboardings
// (web e mobile). Fechado por padrão (<details> sem `open`) — o passo já
// tem um resumo escrito à mão; isso é "aprofunde se quiser", não conteúdo
// obrigatório de leitura, pra não poluir o onboarding com texto redundante.
// Sem `open` some silenciosamente quando FICHA_INSTRUCTION_CONTENT_UI não
// existir (bundle antigo/caso de erro) ou o bloco vier vazio (ex.: swipe,
// que não tem frame de instrução na lib ainda) — nunca quebra o onboarding.
function _onboardingFichaStepsHTML(richContent, origin) {
  // Web tem texto próprio (2026-10-01) — mesma regra de _resolveFichaInstructionContent (onmessage.js).
  if (richContent && richContent.web && origin === 'web') {
    const { web, ...base } = richContent;
    richContent = { ...base, ...web };
  }
  if (!richContent || !Array.isArray(richContent.steps) || richContent.steps.length === 0) return '';
  return `
    <details class="mt-2 group">
      <summary class="text-dsc-label-tiny font-bold uppercase tracking-wider text-slate-400 dark:text-dark-muted cursor-pointer select-none list-none flex items-center gap-1">
        <i data-lucide="chevron-right" class="w-3 h-3 transition-transform group-open:rotate-90"></i>
        Ver passo a passo do template oficial${richContent.stepsHeading ? `: ${richContent.stepsHeading}` : ''}
      </summary>
      <ol class="mt-2 space-y-1.5 list-none pl-4">
        ${richContent.steps.map((s, i) => `
          <li class="flex gap-1.5 text-dsc-label-tiny normal-case tracking-normal text-slate-500 dark:text-dark-muted leading-snug">
            <span class="font-bold shrink-0">${i + 1}.</span>
            <span>${s}</span>
          </li>
        `).join('')}
      </ol>
    </details>
  `;
}

// "Para que serve" -- sempre a PRIMEIRA coisa que o modal mostra, antes de
// qualquer passo de "como fazer" (tool.purpose, ver ONBOARDING_TOOLS).
function _onboardingPurposeHTML(tool) {
  if (!tool.purpose) return '';
  return `
    <div class="rounded-dsc-medium p-3.5 mb-4" style="background-color:${tool.color}0d">
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
          <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-500 dark:text-dark-muted leading-tight">${item.text}</p>
        </div>
      `).join('')}
    </div>
  `;
  return `
    <div class="border-t border-gray-100 dark:border-dark-line my-4"></div>
    <p class="text-dsc-label-tiny font-bold uppercase tracking-wider text-slate-500 dark:text-dark-muted mb-2.5">${reference.title}</p>
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
      <div class="rounded-dsc-medium p-3.5" style="background-color:${tool.color}0d">
        <p class="text-[14px] text-slate-700 dark:text-white leading-relaxed">${tool.purpose}</p>
      </div>
    `;
    footer.innerHTML = `
      <button type="button" onclick="closeOnboarding()" class="px-4 py-2 text-slate-500 dark:text-dark-muted font-bold text-[12px] rounded-dsc-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Pular</button>
      <button type="button" onclick="_onboardingStep(1)" class="px-6 py-2 text-white font-bold text-[12px] rounded-dsc-medium transition-all" style="background-color:${tool.color}">Próximo</button>
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
        ${tool.steps.map((_, i) => `<span class="h-1.5 rounded-dsc-circ transition-all ${i === _onboardingCurrentStep ? 'w-6' : 'w-1.5'}" style="background-color:${i <= _onboardingCurrentStep ? tool.color : '#d0e0e3'}"></span>`).join('')}
      </div>
      ${_onboardingMediaHTML(step)}
      <p class="text-dsc-label-tiny font-bold uppercase tracking-wider mb-1" style="color:${tool.color}">Passo ${_onboardingCurrentStep + 1} de ${tool.steps.length}</p>
      ${step.title ? `<p class="text-[16px] font-bold text-slate-800 dark:text-white mb-3">${escapeHtml(step.title)}</p>` : ''}
      ${step.html || `<p class="text-[14px] text-slate-700 dark:text-white leading-relaxed">${step.text}</p>`}
      ${_onboardingReferenceHTML(tool.reference)}
    `;
    const showBack = !isFirst || !!tool.purpose;
    footer.innerHTML = `
      <button type="button" onclick="closeOnboarding()" class="px-4 py-2 text-slate-500 dark:text-dark-muted font-bold text-[12px] rounded-dsc-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Pular</button>
      <div class="flex items-center gap-2">
        ${showBack ? '<button type="button" onclick="_onboardingStep(-1)" class="px-4 py-2 text-slate-600 dark:text-dark-muted font-bold text-[12px] rounded-dsc-medium border border-gray-200 dark:border-dark-line hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Voltar</button>' : ''}
        <button type="button" onclick="${isLast ? 'closeOnboarding()' : '_onboardingStep(1)'}" class="px-6 py-2 text-white font-bold text-[12px] rounded-dsc-medium transition-all" style="background-color:${tool.color}">${isLast ? 'Concluir' : 'Próximo'}</button>
      </div>
    `;
  } else {
    body.innerHTML = `
      <ol class="space-y-3 list-none">
        ${tool.steps.map((s, i) => `
          <li class="flex gap-2.5">
            <span class="w-5 h-5 rounded-dsc-circ font-black text-dsc-label-tiny normal-case tracking-normal flex items-center justify-center shrink-0 mt-0.5" style="background-color:${tool.color}1a;color:${tool.color}">${i + 1}</span>
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
      ${tool.purpose ? '<button type="button" onclick="_onboardingStep(-1)" class="px-4 py-2 text-slate-600 dark:text-dark-muted font-bold text-[12px] rounded-dsc-medium border border-gray-200 dark:border-dark-line hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Voltar</button>' : '<div></div>'}
      <button type="button" onclick="closeOnboarding()" class="px-6 py-2 text-white font-bold text-[12px] rounded-dsc-medium transition-all" style="background-color:${tool.color}">Entendi</button>
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
