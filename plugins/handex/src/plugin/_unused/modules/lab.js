// ============================================================
// lab.js — Laboratório de Design
//
// Catálogo de frameworks estratégicos de UX/Design.
// Futuramente cada item terá injeção direta no canvas Figma.
// ============================================================

const LAB_FRAMEWORKS = [
  {
    id: 'briefing',
    name: 'Briefing Estruturado',
    icon: 'clipboard-list',
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    tag: 'Descoberta',
    tagColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    description: 'Alinha o time no início do projeto: contexto, escopo, atores, riscos e critérios de sucesso em um único artefato.',
    when: 'Kickoff do projeto ou quando a demanda chega sem documentação clara.',
    sections: ['Contexto', 'Resultados-chave', 'Atores', 'Está no escopo', 'Pode entrar', 'Não está', 'Dependências', 'Riscos', 'Prazo']
  },
  {
    id: 'csd',
    name: 'Matriz CSD',
    icon: 'triangle-alert',
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    tag: 'Alinhamento',
    tagColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    description: 'Mapeia o que o time sabe (Certezas), o que supõe (Suposições) e o que ainda precisa descobrir (Dúvidas).',
    when: 'Antes de sair para pesquisa ou quando o time tem muita divergência de visão.',
    sections: ['Certezas', 'Suposições', 'Dúvidas']
  },
  {
    id: 'five-whys',
    name: '5 Porquês',
    icon: 'search',
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    tag: 'Diagnóstico',
    tagColor: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    description: 'Investiga a causa raiz de um problema através de cinco camadas sucessivas de questionamento.',
    when: 'Quando o problema é conhecido mas a causa real ainda não está clara.',
    sections: ['Problema', 'Por quê? 1', 'Por quê? 2', 'Por quê? 3', 'Por quê? 4', 'Por quê? 5', 'Causa Raiz']
  },
  {
    id: 'stakeholders',
    name: 'Mapa de Stakeholders',
    icon: 'users',
    color: 'text-teal-500',
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    tag: 'Alinhamento',
    tagColor: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    description: 'Organiza os envolvidos em círculos concêntricos por nível de influência e proximidade com o projeto.',
    when: 'No início do projeto para mapear quem decide, quem aprova e quem apenas é informado.',
    sections: ['Core Team', 'Consultar', 'Informar', 'Monitorar']
  },
  {
    id: 'value-effort',
    name: 'Matriz Valor × Esforço',
    icon: 'layout-grid',
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-900/20',
    tag: 'Priorização',
    tagColor: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    description: 'Prioriza iniciativas cruzando o valor entregue ao usuário com o esforço de implementação.',
    when: 'Quando há muitas iniciativas em disputa e o time precisa decidir o que fazer primeiro.',
    sections: ['Quick Wins (alto valor, baixo esforço)', 'Grandes Apostas (alto valor, alto esforço)', 'Fill-ins (baixo valor, baixo esforço)', 'Thankless Tasks (baixo valor, alto esforço)']
  },
  {
    id: 'atomic-research',
    name: 'Atomic Research',
    icon: 'atom',
    color: 'text-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    tag: 'Pesquisa',
    tagColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    description: 'Estrutura os achados de pesquisa em quatro níveis atômicos: Experimento, Fato, Insight e Conclusão.',
    when: 'Para registrar e compartilhar pesquisas de forma rastreável e reaproveitável.',
    sections: ['Experimento', 'Fato', 'Insight', 'Conclusão']
  },
  {
    id: 'blueprint',
    name: 'Blueprint de Serviço',
    icon: 'map',
    color: 'text-indigo-500',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    tag: 'Mapeamento',
    tagColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    description: 'Mapeia a experiência completa do serviço em swim lanes, incluindo o que o usuário vê e o que acontece nos bastidores.',
    when: 'Para visualizar a entrega ponta a ponta e identificar gaps entre front e backstage.',
    sections: ['Evidências', 'Jornada do Usuário', 'Ações de Frontstage', 'Tecnologia', 'Ações de Backstage', 'Processos de Suporte']
  },
  {
    id: 'heuristics',
    name: 'Heurísticas de Nielsen',
    icon: 'shield-check',
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    tag: 'Avaliação',
    tagColor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    description: 'Avalia a usabilidade de interfaces com base nas 10 heurísticas clássicas de Jakob Nielsen.',
    when: 'Revisão de usabilidade de um fluxo existente antes de entregar para dev.',
    sections: ['Visibilidade do status', 'Correspondência com o mundo real', 'Controle do usuário', 'Consistência e padrões', 'Prevenção de erros', 'Reconhecimento', 'Flexibilidade', 'Estética e minimalismo', 'Recuperação de erros', 'Ajuda e documentação']
  },
  {
    id: 'opportunities',
    name: 'Mapa de Oportunidades',
    icon: 'lightbulb',
    color: 'text-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    tag: 'Ideação',
    tagColor: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    description: 'Organiza oportunidades identificadas em clusters por tema, permitindo visualizar padrões e prioridades.',
    when: 'Após rodadas de pesquisa ou brainstorm, para sintetizar e agrupar descobertas.',
    sections: ['Clusters temáticos', 'Prioridade', 'Responsável', 'Próximos passos']
  },
  {
    id: 'personas',
    name: 'Painel de Personas',
    icon: 'user-circle',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    tag: 'Descoberta',
    tagColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    description: 'Constrói um perfil tangível do seu usuário, alinhando necessidades, objetivos e características-chave.',
    when: 'No início do projeto ou após pesquisas exploratórias, para alinhar quem é o usuário central.',
    sections: ['Dados demográficos', 'Objetivos', 'Necessidade', 'Oportunidades']
  },
  {
    id: 'interview-script',
    name: 'Roteiro de Entrevistas',
    icon: 'mic',
    color: 'text-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    tag: 'Pesquisa',
    tagColor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    description: 'Estrutura um guia seguro e neutro para conduzir entrevistas de profundidade com usuários.',
    when: 'Antes de iniciar qualquer ciclo de entrevistas qualitativas.',
    sections: ['Aquecimento', 'Descoberta', 'Aprofundamento', 'Encerramento']
  },
  {
    id: 'journey',
    name: 'Jornada de Usuário',
    icon: 'route',
    color: 'text-cyan-500',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    tag: 'Mapeamento',
    tagColor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    description: 'Visualiza o passo a passo da experiência do usuário, mapeando dores, sentimentos e pensamentos ao longo do tempo.',
    when: 'Para entender o cenário atual ou desenhar o fluxo ideal de uma experiência complexa.',
    sections: ['Etapas', 'Ações', 'Pensamentos', 'Sentimentos', 'Oportunidades', 'Curva de Experiência']
  },
  {
    id: 'relational-map',
    name: 'Mapa Relacional',
    icon: 'network',
    color: 'text-sky-500',
    bg: 'bg-sky-50 dark:bg-sky-900/20',
    tag: 'Ideação',
    tagColor: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    description: 'Conecta certezas, suposições e dúvidas geradas a métodos de pesquisa que responderão essas questões.',
    when: 'Logo após uma matriz CSD, para planejar os métodos de pesquisa mais adequados.',
    sections: ['Temas', 'Hipóteses', 'Métodos (Questionário, Entrevista, etc)']
  }
];

