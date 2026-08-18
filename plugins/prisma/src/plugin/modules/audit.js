// ============================================================
// audit.js — Auditoria de Maturidade: evidências das 4 etapas
// de UX (Descoberta, Definição, Ideação, Validação) + aderência
// ao Design System CAIXA e acessibilidade (PRISMA)
// ============================================================

let _activeEtapa = 'descoberta';

// ── Checklist de completude por etapa ───────────────────────────
// Cada etapa define os tipos de artefato aceitos e, para cada tipo,
// os campos extra de metadado que ajudam a medir completude real
// (não só presença) da evidência anexada.
const PRISMA_ARTEFATO_TIPOS = {
  descoberta: ['Entrevista', 'Pesquisa quantitativa', 'Benchmark', 'Análise de dados/analytics', 'Card sorting', 'Diary study', 'Outro'],
  definicao:  ['Briefing', 'Jornada do usuário', 'Persona', 'Hipótese/problema statement', 'Mapa de stakeholders', 'Outro'],
  ideacao:    ['Wireframe', 'Protótipo de alta fidelidade', 'Protótipo navegável', 'Fluxograma', 'Crazy 8s / sketch', 'Storyboard', 'How Might We', 'Outro'],
  validacao:  ['Teste de usabilidade moderado', 'Teste não-moderado', 'Teste A/B', 'Pesquisa de satisfação (CSAT/NPS)', 'Análise de métricas de uso', 'Teste de acessibilidade assistido', 'Outro'],
  posLancamento: ['Dashboard de métricas de uso', 'Pesquisa de satisfação pós-entrega', 'Análise de chamados/suporte', 'Retrospectiva de squad', 'Plano de iteração/roadmap', 'Outro']
};

// Tipo de artefato → id de framework do catálogo com ferramenta equivalente
// no canvas (quando existe). Usado só para SUGERIR ao usuário que já existe
// uma ferramenta estruturada — nunca troca automaticamente o fluxo de anexar
// artefato manual, que continua servindo pra registrar a EVIDÊNCIA final
// (link/documento), produzida dentro ou fora do Figma.
const PRISMA_ARTEFATO_FRAMEWORK_MAP = {
  'Entrevista': 'interview-script',
  'Card sorting': 'card-sorting',
  'Jornada do usuário': 'journey',
  'Mapa de stakeholders': 'stakeholders',
  'Hipótese/problema statement': 'csd',
  'Crazy 8s / sketch': 'crazy-8s',
  'Storyboard': 'storyboard',
  'How Might We': 'how-might-we',
  'Pesquisa de satisfação (CSAT/NPS)': 'sus-seq',
  'Teste de acessibilidade assistido': 'a11y-audit-checklist',
  'Dashboard de métricas de uso': 'post-launch-tracker'
};

const PRISMA_ARTEFATO_CAMPOS = {
  descoberta: [
    { id: 'qtdParticipantesFontes', label: 'Nº de participantes/fontes', type: 'number' },
    { id: 'principalAchado', label: 'Principal achado', type: 'text' },
    { id: 'dataRealizacao', label: 'Data de realização', type: 'date' }
  ],
  definicao: [
    { id: 'origemDados', label: 'Origem', type: 'select', options: ['Baseado em pesquisa da Descoberta', 'Baseado em dados de negócio', 'Suposição do time'] },
    { id: 'criterioSucesso', label: 'Critério de sucesso definido', type: 'text' }
  ],
  ideacao: [
    { id: 'qtdAlternativas', label: 'Nº de alternativas exploradas', type: 'number' },
    { id: 'coberturaFluxo', label: 'Cobertura', type: 'select', options: ['Fluxo completo', 'Tela isolada', 'Componente específico'] }
  ],
  validacao: [
    { id: 'qtdUsuariosTestados', label: 'Nº de usuários testados', type: 'number' },
    { id: 'metricaColetada', label: 'Métrica coletada', type: 'text' },
    { id: 'dataRealizacao', label: 'Data de realização', type: 'date' }
  ],
  posLancamento: [
    { id: 'metricaProducao', label: 'Métrica em produção observada', type: 'text' },
    { id: 'periodoObservado', label: 'Período observado', type: 'text' },
    { id: 'acaoDecorrente', label: 'Ação/ajuste decorrente', type: 'text' }
  ]
};

