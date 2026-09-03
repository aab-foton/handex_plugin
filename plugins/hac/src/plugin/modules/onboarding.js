// ============================================================
// onboarding.js — hac
//
// ADAPTAÇÃO do onboarding contextual do Handex (main,
// src/plugin/modules/onboarding.js) para o hac — 2026-08-24. No Handex,
// o onboarding é por FERRAMENTA (6 entradas, uma por view) porque são 6
// telas independentes. O hac é mono-funcional (só a11y, 2 views: home e
// specifications) — não faz sentido fatiar em várias entradas, então
// ONBOARDING_TOOLS tem uma única chave ('especificar') cobrindo o fluxo
// inteiro de ponta a ponta: Marcar Área → Especificar → Detecção
// Automática → Ordem de Tabulação.
//
// Mesma arquitetura do Handex, preservada de propósito (não redesenhar):
//   - banner "Primeira vez aqui?" por view, dispensável, não-bloqueante
//   - modal genérico — stepper (múltiplos passos) com tela de "propósito"
//     antes do Passo 1
//   - persistência via figma.clientStorage, chave própria
//     ('hac-onboarding-seen'), por instalação do plugin — não por sessão
//     de trabalho, e fora de hacData (sobrevive a "Limpar Cache")
//
// Depende de: openModal/closeModal (core.js), _refreshIcons, showToast
// ============================================================

// Estado "visto" por ferramenta, populado a partir de init-plugin
// (onboardingSeen) em messages.js. Nunca lido diretamente por outros
// módulos — sempre via _onboardingSeen()/markOnboardingSeen().
let onboardingSeen = {};

const ONBOARDING_TOOLS = {
  especificar: {
    view: 'view-specifications',
    title: 'Documentação de Acessibilidade',
    icon: 'accessibility',
    color: '#0891B2',
    format: 'stepper',
    purpose: 'O hac documenta, direto no canvas do Figma, como cada elemento da tela deve ser interpretado por um leitor de tela e em que ordem o teclado deve navegar por ela — para o time de desenvolvimento implementar acessibilidade sem depender de especificação à parte.',
    steps: [
      { text: 'Clique em <strong>Marcar Área</strong> no topo da tela e selecione a seção que você quer documentar — vira um selo numerado no canvas, e todas as especificações dela nascem agrupadas ali dentro.' },
      { text: 'Ao marcar a área, escolha <strong>Detecção Automática</strong> para o hac varrer os componentes do DSC ali dentro e sugerir a categoria de cada um — ou <strong>Manual</strong> para começar do zero e usar o botão <strong>Nova spec</strong> no cabeçalho da área. No modo Manual, selecione o elemento no canvas antes de aplicar: a especificação nasce travada e posicionada ao lado dele — use o cadeado na listagem para destravar depois.' },
      { text: 'No resumo da Detecção Automática, revise os grupos sugeridos e clique em <strong>Iniciar Revisão</strong> — cada item detectado abre para você confirmar, ajustar ou descartar antes de virar especificação. No topo do formulário, use <strong>Voltar</strong>/<strong>Avançar</strong> para passear item a item pela revisão, ou digite o número do item no campo central e pressione Enter para pular direto para ele, em qualquer ordem — itens já documentados aparecem com o rótulo "Documentado" e não podem ser confirmados de novo, descartados aparecem com o rótulo "Descartado" e continuam podendo ser reconsiderados. Se o hac sugeriu a categoria errada, use o ícone de trocar ao lado do título do formulário para escolher outra das 5 categorias sem perder o elemento selecionado. Textos sem nenhum token do DSC vinculado aparecem à parte, no bloco <strong>"Possíveis títulos sem token DSC"</strong> — vincule o Text Style no Figma e use o botão de <strong>Reescanear</strong> no topo do modal para atualizar sem perder o que já tinha revisado.' },
      { text: 'Cada especificação cai numa das <strong>5 categorias</strong>: Elementos e Imagens, Estrutura da Página, Nível de Título, Elemento Decorativo ou Informações Adicionais — veja o guia <strong>"?"</strong> no cabeçalho a qualquer momento para saber quando usar cada uma.' },
      { text: 'Componentes que o scan encontrou mas ainda não viraram especificação ficam no accordion <strong>"Não Documentados"</strong>, dentro da própria área — clique em <strong>Criar spec</strong> em qualquer item de lá para documentá-lo; ele some da lista assim que a especificação nasce.' },
      { text: 'Para a <strong>Ordem de Tabulação</strong>, abra a seção correspondente dentro da área: clique nos elementos em sequência no canvas ou use <strong>Gerar Automaticamente</strong>. Assim que você inicia, o hac já cria uma <strong>cópia da área</strong> num espaço livre do canvas e leva você até ela — a marcação acontece sempre nessa cópia, nunca em cima do design original nem dos selos de outras especificações.' }
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
// para view-specifications (ver core.js, dentro de navigate()).
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