let _labActiveTag = 'Todos';

function navigateToLab() {
  navigate('view-lab');
  setTimeout(renderLabFrameworks, 50);
}

function renderLabFrameworks() {
  const list = document.getElementById('lab-framework-list');
  if (!list) return;

  const filtered = _labActiveTag === 'Todos'
    ? LAB_FRAMEWORKS
    : LAB_FRAMEWORKS.filter(f => f.tag === _labActiveTag);

  list.innerHTML = '';

  filtered.forEach(f => {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-2xl p-4 space-y-3 shadow-sm';

    const sectionsHtml = f.sections.map(s =>
      `<span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-dark-muted text-[10px] font-bold rounded-full">${s}</span>`
    ).join('');

    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 flex items-center justify-center ${f.bg} rounded-xl shrink-0">
          <i data-lucide="${f.icon}" class="w-5 h-5 ${f.color}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="font-extrabold text-[13px] text-slate-800 dark:text-white tracking-tight">${f.name}</p>
            <span class="px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wide ${f.tagColor}">${f.tag}</span>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-dark-muted mt-1 leading-relaxed">${f.description}</p>
        </div>
      </div>
      <div class="bg-slate-50 dark:bg-dark-bg/40 rounded-xl px-3 py-2">
        <p class="text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide mb-1">Quando usar</p>
        <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">${f.when}</p>
      </div>
      <div>
        <p class="text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide mb-2">Seções do artefato</p>
        <div class="flex flex-wrap gap-1.5">${sectionsHtml}</div>
      </div>
      <button onclick="injectFramework('${f.id}')"
        class="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-[#005ca9] hover:text-white text-slate-600 dark:text-dark-muted text-[12px] font-bold rounded-xl transition-all flex items-center justify-center gap-2 group">
        <i data-lucide="plus-circle" class="w-4 h-4"></i>
        Inserir no Canvas
      </button>
    `;
    list.appendChild(card);
  });

  _refreshIcons();
}

function filterLab(tag) {
  _labActiveTag = tag;
  renderLabFrameworks();
}

function injectFramework(id) {
  parent.postMessage({ pluginMessage: { type: 'inject-framework', frameworkId: id } }, '*');
  showToast('Inserindo framework no canvas...', 'info');
}