// Nota neutra (0–1) atribuída a artefatos anexados antes desta feature
// existir (sem `metadados`) — não penaliza retroativamente quem já
// usou o plugin, mas também não infla a nota como se estivesse completo.
const PRISMA_COMPLETUDE_LEGADO = 0.5;

function _camposDaEtapa(etapa) {
  return PRISMA_ARTEFATO_CAMPOS[etapa] || [];
}

function completudeArtefato(etapa, artefato) {
  if (!artefato.metadados) return PRISMA_COMPLETUDE_LEGADO;
  const campos = _camposDaEtapa(etapa);
  if (campos.length === 0) return 1;
  const preenchidos = campos.filter(c => {
    const v = artefato.metadados[c.id];
    return v !== undefined && v !== null && String(v).trim() !== '';
  }).length;
  return preenchidos / campos.length;
}

// Completude da etapa = melhor artefato + pequeno bônus por volume,
// em vez de média simples — não pune quem também anexa rascunhos
// além de uma evidência robusta.
function completudeEtapa(etapa) {
  const artefatos = prismaData.evidencias[etapa]?.artefatos || [];
  if (artefatos.length === 0) return 0;
  const melhor = Math.max(...artefatos.map(a => completudeArtefato(etapa, a)));
  const bonus = Math.min(0.05 * (artefatos.length - 1), 0.15);
  return Math.min(melhor + bonus, 1);
}

function navigateToAudit() {
  navigate('view-audit');
  setTimeout(() => {
    selectEtapa(_activeEtapa);
    renderAuditStatus();
  }, 50);
}

function selectEtapa(etapa) {
  _activeEtapa = etapa;
  document.querySelectorAll('[data-etapa-tab]').forEach(btn => {
    const active = btn.dataset.etapaTab === etapa;
    btn.className = `px-3 py-1.5 text-[11px] font-bold rounded-full transition-all ${
      active
        ? 'bg-blue-600 text-white'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-dark-muted hover:bg-slate-200'
    }`;
  });
  document.querySelectorAll('[data-etapa-panel]').forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.etapaPanel !== etapa);
  });
  renderArtefatos(etapa);
  _renderTipoOptions(etapa);
  const obsEl = document.getElementById('etapa-obs-' + etapa);
  if (obsEl) obsEl.value = prismaData.evidencias[etapa]?.observacoes || '';
}

