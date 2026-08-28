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
    color: '#334155',
    format: 'single',
    purpose: 'É o painel central do handoff: daqui você navega para cada ferramenta de documentação e, quando tudo estiver pronto, consolida o trabalho numa Ficha de Handoff única no canvas.',
    steps: [
      { text: 'Os 6 cards levam a cada ferramenta do handoff: <strong>Informações do Projeto</strong>, <strong>Escanear Tokens</strong>, <strong>Anotar Specs</strong>, <strong>Anotar Medidas</strong> e <strong>Fluxos de Tela</strong>.' },
      { text: 'Você pode <strong>reorganizar os cards</strong> do jeito que preferir: passe o mouse sobre um card, segure a alcinha <strong>⠿</strong> que aparece no canto e arraste sobre outro card para trocar de lugar.' },
      { text: 'A ordem escolhida fica <strong>salva neste computador</strong> — é uma preferência pessoal sua, não é salva no projeto nem exportada junto com a ficha.' },
      { text: 'Quando terminar de documentar, use <strong>Gerar Ficha de Handoff</strong> no rodapé para consolidar tudo no canvas.' }
    ]
  },
  dadosProjeto: {
    view: 'view-dados-projeto',
    title: 'Informações do Projeto',
    icon: 'clipboard-list',
    color: '#005ca9',
    format: 'single',
    purpose: 'Registra o contexto do que está sendo entregue — título, objetivo, equipe responsável e, dentro de Contexto de Negócio, o briefing estratégico, as regras de negócio/HUs e os links de referência. Esse contexto aparece no topo da ficha final, para o dev entender o "porquê" da entrega antes de mergulhar no "como" — sem precisar te perguntar no Slack ou adivinhar pelo protótipo.',
    steps: [
      { text: 'Clique em <strong>Informações do Projeto</strong> na home — o modal abre sobre qualquer tela, sem precisar sair do que está fazendo.' },
      { text: 'Preencha <strong>Título</strong>, <strong>Versão</strong> e <strong>Objetivo</strong> — esses três campos são obrigatórios para gerar a ficha.' },
      { text: 'Adicione ao menos <strong>1 membro de equipe</strong> com nome preenchido — sem isso o botão de gerar ficha fica bloqueado. O e-mail é opcional.' },
      { text: 'As três seções de <strong>Contexto de Negócio</strong> são opcionais e vêm ativadas por padrão — cada uma tem seu próprio toggle no cabeçalho: desativar esconde a seção sem apagar nada já preenchido, útil quando ela não se aplica a este projeto.' },
      { text: '<strong>Briefing Estratégico:</strong> perguntas de negócio organizadas em 5 eixos (Contexto do Projeto, Escopo e Riscos, Usuários e Stakeholders, UX e Design, Pesquisa e Evidências) — o lugar de registrar o "porquê" da entrega, decisões de escopo e riscos conhecidos, para o dev não perder esse contexto quando o design já estiver pronto. Use o ícone <strong>?</strong> para abrir o Guia e inserir perguntas sugeridas com um clique; o menu <strong>⋮</strong> reúne baixar template em branco, importar/exportar em .md e limpar tudo.' },
      { text: '<strong>Regras de Negócio e HUs:</strong> lógica que não aparece no design em si — campos obrigatórios, validações, condições de exibição, histórias de usuário vinculadas. Sem isso documentado, o dev tem que adivinhar essas regras só olhando a tela ou te interromper para perguntar.' },
      { text: '<strong>Links de Referência:</strong> URLs de Protótipo Navegável, Handoff de Acessibilidade e Pesquisa de UX — cada um vira um link clicável direto na ficha final, levando o dev para a fonte original sem precisar pedir de novo.' },
      { text: 'Tudo é <strong>salvo automaticamente</strong> a cada alteração — não é preciso clicar em nenhum botão para não perder o que preencheu.' }
    ]
  },
  handoff: {
    view: 'view-frames',
    title: 'Escanear Tokens',
    icon: 'scan-line',
    color: '#0284c7',
    format: 'stepper',
    purpose: 'Não é uma leitura automática que basta rodar uma vez: o scan traz cores, tipografia, componentes e vetores do frame, já com um batimento automático contra o Design System CAIXA — mas o critério é exigente. Sem token vinculado, o item conta como fora do padrão, sem meio-termo. Cabe a você revisar cada caso, como no Check Designs nativo do Figma, e decidir: ajustar o elemento ou justificar o desvio por escrito. Quando o frame traz um componente inédito, ainda fora do DSC, a ferramenta registra as propriedades dele como referência para uma futura incorporação.',
    steps: [
      { text: 'Com esta ferramenta aberta, <strong>selecione um Frame</strong> (ou Componente, Seção, Grupo) no canvas do Figma.' },
      { text: 'Clique em <strong>+ Registrar Frame</strong> — o plugin captura o ID e o nome do elemento selecionado, cria um card e escaneia automaticamente Componentes, Ícones, Tipografia e Vetores.' },
      { text: 'O resultado aparece agrupado por tipo em <strong>Tokens Escaneados</strong>, já com o batimento automático: cada item mostra "Em conformidade", "Necessita revisão" ou "Fora do padrão", com a contagem de propriedades em cada status. <strong>Este é o passo que exige sua revisão:</strong> expanda cada item para ver o token aplicado (trilha completa, ex: <em>cor › primária › 500</em>) e clique nele para <strong>focar o elemento correspondente no canvas</strong> e confirmar visualmente se o vínculo faz sentido.' },
      { text: 'Se algum item não tem token vinculado, ele aparece destacado. O painel <strong>"Itens para revisar"</strong>, no topo do card, reúne todos esses casos num só lugar — clique em qualquer um para ir direto ao elemento.' },
      { text: 'Mudou algo no frame depois do primeiro scan? O ícone de <strong>atualizar</strong>, ao lado de "Tokens Escaneados", re-escaneia a qualquer momento sem perder o que já foi declarado — o batimento automático não é ao vivo, só reflete o estado do Figma no momento em que você escaneou.' },
      { text: 'Declare a <strong>Conformidade DSC</strong>: marque "Check Designs realizado" e informe se há desvios. O critério é rígido — um item sem token vinculado mantém o frame como <strong>"Não Conforme" (vermelho)</strong> mesmo que você marque "Sem desvios", até você escrever uma justificativa no campo de observações. Com a justificativa preenchida, o status passa para <strong>"Em revisão" (amarelo)</strong> — nunca vira "conforme" por omissão.' },
      { text: 'Se o frame é um <strong>Novo Componente</strong>, ative o toggle — a seção de conformidade é ocultada (não se aplica a componentes inéditos) e o frame é destacado na ficha.' }
    ]
  },
  specs: {
    view: 'view-specifications',
    title: 'Anotar Specs',
    icon: 'tag',
    color: '#4f46e5',
    format: 'stepper',
    purpose: 'Registra decisões técnicas específicas de um elemento — regra de negócio, comportamento, valor de token aplicado — que o scan automático não capta sozinho. É a camada de contexto que só o designer sabe explicar, ancorada visualmente no elemento certo do canvas.',
    steps: [
      { text: '<strong>Selecione um elemento</strong> no canvas do Figma — pode ser um componente, texto, ícone ou qualquer elemento.' },
      { text: 'Clique no <strong>botão +</strong> no topo da view. O formulário abre com o elemento vinculado, mostrado em <strong>"Especificando: [nome]"</strong> no topo — essa referência fica fixa do início ao fim do fluxo.' },
      { text: 'Defina a <strong>Tag</strong> (referência do grupo, ex: A, B, A1) e a <strong>Categoria</strong> — Informação extra, Comportamento, Regra de Negócio ou Dados da API; a cor do grupo vem automaticamente da categoria. Adicione uma <strong>Nota personalizada</strong> (opcional), escolha se quer inserir linha de conexão no canvas e, em <strong>Propriedades</strong>, marque os atributos técnicos identificados no scan.' },
      { text: 'Ao avançar, você entra direto na etapa <strong>Posição no Canvas</strong>: o modal continua aberto e uma prévia tracejada já aparece no canvas — arraste-a até onde quiser e clique em <strong>Usar esta posição</strong>. O fluxo já segue direto para a próxima etapa (Cenário de Exceção). Não quer marcar? Clique em <strong>Pular</strong> e a spec nasce solta à direita do elemento.' },
      { text: 'Sem marcar posição, arraste o card pra onde quiser depois e use <strong>Travar especificação</strong> no menu "..." para concluir: a linha guia é recalculada automaticamente a partir de onde o card ficou. Mesma letra empilha verticalmente; letra diferente abre nova coluna.' },
      { text: 'No cabeçalho de cada grupo, você pode <strong>nomear o grupo</strong>, <strong>ocultar as linhas</strong> de conexão, <strong>ocultar o grupo</strong> inteiro, ou usar o menu "..." para travar/destravar e excluir o grupo todo.' },
      { text: 'Para cenários alternativos, expanda uma spec e clique em <strong>+ Exceção</strong> — Erro, Sucesso, Alerta ou Confirmação.' }
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
  medidas: {
    view: 'view-measurement',
    title: 'Anotar Medidas',
    icon: 'ruler',
    color: '#0e7490',
    format: 'stepper',
    purpose: 'Converte espaçamentos e dimensões do canvas em anotações visíveis — altura, largura, margens, paddings e gaps — para o dev implementar sem precisar inspecionar o Figma medida por medida.',
    steps: [
      { text: '<strong>Selecione 1 ou mais elementos</strong> no canvas do Figma que você quer documentar dimensionalmente.' },
      { text: 'Clique no <strong>botão +</strong> no topo da view e escolha ao menos um tipo: <strong>W × H</strong> (largura/altura), <strong>Margin</strong> (espaçamento externo), <strong>Padding</strong> (espaçamento interno) ou <strong>Spacing</strong> (padding + gaps automáticos).' },
      { text: 'Confirme — as anotações são criadas no canvas e aparecem na lista do plugin com nome e valores.' },
      { text: 'Use o botão <strong>Ocultar tudo</strong> para esconder temporariamente todas as medidas do canvas sem excluí-las.' }
    ],
    // Conteúdo migrado do popover "Tipos de medida" (circle-help do
    // header, removido — ver views/measurement.html). Referência de
    // consulta, sempre visível abaixo dos steps.
    reference: {
      title: 'Tipos de medida',
      items: [
        { icon: 'scaling', text: '<strong>Altura e Largura:</strong> dimensões do elemento selecionado.' },
        { icon: 'box-select', text: '<strong>Espaçamento Externo:</strong> distância entre o elemento e seus vizinhos.' },
        { icon: 'focus', text: '<strong>Padding Interno:</strong> espaço entre a borda do frame e seu conteúdo.' },
        { icon: 'align-horizontal-space-between', text: '<strong>Padding e Gaps:</strong> espaçamentos internos de um Auto Layout.' }
      ]
    }
  },
  fluxos: {
    view: 'view-flows',
    title: 'Fluxos de Tela',
    icon: 'git-branch',
    color: '#9333ea',
    format: 'single',
    purpose: 'Mapeia a navegação entre telas — sequências, decisões e eventos — para o dev enxergar a jornada completa antes de implementar cada tela isoladamente.',
    steps: [
      { text: 'Selecione <strong>2 ou mais elementos</strong> no canvas e clique em <strong>+ Conectar Frames</strong>. Com 3 ou mais, o plugin conecta em cadeia automaticamente.' },
      { text: 'O texto que você digitar em <strong>Nome da Jornada</strong> nomeia o card que agrupa todas as conexões que se tocam na lista de Fluxos — não é o nome de uma linha isolada. Se a seleção estender uma jornada já existente, deixe em branco para manter o nome atual.' },
      { text: 'Marque <strong>Marcar início e fim automaticamente</strong> (opcional) para que o primeiro elemento selecionado receba o marcador de Início e o último o de Fim.' },
      { text: 'Escolha o tipo: <strong>Sequência</strong> (transição direta), <strong>Mensagem</strong> (evento/assíncrono), <strong>Decisão</strong> (bifurcação, obriga texto, só com 2 elementos) ou <strong>Decisão (Opcional)</strong> (condicional, também só com 2 elementos).' },
      { text: 'Quer ramificar uma decisão a partir de um card no meio de uma cadeia já criada? Não dá na mesma operação — conecte esse card com o novo elemento <strong>separadamente</strong>, escolhendo Decisão. Outra opção: crie a conexão como Sequência e depois troque o tipo pra Decisão editando a conexão já criada.' },
      { text: 'No mini-mapa de ancoragem, clique numa borda de qualquer card para escolher, por card, o lado de onde a conexão sai — o mapa reflete a posição real dos elementos no canvas. O toggle <strong>Auto</strong> no topo do mini-mapa limpa todas as escolhas manuais de uma vez.' },
      { text: 'O estilo da linha pode ser <strong>Reta</strong> ou <strong>Angular</strong>. O texto do chip/decisão tem limite de 20 caracteres.' },
      { text: 'O fluxo é criado no canvas e aparece na lista — clique no ícone de foco para <strong>focar na seta</strong>. Numa conexão já criada, o modal de edição também permite trocar o <strong>tipo</strong> sem apagar e reconectar.' }
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
    color: '#004d8d',
    format: 'single',
    purpose: 'Consolida tudo que foi documentado — specs, medidas, fluxos e conformidade com o DSC — num documento único e versionado no canvas, pronto para a entrega ao time de desenvolvimento.',
    steps: [
      { text: 'Verifique os <strong>pré-requisitos</strong>: título, objetivo, ao menos 1 membro de equipe com nome preenchido.' },
      { text: 'Clique em <strong>Gerar Ficha</strong> no topo. Se já existe uma ficha, o plugin pergunta se a nova versão é <strong>Minor</strong> (ajuste) ou <strong>Major</strong> (redesenho).' },
      { text: 'A ficha é criada no canvas, posicionada fora dos frames existentes, e nasce <strong>desbloqueada</strong> para você organizar à vontade.' },
      { text: 'Você também pode exportar a documentação como <strong>Markdown</strong> ou <strong>JSON</strong> — útil para compartilhar com devs sem acesso ao Figma.' }
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
    // Passo 1. Mesmo layout pras ferramentas 'single' e 'stepper'.
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