// Fechado por padrão — agora que injetar/escanear frameworks já alimenta
// a Auditoria automaticamente, preencher este form manual deixou de ser
// o caminho principal.
function toggleArtefatoForm(etapa) {
  const form = document.getElementById('artefato-form-' + etapa);
  const chevron = document.querySelector(`#btn-toggle-artefato-${etapa} [data-lucide="chevron-down"]`);
  if (!form) return;
  const open = form.classList.toggle('hidden') === false;
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

function _renderTipoOptions(etapa) {
  const sel = document.getElementById('artefato-tipo-' + etapa);
  if (!sel) return;
  const tipos = PRISMA_ARTEFATO_TIPOS[etapa] || [];
  sel.innerHTML = '<option value="">Tipo do artefato...</option>' +
    tipos.map(t => `<option value="${t}">${t}</option>`).join('');
  sel.onchange = () => { _renderCamposExtra(etapa); _renderFrameworkSuggestion(etapa); };
  _renderCamposExtra(etapa);
  _renderFrameworkSuggestion(etapa);
}

// Ao escolher um tipo de artefato que já tem uma ferramenta estruturada no
// canvas (ver PRISMA_ARTEFATO_FRAMEWORK_MAP), avisa o usuário — não impede
// nem substitui o anexo manual, só ajuda quem não sabia que já existe um
// framework pronto pra isso.
function _renderFrameworkSuggestion(etapa) {
  const sel = document.getElementById('artefato-tipo-' + etapa);
  const box = document.getElementById('artefato-fw-suggestion-' + etapa);
  if (!sel || !box) return;
  const tipo = sel.value;
  const fwId = PRISMA_ARTEFATO_FRAMEWORK_MAP[tipo];
  const fw = fwId && (typeof PRISMA_FRAMEWORKS !== 'undefined' ? PRISMA_FRAMEWORKS : []).find(f => f.id === fwId);
  if (!fw) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `
    <i data-lucide="lightbulb" class="w-3.5 h-3.5 shrink-0 text-blue-500"></i>
    <span class="flex-1">Já existe uma ferramenta pra isso: <button onclick="injectFramework('${fw.id}')" class="font-bold text-blue-600 dark:text-blue-400 hover:underline">${fw.name}</button>. Você pode inserir no canvas e depois anexar o link aqui como evidência.</span>`;
  try { lucide.createIcons(); } catch(e) {}
}

function _renderCamposExtra(etapa) {
  const container = document.getElementById('artefato-campos-' + etapa);
  if (!container) return;
  const campos = _camposDaEtapa(etapa);
  container.innerHTML = campos.map(c => {
    if (c.type === 'select') {
      return `<select id="artefato-meta-${etapa}-${c.id}" class="w-full">
        <option value="">${c.label}...</option>
        ${c.options.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>`;
    }
    const inputType = c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text';
    return `<input id="artefato-meta-${etapa}-${c.id}" type="${inputType}" placeholder="${c.label}" class="w-full" />`;
  }).join('');
}

function saveEtapaObservacoes(etapa) {
  const el = document.getElementById('etapa-obs-' + etapa);
  if (!el || !prismaData.evidencias[etapa]) return;
  prismaData.evidencias[etapa].observacoes = el.value.trim();
  saveState();
}

function addArtefato(etapa) {
  const nomeEl = document.getElementById('artefato-nome-' + etapa);
  const urlEl = document.getElementById('artefato-url-' + etapa);
  const tipoEl = document.getElementById('artefato-tipo-' + etapa);
  const nome = nomeEl?.value?.trim();
  const url = urlEl?.value?.trim();
  const tipo = tipoEl?.value || '';
  if (!nome) {
    showToast('Informe um nome para o artefato.', 'error');
    return;
  }

  const metadados = {};
  _camposDaEtapa(etapa).forEach(c => {
    const el = document.getElementById(`artefato-meta-${etapa}-${c.id}`);
    const v = el?.value?.trim();
    if (v) metadados[c.id] = v;
  });

  prismaData.evidencias[etapa].artefatos.push({
    id: _generateId(),
    nome,
    tipo: tipo || (url ? 'link' : 'referencia'),
    url: url || '',
    anexadoEm: new Date().toISOString(),
    metadados
  });
  if (nomeEl) nomeEl.value = '';
  if (urlEl) urlEl.value = '';
  if (tipoEl) tipoEl.value = '';
  _renderCamposExtra(etapa);
  renderArtefatos(etapa);
  saveState();
  updateHomeBadges();
  showToast('Artefato anexado.', 'success');
}

function removeArtefato(etapa, artefatoId) {
  const lista = prismaData.evidencias[etapa]?.artefatos || [];
  const idx = lista.findIndex(a => a.id === artefatoId);
  if (idx >= 0) lista.splice(idx, 1);
  renderArtefatos(etapa);
  saveState();
  updateHomeBadges();
}

function renderArtefatos(etapa) {
  const container = document.getElementById('artefatos-lista-' + etapa);
  if (!container) return;
  const artefatos = prismaData.evidencias[etapa]?.artefatos || [];

  if (artefatos.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400 dark:text-dark-muted">
        <i data-lucide="paperclip" class="w-6 h-6 mx-auto mb-1.5 opacity-40"></i>
        <p class="text-[11px]">Nenhum artefato anexado nesta etapa.</p>
      </div>`;
    try { lucide.createIcons(); } catch(e) {}
    return;
  }

  container.innerHTML = artefatos.map(a => {
    const pct = Math.round(completudeArtefato(etapa, a) * 100);
    const badgeCls = pct >= 100 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
      : pct >= 50 ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-dark-muted';
    return `
    <div class="flex items-center justify-between gap-2 bg-slate-50 dark:bg-dark-bg/40 border border-gray-100 dark:border-dark-line rounded-xl px-3 py-2">
      <div class="flex items-center gap-2 min-w-0">
        <i data-lucide="${a.tipo === 'link' ? 'link' : 'file-text'}" class="w-3.5 h-3.5 shrink-0 text-blue-500"></i>
        <div class="min-w-0">
          <p class="text-[11px] font-bold text-slate-700 dark:text-white truncate">${a.nome}${a.tipo ? ` <span class="font-normal text-slate-400">· ${a.tipo}</span>` : ''}</p>
          ${a.url ? `<p class="text-[10px] text-slate-400 truncate">${a.url}</p>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="px-1.5 py-0.5 text-[9px] font-bold rounded-full ${badgeCls}">${pct}%</span>
        <button onclick="removeArtefato('${etapa}', '${a.id}')" class="text-slate-300 hover:text-red-400 transition-colors">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `;
  }).join('');

  try { lucide.createIcons(); } catch(e) {}
}

// ── Auditoria declarada: Design System / Acessibilidade ─────────
function setAuditStatus(dimensao, status) {
  if (!prismaData.auditoria[dimensao]) return;
  prismaData.auditoria[dimensao].status = status;
  renderAuditStatus();
  _renderAuditToggle(dimensao);
  saveState();
}

// Botões de ESTADO (não navegação): layout em linha, com ícone + borda
// sólida quando selecionado — deliberadamente diferente do pill azul-vs-
// -cinza das abas de etapa, para não serem lidos como mais uma "tab".
function _renderAuditToggle(dimensao) {
  const status = prismaData.auditoria[dimensao]?.status || 'pendente';
  document.querySelectorAll(`[data-audit-toggle="${dimensao}"]`).forEach(btn => {
    const value = btn.dataset.auditValue;
    const active = value === status;
    const activeCls = value === 'conforme'
      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-700 dark:text-emerald-300'
      : value === 'com-desvios'
        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500 text-amber-700 dark:text-amber-300'
        : 'bg-slate-100 dark:bg-slate-800 border-slate-400 text-slate-600 dark:text-dark-muted';
    btn.className = `w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold rounded-lg border transition-all ${
      active
        ? activeCls
        : 'bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-line text-slate-400 dark:text-dark-muted hover:border-gray-200 dark:hover:border-slate-700'
    }`;
  });
}

function saveAuditObservacoes(dimensao) {
  const el = document.getElementById('audit-obs-' + dimensao);
  if (!el || !prismaData.auditoria[dimensao]) return;
  prismaData.auditoria[dimensao].observacoes = el.value.trim();
  saveState();
}

function initAuditView() {
  ['designSystem', 'acessibilidade'].forEach(dim => {
    _renderAuditToggle(dim);
    const obsEl = document.getElementById('audit-obs-' + dim);
    if (obsEl) obsEl.value = prismaData.auditoria[dim]?.observacoes || '';
  });
}

Object.assign(window, {
  navigateToAudit, selectEtapa, saveEtapaObservacoes,
  addArtefato, removeArtefato, renderArtefatos, toggleArtefatoForm,
  setAuditStatus, saveAuditObservacoes, initAuditView,
  completudeArtefato, completudeEtapa
});
