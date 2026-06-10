// --- PERFORMANCE: debounced icon refresh (must be first — called at top-level during init) ---
let _lucideTimer = null;
function _refreshIcons(container) {
  if (!window.lucide) return;
  clearTimeout(_lucideTimer);
  _lucideTimer = setTimeout(function() {
    try {
      if (container) {
        const els = Array.from(container.querySelectorAll('[data-lucide]'));
        if (els.length) { lucide.createIcons({ nodes: els }); return; }
      }
      lucide.createIcons();
    } catch(e) { try { lucide.createIcons(); } catch(_) {} }
  }, 30);
}
window._refreshIcons = _refreshIcons;

// --- GLOBAL STATE & CONSTANTS ---
let currentStep = 1;
const totalSteps = 5;
window.uploadedFiles = {};
let lastMeasurements = [];
let createdSpecs = [];
let currentSpecTab = 'specs-form';
let lastAuditResults = null;
let activeFrameId = null; // frame em foco para operações de modal

let handoffData = {
  _schemaVersion: 2,
  step1: {
    titulo: '',
    versao: 'v1.0',
    objetivo: '',
    status: 'rascunho',
    jornada: '',
    feature: '',
    equipe: []
  },
  step2: {
    briefingEnabled: false,
    briefingQuestions: [],
    regras: [],
    anexos: [],
    // Auditoria global (bundle compartilhado entre frames)
    auditAutoBundle: null,
    selectedLibSlugs: [],
    auditReferences: []
  },
  frames: [],
  createdFlows: [],
  nextFlowNumber: 1,
  currentUser: null,
  _fichaGenerated: false,
  _history: []
};

// Helpers de conformidade DSC
function _computeFrameHasUnlinked(frame) {
  if (!frame || !frame.specs) return false;
  const sections = ['components', 'icons', 'typography', 'vectors'];
  return sections.some(sec =>
    Array.isArray(frame.specs[sec]) &&
    frame.specs[sec].some(item => item.isDS === false)
  );
}

function _updateFrameAuditSubtitle(frameId) {
  const frame = getFrame(frameId);
  const subtitle = document.getElementById(`frame-subtitle-${frameId}`);
  if (!subtitle || !frame) return;

  if (frame.isNewComponent) {
    subtitle.className = 'text-[10px] text-violet-500 font-medium';
    subtitle.textContent = 'Novo Componente';
    return;
  }

  if (!frame.audit || !frame.audit.checkDone) {
    subtitle.className = 'text-[10px] text-slate-400 font-medium';
    subtitle.textContent = 'Pendente';
    return;
  }

  const hasUnlinked = _computeFrameHasUnlinked(frame);
  if (frame.audit.semDesvios && !hasUnlinked) {
    subtitle.className = 'text-[10px] text-green-600 font-medium';
    subtitle.textContent = 'Conforme';
  } else {
    subtitle.className = 'text-[10px] text-red-500 font-medium';
    subtitle.textContent = 'Não Conforme';
  }
  if (typeof _refreshConformanceAlert === 'function') _refreshConformanceAlert(frameId);
}

function setFrameCheckDone(frameId, checked) {
  const frame = getFrame(frameId);
  if (!frame) return;
  if (!frame.audit) frame.audit = {};
  frame.audit.checkDone = checked;
  const el = document.getElementById(`audit-result-${frameId}`);
  if (el) el.classList.toggle('hidden', !checked);
  const rescanRow = document.getElementById(`rescan-row-${frameId}`);
  if (rescanRow) rescanRow.classList.toggle('hidden', !checked);
  _updateFrameAuditSubtitle(frameId);
  saveToStorage();
}

function setFrameSemDesvios(frameId, checked) {
  const frame = getFrame(frameId);
  if (!frame) return;
  if (!frame.audit) frame.audit = {};
  frame.audit.semDesvios = checked;
  // Obs fica visível quando sem desvios=false OU há itens desvinculados do DSC
  const hasUnlinked = _computeFrameHasUnlinked(frame);
  const showObs = !checked || hasUnlinked;
  const el = document.getElementById(`audit-obs-${frameId}`);
  if (el) el.classList.toggle('hidden', !showObs);
  _updateFrameAuditSubtitle(frameId);
  saveToStorage();
}

function setFrameAuditObs(frameId, value) {
  const frame = getFrame(frameId);
  if (!frame) return;
  if (!frame.audit) frame.audit = {};
  frame.audit.observacoes = value;
  saveToStorage();
}

function _refreshAuditView() {}

// Expose functions to window IMMEDIATELY
Object.assign(window, {
  toggleTheme,
  toggleCollapse,
  startHandoff,
  navigate,
  exportHandoffData,
  importHandoffData,
  toggleAllMeasuresVisibility,
  exportMeasurements,
  switchSpecTab,
  toggleAccordion,
  toggleAllSpecsVisibility,
  exportSpecsToMd,
  toggleBriefingSection,
  scrollToStep,
  scanFrame,
  openMeasureModal,
  openSpecFormModal,
  openFlowFormModal,
  addBriefingQuestion,
  addRegra,
  removeRegra,
  addExcecaoForFrame,
  removeExcecaoForFrame,
  scrollToTop,
  handleScroll,
  removeBriefingQuestion,
  updateBriefingQuestion,
  updateData,
  showToast,
  focusNode,
  saveToStorage,
  bumpVersion,
  saveSpecsToStorage,
  validateUrl,
  validateEmail,
  exportHandoff,
  createHandoffOnCanvas,
  openModal,
  closeModal,
  openHelp,
  closeHelpAndReturn,
  toggleCategoryManager,
  requestSpecProperties,
  confirmSpecProperties,
  closeMeasureModal,
  selectMeasurement,
  executeMeasurement,
  selectFlowType,
  confirmFlowConnection,
  toggleUiScale,
  clearPluginCache,
  // Generic custom select
  _csToggle,
  _csClose,
  _csSelect,
  _csSyncLabel,
  _csMarkActive,
  _csSyncPanel,
  // Status dropdown
  toggleStatusDropdown,
  selectStatus,
  _syncStatusUI,
  _closeStatusPanel,
  // Frame hub functions
  addFrame,
  removeFrame,
  getFrame,
  toggleNewComponent,
  toggleFrameAccordion,
  validateStep1,
  addTeamMember,
  removeTeamMember,
  updateTeamMember,
  renderValidationChecklist,
  importTitleFromSelection,
  requestFrameRegistration,
  openExceptionModal,
  selectExceptionType,
  confirmException,
  toggleExcModalObs,
  linkExcModalVinc,
  toggleCategory,
  exportChecklistMd,
  exportChecklistJson,
  openDadosProjetoModal,
  ensureExpanded,
  setMeasureActiveFrame,
  exportHandoffMD,
  updateHandoffSummary,
  updateNewComponentObs,
  openExceptionForSpecs,
  renderExcecoesView,
  syncAndRenderSpecs,
  renderAllMeasurements,
  _computeFrameHasUnlinked,
  _updateFrameAuditSubtitle,
  setFrameCheckDone,
  setFrameSemDesvios,
  setFrameAuditObs,
  _restoreStep1Fields
});

function clearPluginCache() {
  const confirmed = window.confirm(
    'Limpar todo o cache do plugin?\n\nIsso removerá: formulário, frames, auditoria, medidas, fluxos e histórico.\n\nEssa ação não pode ser desfeita.'
  );
  if (!confirmed) return;
  parent.postMessage({ pluginMessage: { type: 'clear-cache' } }, '*');
}

function saveSpecsToStorage() {
  handoffData.specs = createdSpecs;
  saveToStorage();
}

let nextMeasurementNumber = 1;

document.addEventListener('DOMContentLoaded', () => {
  _refreshIcons();
});

// ── Plugin Collapse / Expand ──────────────────────────────────────────
let isCollapsed = false;
const FULL_W = 480, FULL_H = 750;
const MINI_H = 44;

function toggleCollapse() {
  isCollapsed = !isCollapsed;
  const mainContent = document.querySelector('body > div.flex-1');
  const collapseBtn = document.getElementById('btn-collapse');
  if (isCollapsed) {
    if (mainContent) mainContent.classList.add('hidden');
    if (collapseBtn) collapseBtn.innerHTML = '<i data-lucide="maximize-2" class="w-4 h-4" aria-hidden="true"></i>';
  } else {
    if (mainContent) mainContent.classList.remove('hidden');
    if (collapseBtn) collapseBtn.innerHTML = '<i data-lucide="minimize-2" class="w-4 h-4" aria-hidden="true"></i>';
  }
  parent.postMessage({ pluginMessage: { type: 'resize-ui', width: FULL_W, height: isCollapsed ? MINI_H : FULL_H } }, '*');
  _refreshIcons();
}

function ensureExpanded() {
  if (isCollapsed) toggleCollapse();
}

window.pullBriefingFromCanvas = function(e) {
  if (e) e.stopPropagation();
  parent.postMessage({ pluginMessage: { type: 'pull-briefing-from-canvas' } }, '*');
  showToast('Buscando framework no canvas...');
};

// ── Briefing Suggestions ──────────────────────────────────────────────
function initBriefingSuggestions() {
  const container = document.getElementById('briefing-categories-container-v2');
  if (!container) return;
  container.innerHTML = '';
  const categories = [
    {
      id: 'contexto', name: 'Contexto do Projeto', icon: 'briefcase', color: 'text-blue-500',
      questions: [
        { label: 'Problema Central', text: 'Qual é o problema central que este projeto resolve?' },
        { label: 'Contexto de Negócio', text: 'Qual é o contexto de negócio ou estratégico que originou essa demanda?' },
        { label: 'Critério de Sucesso', text: 'Quais resultados-chave definem o sucesso deste projeto? Como vamos medir?' },
        { label: 'Histórico', text: 'Houve tentativas anteriores de resolver esse problema? O que aprendemos com elas?' },
        { label: 'Público-Alvo', text: 'Quem é o usuário final desta interface e qual seu perfil?' },
        { label: 'Canais', text: 'Em quais plataformas ou canais a solução vai operar?' },
        { label: 'Diferencial', text: 'Qual o principal valor único que esta solução propõe ao usuário?' }
      ]
    },
    {
      id: 'escopo', name: 'Escopo e Riscos', icon: 'git-merge', color: 'text-orange-500',
      questions: [
        { label: 'No Escopo', text: 'O que está definitivamente incluído nesta entrega?' },
        { label: 'Pode Entrar', text: 'O que pode entrar no escopo, mas ainda precisa de validação?' },
        { label: 'Fora do Escopo', text: 'O que está explicitamente fora do escopo desta versão?' },
        { label: 'MVP', text: 'O que é estritamente essencial para a primeira entrega?' },
        { label: 'Riscos Técnicos', text: 'Quais os maiores riscos técnicos que podem impedir o sucesso do projeto?' },
        { label: 'Riscos de Negócio', text: 'Há riscos regulatórios, legais (ex: LGPD) ou de compliance envolvidos?' },
        { label: 'Dependências', text: 'Quais sistemas ou times externos este projeto depende?' },
        { label: 'Impacto Cruzado', text: 'Esta solução afeta outras jornadas, componentes ou produtos?' }
      ]
    },
    {
      id: 'stakeholders', name: 'Usuários e Stakeholders', icon: 'users', color: 'text-teal-500',
      questions: [
        { label: 'Usuários Primários', text: 'Quem são os usuários primários deste produto ou fluxo?' },
        { label: 'Usuários Secundários', text: 'Quem são os usuários secundários ou indiretos?' },
        { label: 'Dores do Usuário', text: 'Quais são as principais dores ou frustrações relatadas por esses usuários?' },
        { label: 'Decisores', text: 'Quem são os decisores e precisam aprovar as entregas?' },
        { label: 'Consultados', text: 'Quem precisa ser consultado mas não decide?' },
        { label: 'Informados', text: 'Quem precisa ser apenas informado sobre o progresso?' },
        { label: 'Conflitos', text: 'Há conflitos de interesse entre stakeholders que merecem atenção?' }
      ]
    },
    {
      id: 'design', name: 'UX e Design', icon: 'compass', color: 'text-purple-500',
      questions: [
        { label: 'Jornada', text: 'Em qual etapa da jornada do usuário esta interface está inserida?' },
        { label: 'Benchmarking', text: 'Quais as principais referências de mercado ou concorrentes para esta solução?' },
        { label: 'Tom de Voz', text: 'Qual o tom de voz e personalidade que o design deve projetar nesta interação?' },
        { label: 'Sentimento', text: 'Qual a principal percepção que o design deve transmitir (ex: segurança, agilidade)?' },
        { label: 'Anti-objetivos', text: 'O que você absolutamente NÃO quer ver no resultado final dessa interface?' },
        { label: 'Acessibilidade', text: 'Há requisitos específicos de acessibilidade ou inclusão para este público?' },
        { label: 'Organização do Trabalho', text: 'Como o trabalho será organizado: sprints, milestones, cerimônias?' },
        { label: 'Prazo', text: 'Qual é o prazo da entrega? Há marcos ou datas intermediárias obrigatórias?' }
      ]
    },
    {
      id: 'pesquisa', name: 'Pesquisa e Evidências', icon: 'flask-conical', color: 'text-green-500',
      questions: [
        { label: 'Pesquisas Anteriores', text: 'Há pesquisas ou dados de uso anteriores que embasam este projeto?' },
        { label: 'Hipóteses', text: 'Quais hipóteses precisam ser validadas antes de avançar com o design?' },
        { label: 'Certezas (CSD)', text: 'O que a equipe tem certeza sobre o problema ou a solução?' },
        { label: 'Suposições (CSD)', text: 'Quais suposições estão sendo feitas e ainda não foram validadas?' },
        { label: 'Dúvidas (CSD)', text: 'Quais dúvidas precisam ser respondidas antes de prosseguir?' },
        { label: 'Insights de Pesquisa', text: 'Quais insights de pesquisa já foram transformados em decisões de design?' },
        { label: 'Causa Raiz', text: 'Qual é a causa raiz do problema (5 Porquês)? Já foi investigada?' }
      ]
    }
  ];
  categories.forEach(cat => {
    const catDiv = document.createElement('div');
    catDiv.className = 'border border-gray-100 dark:border-dark-line rounded-xl overflow-hidden bg-white dark:bg-dark-surface/30';
    catDiv.innerHTML = `
      <button onclick="toggleCategory('${cat.id}')" class="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-dark-surface/50 hover:bg-slate-100 transition-all">
        <span class="flex items-center gap-2 text-[12px] font-bold text-slate-700 dark:text-white">
          <i data-lucide="${cat.icon}" class="w-4 h-4 ${cat.color}"></i>
          ${cat.name}
        </span>
        <i data-lucide="chevron-down" id="arrow-${cat.id}" class="w-4 h-4 text-gray-400 transition-transform"></i>
      </button>
      <div id="cat-${cat.id}" class="hidden p-3 bg-white dark:bg-dark-bg/10 border-t border-gray-100 dark:border-dark-line">
        <div class="flex flex-wrap gap-2" id="chips-${cat.id}"></div>
      </div>
    `;
    container.appendChild(catDiv);
    const chipsContainer = document.getElementById(`chips-${cat.id}`);
    cat.questions.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-dark-muted rounded-full text-[11px] font-bold hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-[#0070af] dark:hover:text-blue-400 transition-all border border-transparent hover:border-blue-100 dark:hover:border-blue-900';
      btn.innerHTML = `+ ${q.label}`;
      btn.onclick = () => addBriefingQuestion(q.text, cat.name);
      chipsContainer.appendChild(btn);
    });
  });
  _refreshIcons();
}

function toggleCategory(id) {
  const el = document.getElementById(`cat-${id}`);
  const arrow = document.getElementById(`arrow-${id}`);
  if (el && arrow) {
    const isHidden = el.classList.contains('hidden');
    el.classList.toggle('hidden');
    arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  }
}

function addBriefingQuestion(questionText = "", category = "Customizada") {
  if (typeof questionText !== 'string') questionText = "";
  const container = document.getElementById('briefing-questions-container-v2');
  if (!container) return;
  const id = Date.now();
  const index = container.children.length + 1;
  const card = document.createElement('div');
  card.id = `briefing-card-${id}`;
  card.className = "bg-white dark:bg-dark-bg p-5 rounded-xl border border-gray-100 dark:border-dark-line shadow-sm relative animate-in slide-in-from-top-4 duration-300";
  card.innerHTML = `
    <button onclick="removeBriefingQuestion('${id}')" title="Excluir Pergunta" class="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50">
      <i data-lucide="trash-2" class="w-4 h-4"></i>
    </button>
    <div class="flex items-center gap-3 mb-4">
      <span class="text-[#0070af] font-bold text-[14px]">#${index} Pergunta</span>
      <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-dark-muted rounded border border-gray-100 dark:border-dark-line uppercase tracking-wider">${category}</span>
    </div>
    <div class="space-y-4">
      <div>
        <label class="block text-[11px] font-bold text-[#0070af] uppercase mb-1.5">Pergunta</label>
        <textarea placeholder="Digite sua pergunta estratégica..."
          class="w-full px-3 py-2 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold text-slate-700 dark:text-white min-h-[44px] resize-none overflow-hidden"
          oninput="this.style.height='';this.style.height=this.scrollHeight+'px'"
          onchange="updateBriefingQuestion('${id}','question',this.value)">${questionText}</textarea>
      </div>
      <div>
        <label class="block text-[11px] font-bold text-[#0070af] uppercase mb-1.5">Resposta</label>
        <textarea placeholder="Insira aqui a resposta ou direcionamento..."
          class="w-full px-3 py-2 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg text-sm min-h-[100px] focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
          onchange="updateBriefingQuestion('${id}','answer',this.value)"></textarea>
      </div>
    </div>
  `;
  container.appendChild(card);
  if (!handoffData.step2.briefingQuestions) handoffData.step2.briefingQuestions = [];
  handoffData.step2.briefingQuestions.push({ id, question: questionText, answer: "", category });
  saveToStorage();
  _refreshIcons();
  const ta = card.querySelector('textarea');
  if (ta) { ta.style.height = ''; ta.style.height = ta.scrollHeight + 'px'; }

  // Auto-open briefing accordion if collapsed
  const briefingContent = document.getElementById('briefing-card');
  if (briefingContent && briefingContent.classList.contains('hidden')) {
    const accordionBtn = briefingContent.previousElementSibling;
    if (accordionBtn) accordionBtn.click();
  }

  // Focus the question textarea after accordion opens
  setTimeout(() => {
    if (ta) {
      ta.focus();
      ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 120);
  autoScrollToNewItem('handoff-scroll-container', card);
}

function removeBriefingQuestion(id) {
  const card = document.getElementById(`briefing-card-${id}`);
  if (card) card.remove();
  handoffData.step2.briefingQuestions = (handoffData.step2.briefingQuestions || []).filter(q => q.id != id);
  const container = document.getElementById('briefing-questions-container-v2');
  if (container) {
    Array.from(container.children).forEach((child, i) => {
      const badge = child.querySelector('.text-\\[\\#0070af\\]');
      if (badge) badge.textContent = `#${i + 1} Pergunta`;
    });
  }
  saveToStorage();
}

function updateBriefingQuestion(id, key, value) {
  const q = (handoffData.step2.briefingQuestions || []).find(q => q.id == id);
  if (q) q[key] = value;
  saveToStorage();
}

function toggleBriefingSection(checked) {
  handoffData.step2.briefingEnabled = checked;
  const card = document.getElementById('briefing-card');
  if (card) card.classList.toggle('hidden', !checked);
  const container = document.getElementById('briefing-categories-container-v2');
  if (container && container.innerHTML === '') initBriefingSuggestions();
  saveToStorage();
}

// ── Regras de Negócio (Step 2 global) ─────────────────────────────────
function addRegra() {
  const list = document.getElementById('list-regras-s2');
  if (!list) return;
  const id = `regra-${Date.now()}`;
  if (!handoffData.step2.regras) handoffData.step2.regras = [];
  handoffData.step2.regras.push({ id, titulo: '', notas: '', link: '' });

  const item = document.createElement('div');
  item.id = `item-${id}`;
  item.className = "p-3 bg-gray-50/50 dark:bg-dark-bg/30 border border-gray-100 dark:border-dark-line rounded-lg animate-in slide-in-from-top-2 duration-200";
  item.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <i data-lucide="file-text" class="w-3.5 h-3.5 text-indigo-500"></i>
        <span class="text-[12px] font-bold text-slate-700 dark:text-white">Regra / HU</span>
      </div>
      <button onclick="removeRegra('${id}')" title="Remover" class="text-gray-300 hover:text-red-500 transition-colors">
        <i data-lucide="trash-2" class="w-3 h-3"></i>
      </button>
    </div>
    <div class="space-y-2">
      <input type="text" placeholder="Título da Regra/HU" class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none font-bold"
        onchange="updateRegraField('${id}','titulo',this.value)">
      <div class="relative">
        <i data-lucide="link" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400"></i>
        <input type="text" placeholder="Link da HU/Regra (Jira, Confluence...)" class="w-full pl-7 pr-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none"
          onchange="updateRegraField('${id}','link',this.value)" onblur="validateUrl(this)">
      </div>
      <textarea placeholder="Descrição ou critérios de aceitação..." rows="2" class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none resize-none"
        onchange="updateRegraField('${id}','notas',this.value)"></textarea>
    </div>
  `;
  list.appendChild(item);
  _refreshIcons();
  updateRegrasCount();
  autoScrollToNewItem('handoff-scroll-container', item);
}

function removeRegra(id) {
  const el = document.getElementById(`item-${id}`);
  if (el) el.remove();
  handoffData.step2.regras = (handoffData.step2.regras || []).filter(r => r.id !== id);
  updateRegrasCount();
  saveToStorage();
}

function updateRegraField(id, field, value) {
  const r = (handoffData.step2.regras || []).find(r => r.id === id);
  if (r) r[field] = value;
  saveToStorage();
}

function updateRegrasCount() {
  const list = document.getElementById('list-regras-s2');
  const countEl = document.getElementById('count-regras-s2');
  if (list && countEl) countEl.textContent = `${list.children.length} ${list.children.length === 1 ? 'item' : 'itens'}`;
}

// ── Exceções por Frame ─────────────────────────────────────────────────
function addExcecaoForFrame(frameId, tipo, icon, color, vinc = '', anchor = '', obs = '', titulo = '') {
  const frame = getFrame(frameId);
  if (!frame) return;
  // Show section and open sub-accordion
  if (typeof showFrameSection === 'function') showFrameSection(frameId, 'excecoes');
  const list = document.getElementById(`excecoes-list-${frameId}`);
  if (!list) return;
  const id = `exc-${Date.now()}`;
  if (!frame.excecoes) frame.excecoes = [];
  frame.excecoes.push({ id, tipo, titulo: titulo || vinc, frameName: vinc, notas: obs, link: anchor });

  const item = document.createElement('div');
  item.id = `item-${id}`;
  item.className = "p-3 bg-gray-50/50 dark:bg-dark-bg/30 border border-gray-100 dark:border-dark-line rounded-lg animate-in slide-in-from-top-2 duration-200";
  const tituloDisplay = titulo || tipo;
  item.innerHTML = `
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="flex items-center gap-2 min-w-0">
        <i data-lucide="${icon}" class="w-3.5 h-3.5 ${color} shrink-0"></i>
        <div class="min-w-0">
          <span class="text-[11px] font-bold text-slate-700 dark:text-white block truncate">${tituloDisplay}</span>
          ${vinc ? `<span class="text-[10px] text-slate-500 truncate block">→ ${vinc}</span>` : ''}
        </div>
      </div>
      <button onclick="removeExcecaoForFrame('${frameId}','${id}')" title="Remover" class="text-gray-300 hover:text-red-500 transition-colors shrink-0">
        <i data-lucide="trash-2" class="w-3 h-3"></i>
      </button>
    </div>
    ${anchor ? `<a href="${anchor}" target="_blank" class="flex items-center gap-1 text-[10px] text-[#0070af] hover:underline truncate mb-1"><i data-lucide="link" class="w-2.5 h-2.5 shrink-0"></i>${anchor}</a>` : ''}
    ${obs ? `<p class="text-[10px] text-slate-500 dark:text-dark-muted mt-1 leading-relaxed">${obs}</p>` : ''}
  `;
  list.appendChild(item);
  _refreshIcons();
  updateExcecoesCount(frameId);
  autoScrollToNewItem('handoff-scroll-container', item);
  saveToStorage();
}

function removeExcecaoForFrame(frameId, itemId) {
  const el = document.getElementById(`item-${itemId}`);
  if (el) el.remove();
  const frame = getFrame(frameId);
  if (frame) frame.excecoes = (frame.excecoes || []).filter(e => e.id !== itemId);
  updateExcecoesCount(frameId);
  saveToStorage();
}

function updateExcecaoField(frameId, itemId, field, value) {
  const frame = getFrame(frameId);
  if (!frame) return;
  const exc = (frame.excecoes || []).find(e => e.id === itemId);
  if (exc) exc[field] = value;
  saveToStorage();
}

function updateExcecoesCount(frameId) {
  const list = document.getElementById(`excecoes-list-${frameId}`);
  const countEl = document.getElementById(`count-excecoes-${frameId}`);
  if (list && countEl) {
    const count = list.children.length;
    countEl.textContent = count > 0 ? `${count} ${count === 1 ? 'cenário' : 'cenários'}` : '';
    countEl.classList.toggle('hidden', count === 0);
  }
}

function toggleContextField(field, checked) {
  const fieldDiv = document.getElementById(field + '-field');
  const input = document.getElementById('s1-' + field);
  if (checked) {
    if (fieldDiv) fieldDiv.classList.remove('hidden');
    // Pré-preenche com o nome do frame selecionado no Figma, se houver
    window._pendingContextField = field;
    parent.postMessage({ pluginMessage: { type: 'get-context-name' } }, '*');
    if (input) setTimeout(function() { input.focus(); }, 100);
  } else {
    if (fieldDiv) fieldDiv.classList.add('hidden');
    if (input) input.value = '';
    updateData('step1', field, '');
  }
}
window.toggleContextField = toggleContextField;

function linkCurrentSelectionForExc(id) {
  parent.postMessage({ pluginMessage: { type: 'get-selection-link', targetId: id } }, '*');
}

// ── Canvas highlight / focus helpers ──────────────────────────────────
function sendHighlight(figmaId) {
  if (figmaId) {
    parent.postMessage({ pluginMessage: { type: 'highlight-node', id: figmaId, shouldScroll: false } }, '*');
  }
}
function clearHighlight() {
  // deselect via highlight-node with no valid id — code.js handles null gracefully
  parent.postMessage({ pluginMessage: { type: 'highlight-node', id: '__clear__', shouldScroll: false } }, '*');
}

// ── Sub-accordion toggle ───────────────────────────────────────────────
function toggleSubAccordion(key) {
  const body = document.getElementById(`sub-body-${key}`);
  const chev = document.getElementById(`sub-chev-${key}`);
  if (!body) return;
  const isHidden = body.classList.toggle('hidden');
  if (chev) chev.style.transform = isHidden ? '' : 'rotate(90deg)';
}

// ── Exception modal ────────────────────────────────────────────────────
let _currentExceptionFrameId = null;
let _currentExceptionType = null;
window._currentExceptionSpecIdx = null; // set by openSpecException when coming from a spec item

function openExceptionModal(frameId) {
  _currentExceptionFrameId = frameId;
  _currentExceptionType = null;
  window._currentExceptionSpecIdx = null; // caller may override after this returns
  ['Erro','Sucesso','Confirmação','Alerta'].forEach(t => {
    const btn = document.getElementById(`exc-type-${t}`);
    if (btn) btn.classList.remove('border-red-400','border-green-400','border-blue-400','border-amber-400','bg-red-50','bg-green-50','bg-blue-50','bg-amber-50');
  });
  const vincInput   = document.getElementById('exc-modal-vinc');
  const anchorInput = document.getElementById('exc-modal-anchor');
  const obsCheck    = document.getElementById('exc-modal-has-obs');
  const obsArea     = document.getElementById('exc-modal-obs');
  if (vincInput)   vincInput.value   = '';
  if (anchorInput) anchorInput.value = '';
  if (obsCheck)    obsCheck.checked  = false;
  if (obsArea)     obsArea.classList.add('hidden');
  const confirm = document.getElementById('exc-modal-confirm');
  if (confirm) confirm.disabled = true;
  openModal('exception-modal');
}

const _excTypeColors = {
  'Erro': 'border-red-400 bg-red-50 dark:bg-red-900/20',
  'Sucesso': 'border-green-400 bg-green-50 dark:bg-green-900/20',
  'Confirmação': 'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
  'Alerta': 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
};

function selectExceptionType(tipo, icon, color) {
  _currentExceptionType = { tipo, icon, color };
  ['Erro','Sucesso','Confirmação','Alerta'].forEach(t => {
    const btn = document.getElementById(`exc-type-${t}`);
    if (!btn) return;
    const cls = (_excTypeColors[t] || '').split(' ');
    if (t === tipo) {
      btn.classList.remove('border-gray-100', 'dark:border-dark-line');
      cls.forEach(c => btn.classList.add(c));
    } else {
      cls.forEach(c => btn.classList.remove(c));
      btn.classList.add('border-gray-100');
    }
  });
  const confirm = document.getElementById('exc-modal-confirm');
  if (confirm) confirm.disabled = false;
}

function confirmException() {
  if (!_currentExceptionType) return;
  const vinc   = (document.getElementById('exc-modal-vinc')?.value   || '').trim();
  const anchor = (document.getElementById('exc-modal-anchor')?.value || '').trim();
  const obsCheck = document.getElementById('exc-modal-has-obs');
  const obsArea  = document.getElementById('exc-modal-obs');
  const obs = (obsCheck && obsCheck.checked && obsArea) ? obsArea.value.trim() : '';

  // ── Caso: exceção de spec global (view-specifications sem frame) ───
  const globalIdx = window._globalSpecExceptionIdx;
  if (globalIdx !== null && globalIdx !== undefined && _currentExceptionFrameId === '__global__') {
    if (typeof createdSpecs !== 'undefined' && createdSpecs[globalIdx]) {
      if (!createdSpecs[globalIdx].excecoes) createdSpecs[globalIdx].excecoes = [];
      createdSpecs[globalIdx].excecoes.push({
        tipo: _currentExceptionType.tipo,
        titulo: vinc,
        anchor,
        obs
      });
      if (typeof saveSpecsToStorage === 'function') saveSpecsToStorage();
      window._expandSpecIdAfterRender = createdSpecs[globalIdx].id;
      if (typeof renderSpecsList === 'function') renderSpecsList();
    }
    window._globalSpecExceptionIdx = null;
    _currentExceptionFrameId = null;
    closeModal('exception-modal');
    return;
  }

  if (!_currentExceptionFrameId) return;
  const specIdx = window._currentExceptionSpecIdx;
  if (specIdx !== null && specIdx !== undefined) {
    // Store exception inside the spec item
    const frame = getFrame(_currentExceptionFrameId);
    if (frame && frame.createdSpecs && frame.createdSpecs[specIdx]) {
      if (!frame.createdSpecs[specIdx].excecoes) frame.createdSpecs[specIdx].excecoes = [];
      frame.createdSpecs[specIdx].excecoes.push({
        tipo: _currentExceptionType.tipo,
        icon: _currentExceptionType.icon,
        titulo: vinc,
        anchor,
        obs
      });
      saveToStorage();
      window._expandSpecIdAfterRender = frame.createdSpecs[specIdx].id;
      if (typeof renderSpecsListForFrame === 'function') renderSpecsListForFrame(_currentExceptionFrameId);

      // Inject obs into spec frame if checkbox checked
      const injectCheck = document.getElementById('exc-modal-inject-spec');
      if (injectCheck && injectCheck.checked && obs && frame.createdSpecs[specIdx].id) {
        parent.postMessage({
          pluginMessage: {
            type: 'inject-obs-to-spec',
            specNodeId: frame.createdSpecs[specIdx].id,
            tipo: _currentExceptionType.tipo,
            titulo: vinc,
            obs
          }
        }, '*');
      }
    }
    window._currentExceptionSpecIdx = null;
  } else {
    addExcecaoForFrame(_currentExceptionFrameId, _currentExceptionType.tipo,
      _currentExceptionType.icon, _currentExceptionType.color, vinc, anchor, obs, vinc);

  }
  closeModal('exception-modal');
  if (typeof renderExcecoesView === 'function') renderExcecoesView();
}

function toggleExcModalObs(checked) {
  const area = document.getElementById('exc-modal-obs');
  if (area) area.classList.toggle('hidden', !checked);
  const injectWrap = document.getElementById('exc-modal-inject-wrap');
  if (injectWrap) {
    // Only show inject option when in a spec exception context
    const hasSpecCtx = window._currentExceptionSpecIdx !== null && window._currentExceptionSpecIdx !== undefined;
    injectWrap.classList.toggle('hidden', !checked || !hasSpecCtx);
  }
}

function linkExcModalVinc() {
  parent.postMessage({ pluginMessage: { type: 'get-selection-link', targetId: 'exc-modal-vinc' } }, '*');
}

// ── Frame Hub Management ───────────────────────────────────────────────
function addFrame(figmaId, nome) {
  const id = String(Date.now());
  const frame = {
    id,
    figmaId,
    nome,
    isNewComponent: false,
    specs: null,
    audit: { status: null, justificativa: '' },
    measurements: [],
    nextMeasurementNumber: 1,
    createdSpecs: [],
    excecoes: []
  };
  handoffData.frames.push(frame);
  renderFrameCard(frame);
  updateEmptyFramesState();
  saveToStorage();
  _toastSaved();
  const card = document.getElementById(`frame-card-${id}`);
  if (card) autoScrollToNewItem('handoff-scroll-container', card);
  return frame;
}

function removeFrame(frameId) {
  handoffData.frames = handoffData.frames.filter(f => f.id !== frameId);
  const el = document.getElementById(`frame-card-${frameId}`);
  if (el) el.remove();
  updateEmptyFramesState();
  saveToStorage();
}

function getFrame(frameId) {
  return handoffData.frames.find(f => f.id === frameId) || null;
}

function toggleNewComponent(frameId, checked) {
  const frame = getFrame(frameId);
  if (frame) { frame.isNewComponent = checked; saveToStorage(); }
  const badge = document.getElementById(`badge-new-component-${frameId}`);
  if (badge) badge.classList.toggle('hidden', !checked);
  const obsDiv = document.getElementById(`new-component-obs-${frameId}`);
  if (obsDiv) obsDiv.classList.toggle('hidden', !checked);
  // Atualiza subtítulo do cabeçalho
  const subtitle = document.getElementById(`frame-subtitle-${frameId}`);
  if (subtitle) {
    if (checked) {
      subtitle.className = 'text-[10px] text-violet-500 font-medium';
      subtitle.textContent = 'Novo Componente';
    } else if (typeof _updateFrameAuditSubtitle === 'function') {
      _updateFrameAuditSubtitle(frameId, frame && frame.audit ? frame.audit.status : null);
    }
  }
}

function updateNewComponentObs(frameId, value) {
  const frame = getFrame(frameId);
  if (frame) { frame.newComponentObservations = value; saveToStorage(); }
}

function toggleFrameAccordion(frameId) {
  const body = document.getElementById(`frame-body-${frameId}`);
  const arrow = document.getElementById(`frame-arrow-${frameId}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (arrow) arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
}

function updateEmptyFramesState() {
  const empty = document.getElementById('frames-empty-state');
  if (!empty) return;
  empty.classList.toggle('hidden', handoffData.frames.length > 0);
}

function importTitleFromSelection() {
  parent.postMessage({ pluginMessage: { type: 'get-project-name' } }, '*');
}

function requestFrameRegistration() {
  if (typeof openScanCategoriesModal === 'function') {
    openScanCategoriesModal(null);
  } else {
    parent.postMessage({ pluginMessage: { type: 'get-selection-info' } }, '*');
  }
}

// ── Generic Custom Select System ────────────────────────────────────────
// Padrão HTML: <div id="cs-X"><select class="hidden">...</select>
//              <button data-cs-trigger><span data-cs-label/><i data-cs-chev/></button>
//              <div data-cs-panel><button data-cs-opt="val"/></div></div>

function _csClose(wid) {
  const w = document.getElementById(wid);
  if (!w) return;
  const panel = w.querySelector('[data-cs-panel]');
  const chev  = w.querySelector('[data-cs-chev]');
  if (panel) panel.classList.add('hidden');
  if (chev)  chev.style.transform = '';
}

function _csToggle(wid, e) {
  if (e) e.stopPropagation();
  const w = document.getElementById(wid);
  if (!w) return;
  const panel = w.querySelector('[data-cs-panel]');
  if (!panel) return;
  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) {
    _csClose(wid);
  } else {
    // Fecha outros dropdowns abertos
    document.querySelectorAll('[data-cs-panel]:not(.hidden)').forEach(p => {
      const ow = p.closest('[id]');
      if (ow && ow.id !== wid) _csClose(ow.id);
    });
    panel.classList.remove('hidden');
    const chev = w.querySelector('[data-cs-chev]');
    if (chev) chev.style.transform = 'rotate(180deg)';
    const close = (ev) => {
      if (!w.contains(ev.target)) {
        _csClose(wid);
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }
}

function _csSelect(wid, value) {
  const w = document.getElementById(wid);
  if (!w) return;
  const hiddenSel = w.querySelector('select');
  if (hiddenSel) {
    hiddenSel.value = value;
    hiddenSel.dispatchEvent(new Event('change'));
  }
  _csSyncLabel(wid);
  _csMarkActive(wid, value);
  _csClose(wid);
}

function _csSyncLabel(wid) {
  const w = document.getElementById(wid);
  if (!w) return;
  const hiddenSel = w.querySelector('select');
  const labelEl   = w.querySelector('[data-cs-label]');
  if (!hiddenSel || !labelEl) return;
  const sel = hiddenSel.options[hiddenSel.selectedIndex];
  if (!sel) return;
  if (wid === 'cs-ann-cat' && sel.value) {
    const color = typeof getCategoryColor === 'function' ? getCategoryColor(sel.value) : '#005ca9';
    labelEl.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${color};margin-right:6px;vertical-align:middle;flex-shrink:0"></span>${sel.text}`;
  } else {
    labelEl.textContent = sel.text;
  }
  // Sincroniza a cor do swatch no formulário
  if (wid === 'cs-ann-cat' && typeof syncSpecColorFromCategory === 'function') {
    syncSpecColorFromCategory();
  }
}

function _csMarkActive(wid, value) {
  const w = document.getElementById(wid);
  if (!w) return;
  w.querySelectorAll('[data-cs-opt]').forEach(btn => {
    const active = btn.dataset.csOpt === String(value);
    btn.classList.toggle('bg-blue-50',         active);
    btn.classList.toggle('dark:bg-blue-900/20', active);
    btn.classList.toggle('text-[#0070af]',      active);
    btn.classList.toggle('font-bold',           active);
    // Remove active from inactive
    if (!active) {
      btn.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'text-[#0070af]', 'font-bold');
    }
  });
}

function _csSyncPanel(wid) {
  // Reconstrói o panel a partir das options atuais do hidden select (para dropdowns dinâmicos)
  const w = document.getElementById(wid);
  if (!w) return;
  const hiddenSel = w.querySelector('select');
  const panel     = w.querySelector('[data-cs-panel]');
  if (!hiddenSel || !panel) return;
  const currentVal = hiddenSel.value;
  panel.innerHTML = '';
  const isCatPanel = wid === 'cs-ann-cat';
  Array.from(hiddenSel.options).forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-cs-opt', opt.value);
    btn.setAttribute('onclick', `_csSelect('${wid}', ${JSON.stringify(opt.value)})`);
    const isActive = opt.value === currentVal;
    btn.className = `w-full text-left flex items-center gap-2 px-3 py-2 text-[12px] text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors${isActive ? ' bg-blue-50 dark:bg-blue-900/20 font-bold' : ''}`;
    if (isCatPanel && opt.value) {
      const dot = document.createElement('span');
      const color = typeof getCategoryColor === 'function' ? getCategoryColor(opt.value) : '#005ca9';
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background-color:${color};flex-shrink:0`;
      btn.appendChild(dot);
    }
    btn.appendChild(document.createTextNode(opt.text));
    panel.appendChild(btn);
  });
  _csSyncLabel(wid);
}

// ── Dropdown customizado de Status (Step 1) ────────────────────────────
const _STATUS_CONFIG = {
  'rascunho':        { label: 'Rascunho',        dot: 'bg-gray-400' },
  'em-revisao':      { label: 'Em Revisão',       dot: 'bg-amber-400' },
  'pronto-para-dev': { label: 'Pronto para Dev',  dot: 'bg-blue-500' },
  'finalizado':      { label: 'Finalizado',       dot: 'bg-green-500' }
};

function _syncStatusUI(value) {
  const cfg = _STATUS_CONFIG[value] || _STATUS_CONFIG['rascunho'];
  const dot  = document.getElementById('s1-status-dot');
  const text = document.getElementById('s1-status-text');
  const sel  = document.getElementById('s1-status');
  if (dot)  { dot.className = `w-2 h-2 rounded-full shrink-0 ${cfg.dot}`; }
  if (text) { text.textContent = cfg.label; }
  if (sel)  { sel.value = value; }
  // Marca a opção ativa no painel
  document.querySelectorAll('.status-opt').forEach(btn => {
    const isActive = btn.dataset.value === value;
    btn.classList.toggle('bg-blue-50', isActive);
    btn.classList.toggle('dark:bg-blue-900/20', isActive);
    const span = btn.querySelector('span:last-child');
    if (span) span.classList.toggle('font-bold', isActive);
  });
}

function _closeStatusPanel() {
  const panel = document.getElementById('s1-status-panel');
  const chev  = document.getElementById('s1-status-chev');
  if (panel) { panel.classList.add('hidden'); panel.style.cssText = ''; }
  if (chev)  chev.style.transform = '';
}

function toggleStatusDropdown(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('s1-status-panel');
  const chev  = document.getElementById('s1-status-chev');
  if (!panel) return;
  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) {
    _closeStatusPanel();
  } else {
    // Usa position:fixed para escapar de containers com overflow:hidden
    const btn = document.getElementById('s1-status-btn');
    if (btn) {
      const r = btn.getBoundingClientRect();
      panel.style.cssText = `position:fixed;top:${r.bottom + 2}px;left:${r.left}px;width:${r.width}px;z-index:9999;`;
    }
    panel.classList.remove('hidden');
    if (chev) chev.style.transform = 'rotate(180deg)';
    // Fecha ao clicar fora
    const close = (ev) => {
      const wrapper = document.getElementById('s1-status-wrapper');
      if (wrapper && !wrapper.contains(ev.target)) {
        _closeStatusPanel();
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }
}

function selectStatus(value) {
  handoffData.step1.status = value;
  _syncStatusUI(value);
  _closeStatusPanel();
  saveToStorage();
}

// ── Validação Step 1 ───────────────────────────────────────────────────
function validateStep1() {
  const titulo = (document.getElementById('s1-titulo')?.value || '').trim();
  handoffData.step1.titulo = titulo;
  clearTimeout(validateStep1._t);
  validateStep1._t = setTimeout(saveToStorage, 600);
  const equipe = handoffData.step1.equipe || [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasValidEmail = equipe.some(m => emailRegex.test((m.email || '').trim()));
  const ok = titulo.length > 0 && hasValidEmail;

  const hint = document.getElementById('step1-validation-hint');
  if (hint) {
    if (!titulo) {
      hint.textContent = 'Preencha o título do projeto para avançar.';
      hint.classList.remove('hidden');
    } else if (!hasValidEmail) {
      hint.textContent = 'Adicione ao menos um membro da equipe com e-mail válido.';
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }
  return ok;
}

// ── Team Management (Step 1) ───────────────────────────────────────────
function addTeamMember(papel = "Designer", nome = "", email = "", skipScroll = false) {
  const list = document.getElementById("list-equipe");
  if (!list) return;
  const id = "team-" + Date.now() + Math.floor(Math.random() * 1000);

  if (!handoffData.step1.equipe) handoffData.step1.equipe = [];
  const member = { id, papel, nome, email };
  handoffData.step1.equipe.push(member);

  const item = document.createElement("div");
  item.id = "item-" + id;
  item.className = "p-3 bg-gray-50/50 dark:bg-dark-bg/30 border border-gray-100 dark:border-dark-line rounded-lg animate-in slide-in-from-top-2 duration-200";
  item.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <div class="relative" id="cs-role-${id}">
        <select id="role-${id}" class="hidden" onchange="updateTeamMember('${id}','papel',this.value)">
          <option value="Designer" ${papel === "Designer" ? "selected" : ""}>Designer</option>
          <option value="DEV"      ${papel === "DEV"      ? "selected" : ""}>DEV</option>
          <option value="PO"       ${papel === "PO"       ? "selected" : ""}>PO</option>
          <option value="QA"       ${papel === "QA"       ? "selected" : ""}>QA</option>
          <option value="Outro"    ${papel === "Outro"    ? "selected" : ""}>Outro</option>
        </select>
        <button type="button" onclick="_csToggle('cs-role-${id}', event)"
          class="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg text-[11px] font-bold text-slate-700 dark:text-white cursor-pointer hover:border-gray-300 focus:ring-1 focus:ring-[#0070af]/30 outline-none transition-all">
          <span data-cs-label>${papel}</span>
          <i data-lucide="chevron-down" data-cs-chev class="w-3 h-3 text-gray-400 transition-transform"></i>
        </button>
        <div data-cs-panel class="hidden absolute top-full left-0 mt-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg shadow-lg z-50 overflow-hidden py-1 min-w-[110px]">
          ${['Designer','DEV','PO','QA','Outro'].map(r => `<button type="button" onclick="_csSelect('cs-role-${id}','${r}')" data-cs-opt="${r}" class="w-full text-left px-3 py-2 text-[11px] text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors${papel === r ? ' bg-blue-50 dark:bg-blue-900/20 text-[#0070af] font-bold' : ''}">${r}</button>`).join('')}
        </div>
      </div>
      <button onclick="removeTeamMember('${id}')" title="Remover membro" class="text-gray-300 hover:text-red-500 transition-colors">
        <i data-lucide="trash-2" class="w-3 h-3"></i>
      </button>
    </div>
    <div class="flex items-center gap-2">
      <input type="text" placeholder="Nome" value="${nome}" class="flex-1 min-w-0 px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none"
        onchange="updateTeamMember('${id}','nome',this.value)">
      <input type="email" placeholder="E-mail*" value="${email}" class="flex-1 min-w-0 px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none"
        onchange="updateTeamMember('${id}','email',this.value)" onblur="validateEmail(this);validateStep1()">
    </div>
  `;
  list.appendChild(item);
  _refreshIcons();
  if (!skipScroll) autoScrollToNewItem('handoff-scroll-container', item);
  validateStep1();
  saveToStorage();
}

function removeTeamMember(id) {
  const item = document.getElementById("item-" + id);
  if (item) item.remove();
  handoffData.step1.equipe = (handoffData.step1.equipe || []).filter(m => m.id !== id);
  validateStep1();
  saveToStorage();
}

function updateTeamMember(id, field, value) {
  const member = (handoffData.step1.equipe || []).find(m => m.id === id);
  if (member) member[field] = value;
  validateStep1();
  saveToStorage();
}

// ── Checklist exports ──────────────────────────────────────────────────
function _buildChecklistData() {
  const titulo = (handoffData.step1.titulo || '').trim();
  const equipe = handoffData.step1.equipe || [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const frames = handoffData.frames || [];
  const flows = handoffData.createdFlows || [];
  const briefingQs = handoffData.step2.briefingQuestions || [];
  const regras = handoffData.step2.regras || [];
  return { titulo, equipe, emailRegex, frames, flows, briefingQs, regras };
}

function exportChecklistMd() {
  const { titulo, equipe, emailRegex, frames, flows, briefingQs, regras } = _buildChecklistData();
  const ok = (b) => b ? '✅' : '❌';
  let md = `# Checklist do Handoff — ${titulo || 'Sem título'}\n\n`;
  md += `**Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n`;
  md += `## Configuração\n`;
  md += `- ${ok(!!titulo)} Título: ${titulo || '—'}\n`;
  const responsaveis = equipe.filter(m => emailRegex.test((m.email || '').trim()));
  md += `- ${ok(responsaveis.length > 0)} Equipe: ${equipe.length} membro(s)${responsaveis.length > 0 ? ` — ${responsaveis.map(m => `${m.nome || m.papel} <${m.email}>`).join(', ')}` : ''}\n\n`;
  md += `## Frames Documentados (${frames.length})\n`;
  if (frames.length > 0) {
    frames.forEach(f => {
      const specsCount = (f.createdSpecs || []).length;
      const medsCount = (f.measurements || []).length;
      const excsCount = (f.excecoes || []).length;
      md += `### ${f.nome}\n`;
      md += `- Tokens escaneados: ${f.specs ? 'Sim' : 'Não'}\n`;
      md += `- Especificações: ${specsCount}\n`;
      md += `- Medidas: ${medsCount}\n`;
      md += `- Cenários de Exceção: ${excsCount}\n\n`;
    });
  } else {
    md += `_Nenhum frame registrado._\n\n`;
  }
  md += `## Fluxos Mapeados (${flows.length})\n`;
  flows.forEach((fl, i) => { md += `${i + 1}. ${fl.name || fl.type} — ${fl.type}\n`; });
  if (flows.length === 0) md += `_Nenhum fluxo mapeado._\n`;
  md += `\n## Regras de Negócio (${regras.length})\n`;
  regras.forEach((r, i) => { md += `${i + 1}. **${r.titulo || 'Sem título'}**${r.link ? ` — [link](${r.link})` : ''}\n`; });
  if (regras.length === 0) md += `_Nenhuma regra cadastrada._\n`;
  if (briefingQs.length > 0) {
    md += `\n## Briefing (${briefingQs.length} pergunta(s))\n`;
    briefingQs.forEach((q, i) => {
      md += `### ${i + 1}. ${q.question || 'Pergunta'}\n${q.answer || '_Sem resposta_'}\n\n`;
    });
  }
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `handoff-${(titulo || 'projeto').replace(/\s+/g, '_')}.md`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast('Checklist exportado como .md');
}

function exportChecklistJson() {
  const { titulo, equipe, emailRegex, frames, flows, briefingQs, regras } = _buildChecklistData();
  const payload = {
    exportedAt: new Date().toISOString(),
    titulo,
    status: handoffData.step1.status,
    versao: handoffData.step1.versao,
    objetivo: handoffData.step1.objetivo,
    equipe: equipe.map(m => ({ papel: m.papel, nome: m.nome, email: m.email })),
    frames: frames.map(f => ({
      nome: f.nome,
      figmaId: f.figmaId,
      tokensEscaneados: !!f.specs,
      especificacoes: (f.createdSpecs || []).length,
      medidas: (f.measurements || []).length,
      excecoes: (f.excecoes || []).map(e => ({ tipo: e.tipo, titulo: e.titulo, link: e.link, notas: e.notas }))
    })),
    fluxos: flows.map(fl => ({ nome: fl.name, tipo: fl.type })),
    regras: regras.map(r => ({ titulo: r.titulo, link: r.link, notas: r.notas })),
    briefing: briefingQs.map(q => ({ pergunta: q.question, resposta: q.answer, categoria: q.category }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `handoff-${(titulo || 'projeto').replace(/\s+/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast('Checklist exportado como .json');
}

// ── Validation Checklist (Step 5) ──────────────────────────────────────
function renderValidationChecklist() {
  const container = document.getElementById('validation-checklist');
  if (!container) return;

  const titulo = (handoffData.step1.titulo || '').trim();
  const equipe = handoffData.step1.equipe || [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasEmail = equipe.some(m => emailRegex.test((m.email || '').trim()));
  const frames = handoffData.frames || [];
  const frameCount = frames.length;
  const flowCount = (handoffData.createdFlows || []).length;

  const regularFrames = frames.filter(f => !f.isNewComponent);
  const newComponentFrames = frames.filter(f => f.isNewComponent);
  const pendingConformance = regularFrames.filter(f => !f.audit || !f.audit.status);
  const allConformanceDeclared = regularFrames.length === 0 || pendingConformance.length === 0;

  const items = [
    { ok: !!titulo, label: titulo ? `Título: <strong>${titulo}</strong>` : 'Título do projeto não preenchido' },
    { ok: hasEmail, label: hasEmail ? `${equipe.length} ${equipe.length === 1 ? 'responsável' : 'responsáveis'} na equipe` : 'Nenhum e-mail de responsável cadastrado' },
    { ok: frameCount > 0, label: frameCount > 0 ? `${frameCount} ${frameCount === 1 ? 'frame documentado' : 'frames documentados'}` : 'Nenhum frame registrado' },
    {
      ok: allConformanceDeclared && regularFrames.length > 0,
      warn: !allConformanceDeclared,
      label: pendingConformance.length > 0
        ? `${pendingConformance.length} ${pendingConformance.length === 1 ? 'frame' : 'frames'} com conformidade pendente`
        : regularFrames.length > 0
          ? `Conformidade declarada em ${regularFrames.length} ${regularFrames.length === 1 ? 'frame' : 'frames'}`
          : 'Nenhum frame regular para validar'
    },
    { ok: flowCount > 0, optional: true, label: flowCount > 0 ? `${flowCount} ${flowCount === 1 ? 'fluxo mapeado' : 'fluxos mapeados'}` : 'Nenhum fluxo mapeado (opcional)' }
  ];

  container.innerHTML = items.map(item => `
    <div class="flex items-center gap-3 py-2.5 border-b border-gray-50 dark:border-dark-line last:border-0">
      <div class="w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
        item.ok ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
        : item.warn ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
        : item.optional ? 'bg-gray-100 dark:bg-dark-surface text-gray-400'
        : 'bg-red-100 dark:bg-red-900/30 text-red-500'
      }">
        <i data-lucide="${item.ok ? 'check' : item.optional && !item.ok ? 'minus' : 'x'}" class="w-3 h-3"></i>
      </div>
      <span class="text-[12px] text-slate-600 dark:text-dark-text">${item.label}</span>
    </div>
  `).join('');

  // Seção de Novos Componentes
  if (newComponentFrames.length > 0) {
    const warnings = newComponentFrames.map(f => `
      <div class="flex items-start gap-2 py-2 border-b border-violet-100 dark:border-violet-800/20 last:border-0">
        <i data-lucide="component" class="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5"></i>
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-bold text-slate-700 dark:text-white truncate">${f.nome}</p>
          <p class="text-[10px] text-violet-500">Novo Componente — verifique documentação</p>
        </div>
      </div>`).join('');

    container.innerHTML += `
      <div class="mt-3 rounded-xl border border-violet-200 dark:border-violet-800/30 overflow-hidden">
        <div class="px-3 py-2.5 bg-violet-50 dark:bg-violet-900/20 flex items-center gap-2 border-b border-violet-100 dark:border-violet-800/30">
          <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-violet-500 shrink-0"></i>
          <p class="text-[11px] font-bold text-violet-700 dark:text-violet-300">Frames com Novos Componentes</p>
        </div>
        <div class="px-3 py-1 bg-white dark:bg-dark-surface">${warnings}</div>
        <div class="px-3 py-2.5 bg-violet-50/60 dark:bg-violet-900/10">
          <p class="text-[10px] text-violet-600 dark:text-violet-400 leading-relaxed">
            Documente o padrão de uso, nomenclatura de tokens e diretrizes de aplicação antes de finalizar o handoff.
          </p>
        </div>
      </div>`;
  }

  // Bloqueia o botão "Gerar Ficha" se requisitos obrigatórios não estiverem OK
  const allOk = !!titulo && hasEmail && frameCount > 0 && allConformanceDeclared;
  const btnGenerate = document.getElementById('btn-create-handoff');
  if (btnGenerate) {
    btnGenerate.disabled = !allOk;
    btnGenerate.classList.toggle('opacity-50', !allOk);
    btnGenerate.classList.toggle('cursor-not-allowed', !allOk);
    if (!allOk) {
      btnGenerate.title = 'Complete os itens obrigatórios do checklist para gerar a ficha';
    } else {
      btnGenerate.removeAttribute('title');
    }
  }

  _refreshIcons();
}

// ── Navigation ─────────────────────────────────────────────────────────
function scrollToStep(stepId) {
  document.querySelectorAll(".step-content").forEach(el => el.classList.add("hidden"));
  const target = document.getElementById(stepId);
  if (target) target.classList.remove("hidden");
  const container = document.getElementById("handoff-scroll-container");
  if (container) container.scrollTop = 0;
  currentStep = parseInt(stepId.split("-")[1]);
  updateNavigationUI();
  const btnTop = document.getElementById('btn-top');
  if (btnTop) {
    btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
    btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
  }
  if (currentStep === 4) renderFlowsList();
  if (currentStep === 5) renderValidationChecklist();
  updateFABVisibility();
}

function updateNavigationUI() {
  const navSelect = document.getElementById("nav-select");
  if (navSelect) navSelect.value = "step-" + currentStep;
  _csSyncLabel('cs-nav');
  _csMarkActive('cs-nav', 'step-' + currentStep);
  for (let i = 1; i <= totalSteps; i++) {
    const dot = document.getElementById("dot-" + i);
    if (dot) {
      dot.classList.toggle("bg-[#0070af]", i === currentStep);
      dot.classList.toggle("bg-gray-200", i !== currentStep);
      dot.classList.toggle("dark:bg-dark-surface", i !== currentStep);
      dot.classList.toggle("w-3", i === currentStep);
      dot.classList.toggle("w-1.5", i !== currentStep);
    }
  }
  updateFooterButtons();
  updateFABVisibility();
  _refreshIcons();
}

function updateFABVisibility() {
  try { _refreshIcons(); } catch(e) {}
}

function nextStep() {
  if (currentStep === 1 && !validateStep1()) {
    showToast('Preencha o título e ao menos um e-mail de responsável para avançar.');
    return;
  }
  // Step 3 → Step 4: exibe instrução de Check Designs na primeira vez
  if (currentStep === 3) {
    const key = 'handex-check-designs-prompted-v1';
    let _storageHit = false;
    try { _storageHit = !localStorage.getItem(key); if (_storageHit) localStorage.setItem(key, '1'); } catch (e) { }
    if (_storageHit) {
      const modal = document.getElementById('check-designs-modal');
      if (modal) {
        modal.classList.remove('hidden');
        _refreshIcons();
        return;
      }
    }
  }
  if (currentStep < totalSteps) scrollToStep("step-" + (currentStep + 1));
}

function prevStep() {
  if (currentStep > 1) scrollToStep("step-" + (currentStep - 1));
}

function updateFooterButtons() {
  const btnBack = document.getElementById("btn-back");
  const btnNext = document.getElementById("btn-next");
  if (!btnBack || !btnNext) return;
  if (currentStep === 1) {
    btnBack.textContent = "Home";
    btnBack.onclick = () => navigate("view-home");
  } else {
    btnBack.textContent = "Voltar";
    btnBack.onclick = () => prevStep();
  }
  if (currentStep === totalSteps) {
    btnNext.classList.add("hidden");
  } else {
    btnNext.classList.remove("hidden");
    btnNext.innerHTML = '<span>Próximo</span> <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>';
    btnNext.classList.remove("bg-green-600");
    btnNext.classList.add("bg-[#0070af]");
    btnNext.onclick = () => nextStep();
  }
  _refreshIcons();
}

// initBriefingSuggestions é inicializado sob demanda (ao abrir o briefing pela primeira vez)

// ── Storage ────────────────────────────────────────────────────────────
function saveToStorage() {
  parent.postMessage({ pluginMessage: { type: 'save-storage', data: handoffData } }, '*');
}

function saveAndReturn() {
  saveToStorage();
  showToast('Salvo automaticamente', 'success');
  navigate('view-home');
}
window.saveAndReturn = saveAndReturn;

// Mostra toast de salvo ao adicionar qualquer item relevante
function _toastSaved() {
  showToast('Salvo automaticamente', 'success');
}
window._toastSaved = _toastSaved;

function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) { }
  document.querySelectorAll(".sun-icon").forEach(el => el.classList.toggle("hidden", isDark));
  document.querySelectorAll(".moon-icon").forEach(el => el.classList.toggle("hidden", !isDark));
  _refreshIcons();
}

function incrementVersion(v) {
  if (!v) return 'v1.1';
  const match = v.match(/v?(\d+)\.(\d+)/);
  if (!match) return v + '.1';
  return `v${match[1]}.${parseInt(match[2]) + 1}`;
}

function bumpVersion(v, type) {
  const clean = (v || 'v1.0').replace(/^v/i, '');
  const parts = clean.split('.').map(n => parseInt(n) || 0);
  const major = parts[0] || 1;
  const minor = parts[1] || 0;
  if (type === 'major') return `v${major + 1}.0`;
  return `v${major}.${minor + 1}`;
}
window.bumpVersion = bumpVersion;

function updateData(step, key, value) {
  if (!handoffData[step]) handoffData[step] = {};
  handoffData[step][key] = value;
  saveToStorage();
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'bg-slate-800 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-2';
  toast.innerHTML = `<i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-green-400"></i> ${message}`;
  container.appendChild(toast);
  try { _refreshIcons(); } catch(e) {}
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
  updateFABVisibility(true);
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
  updateFABVisibility(false);
}

function startHandoff() {
  navigate("view-frames");
  restoreUIFromState();
  parent.postMessage({ pluginMessage: { type: 'get-project-name' } }, '*');
}

function openDadosProjetoModal() {
  navigate('view-dados-projeto');
}

function navigate(viewId) {
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.add("active");
  const containers = document.querySelectorAll('.overflow-y-auto');
  containers.forEach(c => c.scrollTop = 0);
  const btnTop = document.getElementById('btn-top');
  if (btnTop) {
    btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
    btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
  }
  document.getElementById("header-home")?.classList.remove("hidden");
  if (viewId === 'view-specifications') {
    syncAndRenderSpecs();
    renderExcecoesView();
    populateFrameSelector('spec-frame-selector');
  }
  if (viewId === 'view-flows') renderFlowsList();
  if (viewId === 'view-measurement') {
    renderAllMeasurements();
    populateFrameSelector('measure-frame-selector');
  }
  if (viewId === 'view-frames') {
    restoreUIFromState();
    parent.postMessage({ pluginMessage: { type: 'get-project-name' } }, '*');
  }
  if (viewId === 'view-dados-projeto') {
    restoreUIFromState();
    initBriefingSuggestions();
    parent.postMessage({ pluginMessage: { type: 'get-project-name' } }, '*');
  }
  if (viewId === 'view-handoff-summary') {
    updateHandoffSummary();
  }
  updateFABVisibility();
}

function populateFrameSelector(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const frames = handoffData.frames || [];
  const card = sel.closest('[data-frame-selector-card]');
  if (card) card.classList.toggle('hidden', frames.length === 0);
  if (frames.length === 0) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Sem vínculo (avulso)</option>';
  frames.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.nome || f.id;
    sel.appendChild(opt);
  });
  // Preserve current activeFrameId selection
  const target = current || (activeFrameId || '');
  if (target) sel.value = target;
}

function setMeasureActiveFrame(frameId) {
  activeFrameId = frameId || null;
  if (activeFrameId) {
    const frame = getFrame(activeFrameId);
    if (frame?.figmaId) focusNode(frame.figmaId);
  }
  ['measure-frame-selector', 'spec-frame-selector'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== (frameId || '')) el.value = frameId || '';
  });
}

function updateHandoffSummary() {
  collectHandoffData();
  const frames  = handoffData.frames || [];
  const titulo  = handoffData.step1?.titulo || '—';
  const versao  = handoffData.step1?.versao || '—';
  const status  = handoffData.step1?.status || '—';
  const designer = (handoffData.step1?.equipe || []).find(m => m.papel === 'designer');

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('hs-titulo', titulo);
  set('hs-versao', versao);
  set('hs-status', status);
  set('hs-designer', designer?.nome || '—');

  const jornada = handoffData.step1?.jornada || '';
  const feature = handoffData.step1?.feature || '';
  set('hs-jornada', jornada || '—');
  set('hs-feature', feature || '—');
  const jornadaRow = document.getElementById('hs-jornada-row');
  if (jornadaRow) jornadaRow.classList.toggle('hidden', !jornada);
  const featureRow = document.getElementById('hs-feature-row');
  if (featureRow) featureRow.classList.toggle('hidden', !feature);

  set('hs-count-frames', frames.length);
  set('hs-count-specs', frames.reduce((s, f) => s + (f.createdSpecs?.length || 0), 0));
  set('hs-count-measures', frames.reduce((s, f) => s + (f.measurements?.length || 0), 0));
  set('hs-count-flows', (handoffData.createdFlows || []).length);
  _refreshIcons();
}

// ── Aggregated view renderers ──────────────────────────────────────────

function renderAllMeasurements() {
  const all = [
    ...(handoffData.measurements || []),
    ...(handoffData.frames || []).flatMap(f => f.measurements || [])
  ];
  if (typeof renderMeasurementsResults === 'function') renderMeasurementsResults(all);
}

function syncAndRenderSpecs() {
  createdSpecs = (handoffData.frames || []).flatMap(f => f.createdSpecs || []);
  if (typeof renderSpecsList === 'function') renderSpecsList();
}

function renderExcecoesView() {
  const container = document.getElementById('excecoes-results');
  if (!container) return;
  const all = (handoffData.frames || []).flatMap(f =>
    (f.excecoes || []).map(e => ({ ...e, _frameName: f.nome, _frameId: f.id }))
  );
  if (all.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-slate-500 dark:text-dark-muted text-center py-5">Nenhum cenário registrado ainda</p>`;
    return;
  }
  const iconMap = { Erro: 'x-circle', Sucesso: 'check-circle', Confirmação: 'help-circle', Alerta: 'alert-triangle' };
  const colorMap = { Erro: 'text-red-500', Sucesso: 'text-green-500', Confirmação: 'text-blue-500', Alerta: 'text-amber-500' };
  container.innerHTML = '';
  all.forEach(exc => {
    const icon  = iconMap[exc.tipo]  || 'alert-circle';
    const color = colorMap[exc.tipo] || 'text-orange-500';
    const div = document.createElement('div');
    div.className = 'p-3 bg-gray-50 dark:bg-dark-bg/30 border border-gray-100 dark:border-dark-line rounded-xl';
    div.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <i data-lucide="${icon}" class="w-3.5 h-3.5 ${color} shrink-0"></i>
          <div class="min-w-0">
            <span class="text-[11px] font-bold text-slate-700 dark:text-white block truncate">${exc.titulo || exc.tipo}</span>
            <span class="text-[10px] text-slate-500 truncate block">${exc._frameName ? '→ ' + exc._frameName : ''}</span>
          </div>
        </div>
        <button onclick="removeExcecaoForFrame('${exc._frameId}','${exc.id}')" class="text-gray-300 hover:text-red-500 transition-colors shrink-0">
          <i data-lucide="trash-2" class="w-3 h-3"></i>
        </button>
      </div>
      ${exc.link ? `<a href="${exc.link}" target="_blank" class="flex items-center gap-1 text-[10px] text-[#0070af] hover:underline truncate mt-1"><i data-lucide="link" class="w-2.5 h-2.5 shrink-0"></i>${exc.link}</a>` : ''}
      ${exc.notas ? `<p class="text-[10px] text-slate-500 dark:text-dark-muted mt-1 leading-relaxed">${exc.notas}</p>` : ''}
    `;
    container.appendChild(div);
  });
  _refreshIcons();
}

function openExceptionForSpecs() {
  if (!activeFrameId) {
    showToast('Selecione um frame em "Frames Mapeados" antes de criar um cenário.', 'warning');
    return;
  }
  openExceptionModal(activeFrameId);
}

function exportHandoffMD() {
  collectHandoffData();
  const md = handoffData.mdContent;
  if (!md) { showToast('Nenhum conteúdo para exportar.', 'error'); return; }
  const name = `handex-${(handoffData.step1?.titulo || 'projeto').replace(/\s+/g,'-')}-${new Date().toISOString().split('T')[0]}.md`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  showToast('Markdown exportado!', 'success');
}

function toggleAccordion(btn, nodeId = null) {
  let content = btn.nextElementSibling;
  if (!content || content.tagName === 'BUTTON' || content.hasAttribute('data-accordion-toggle')) {
    const parent = btn.closest('.border, .rounded-xl, .mb-3');
    content = parent ? parent.querySelector('.accordion-content, [data-accordion-content]') : null;
  }
  if (!content) return;
  const icon = btn.querySelector('[data-lucide="chevron-down"]');
  const isHidden = content.classList.contains("hidden");
  content.classList.toggle("hidden");
  btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  if (icon) icon.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
  if (nodeId) focusNode(nodeId);
}

// ── File Handling (Anexos - Step 2) ───────────────────────────────────
function handleChecklistFile(input) {
  const files = Array.from(input.files);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => { window.uploadedFiles[file.name] = e.target.result; };
    reader.readAsArrayBuffer(file);
    if (!handoffData.step2.anexos) handoffData.step2.anexos = [];
    if (!handoffData.step2.anexos.find(a => a.name === file.name)) {
      handoffData.step2.anexos.push({ name: file.name, size: file.size });
    }
    const list = document.getElementById("checklist-file-list");
    if (list) {
      const item = document.createElement("div");
      item.className = "flex items-center gap-2 px-3 py-2 bg-white dark:bg-dark-bg border border-gray-100 dark:border-dark-line rounded-lg text-[11px] group";
      item.innerHTML = `
        <i data-lucide="file" class="w-3.5 h-3.5 text-blue-500"></i>
        <span class="flex-1 truncate font-medium text-slate-700 dark:text-dark-text">${file.name}</span>
        <button onclick="removeAnexo('${file.name}',this)" title="Remover" class="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      `;
      list.appendChild(item);
      _refreshIcons();
    }
    saveToStorage();
  });
  input.value = "";
}

function removeAnexo(name, btn) {
  handoffData.step2.anexos = (handoffData.step2.anexos || []).filter(a => a.name !== name);
  delete window.uploadedFiles[name];
  btn.closest("div").remove();
  saveToStorage();
}

// ── Validation ─────────────────────────────────────────────────────────
function validateUrl(input) {
  if (!input || !input.value) return;
  const val = input.value.trim();
  if (!val) return;
  try {
    new URL(val);
    input.classList.remove('border-red-500', 'ring-2', 'ring-red-100');
    input.classList.add('border-green-500');
    setTimeout(() => input.classList.remove('border-green-500'), 2000);
  } catch (e) {
    input.classList.add('border-red-500', 'ring-2', 'ring-red-100');
    showToast("URL inválida. Inclua http:// ou https://");
  }
}

function validateEmail(inputOrValue) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof inputOrValue === 'string') return emailRegex.test(inputOrValue.trim());
  if (!inputOrValue || !inputOrValue.value) return false;
  const val = inputOrValue.value.trim();
  const valid = emailRegex.test(val);
  if (val) {
    inputOrValue.classList.toggle('border-red-500', !valid);
    inputOrValue.classList.toggle('ring-2', !valid);
    inputOrValue.classList.toggle('ring-red-100', !valid);
    if (valid) {
      inputOrValue.classList.add('border-green-500');
      setTimeout(() => inputOrValue.classList.remove('border-green-500'), 2000);
    }
  }
  return valid;
}

// ── Help Modals ────────────────────────────────────────────────────────
let lastModalBeforeHelp = null;
let currentScannedProps = [];

function openHelp(fromModalId) {
  lastModalBeforeHelp = fromModalId;
  if (fromModalId) closeModal(fromModalId);
  openModal('spec-types-help-modal');
}

function closeHelpAndReturn() {
  closeModal('spec-types-help-modal');
  if (lastModalBeforeHelp) {
    openModal(lastModalBeforeHelp);
    lastModalBeforeHelp = null;
  }
}

// ── Scroll ─────────────────────────────────────────────────────────────
function handleScroll(el) {
  const btnTop = document.getElementById('btn-top');
  if (btnTop) {
    if (el.scrollTop > 100) {
      btnTop.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
      btnTop.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
    } else {
      btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
      btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
    }
  }
  // Snackbar ao chegar no fim da view de Informações do Projeto
  if (el.closest && el.closest('#view-dados-projeto')) {
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    const snack = document.getElementById('dados-projeto-snackbar');
    if (snack && atBottom && !localStorage.getItem('handex_snack_dados_shown')) {
      localStorage.setItem('handex_snack_dados_shown', '1');
      snack.classList.remove('hidden');
      clearTimeout(window._dadosProjetoSnackTimer);
      window._dadosProjetoSnackTimer = setTimeout(() => {
        snack.classList.add('hidden');
      }, 4000);
    }
  }
}

function scrollToTop() {
  const visibleModals = Array.from(document.querySelectorAll('[id$="-modal"]:not(.hidden)'));
  if (visibleModals.length > 0) {
    const modal = visibleModals[visibleModals.length - 1];
    const scrollable = modal.querySelector('.overflow-y-auto') || modal;
    scrollable.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const activeView = document.querySelector('.view.active');
  if (activeView) {
    const mainScroll = activeView.querySelector('.flex-1.overflow-y-auto') ||
                       activeView.querySelector('.overflow-y-auto') ||
                       document.querySelector('.flex-1.overflow-y-auto.relative');
    if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function autoScrollToNewItem(containerId, targetElement = null) {
  setTimeout(() => {
    const target = targetElement
      || document.getElementById(containerId)?.lastElementChild;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      target.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
      setTimeout(() => target.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2'), 2000);
    }
  }, 100);
}

function focusNode(id) {
  parent.postMessage({ pluginMessage: { type: 'highlight-node', id, highlight: true, shouldScroll: true, color: '#0070af' } }, '*');
}

// ── Restauração leve no boot (só step1, sem renderizar frames/flows/specs) ──
function _restoreStep1Fields() {
  const fields = ['s1-titulo', 's1-versao', 's1-objetivo', 's1-jornada', 's1-feature'];
  fields.forEach(id => {
    const key = id.replace('s1-', '');
    const el = document.getElementById(id);
    if (el) el.value = handoffData.step1[key] || (key === 'versao' ? 'v1.0' : '');
  });
  _syncStatusUI(handoffData.step1.status || 'rascunho');
  ['jornada', 'feature'].forEach(function(field) {
    const hasValue = !!(handoffData.step1[field] || '').trim();
    const toggle = document.getElementById('toggle-' + field);
    const fieldDiv = document.getElementById(field + '-field');
    if (toggle) toggle.checked = hasValue;
    if (fieldDiv) fieldDiv.classList.toggle('hidden', !hasValue);
  });
  if (typeof validateStep1 === 'function') validateStep1();
}

// ── UI Restoration ─────────────────────────────────────────────────────
function restoreUIFromState() {
  // Step 1 — Governança
  const s1Titulo = document.getElementById("s1-titulo");
  if (s1Titulo) s1Titulo.value = handoffData.step1.titulo || "";
  _syncStatusUI(handoffData.step1.status || "rascunho");
  const s1Versao = document.getElementById("s1-versao");
  if (s1Versao) s1Versao.value = handoffData.step1.versao || "v1.0";
  const s1Objetivo = document.getElementById("s1-objetivo");
  if (s1Objetivo) s1Objetivo.value = handoffData.step1.objetivo || "";
  const s1Jornada = document.getElementById("s1-jornada");
  if (s1Jornada) s1Jornada.value = handoffData.step1.jornada || "";
  const s1Feature = document.getElementById("s1-feature");
  if (s1Feature) s1Feature.value = handoffData.step1.feature || "";

  // Restaurar estado dos toggles de Jornada e Feature
  ['jornada', 'feature'].forEach(function(field) {
    const hasValue = !!(handoffData.step1[field] || '').trim();
    const toggle = document.getElementById('toggle-' + field);
    const fieldDiv = document.getElementById(field + '-field');
    if (toggle) toggle.checked = hasValue;
    if (fieldDiv) fieldDiv.classList.toggle('hidden', !hasValue);
  });

  // Equipe (now in step1)
  const listEquipe = document.getElementById("list-equipe");
  if (listEquipe && handoffData.step1.equipe) {
    listEquipe.innerHTML = "";
    handoffData.step1.equipe.forEach(m => {
      // Re-add without pushing to array again (already in state)
      const savedEquipe = handoffData.step1.equipe;
      handoffData.step1.equipe = savedEquipe.filter(x => x.id !== m.id);
      addTeamMember(m.papel || m.role || "Designer", m.nome || m.name || "", m.email || "", true);
    });
  }
  validateStep1();

  // Step 2 — Briefing
  const briefingContainer = document.getElementById('briefing-questions-container-v2');
  if (briefingContainer) {
    briefingContainer.innerHTML = '';
    (handoffData.step2.briefingQuestions || []).forEach((q, i) => {
      const card = document.createElement('div');
      card.id = `briefing-card-${q.id}`;
      card.className = "bg-white dark:bg-dark-bg p-5 rounded-xl border border-gray-100 dark:border-dark-line shadow-sm relative";
      card.innerHTML = `
        <button onclick="removeBriefingQuestion('${q.id}')" title="Excluir" class="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
        <div class="flex items-center gap-3 mb-4">
          <span class="text-[#0070af] font-bold text-[14px]">#${i+1} Pergunta</span>
          <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-dark-muted rounded border border-gray-100 dark:border-dark-line uppercase tracking-wider">${q.category || "Customizada"}</span>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-[11px] font-bold text-[#0070af] uppercase mb-1.5">Pergunta</label>
            <textarea class="w-full px-3 py-2 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold text-slate-700 dark:text-white min-h-[44px] resize-none overflow-hidden"
              oninput="this.style.height='';this.style.height=this.scrollHeight+'px'"
              onchange="updateBriefingQuestion('${q.id}','question',this.value)">${q.question}</textarea>
          </div>
          <div>
            <label class="block text-[11px] font-bold text-[#0070af] uppercase mb-1.5">Resposta</label>
            <textarea class="w-full px-3 py-2 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg text-sm min-h-[100px] focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
              onchange="updateBriefingQuestion('${q.id}','answer',this.value)">${q.answer}</textarea>
          </div>
        </div>
      `;
      briefingContainer.appendChild(card);
    });
    setTimeout(() => {
      document.querySelectorAll('#briefing-questions-container-v2 textarea').forEach(ta => {
        ta.style.height = ''; ta.style.height = ta.scrollHeight + 'px';
      });
    }, 100);
  }
  // Inicializa categorias de briefing sempre (toggle removido)
  const catContainer = document.getElementById('briefing-categories-container-v2');
  if (catContainer && catContainer.innerHTML === '') initBriefingSuggestions();

  // Step 2 — Regras
  const listRegras = document.getElementById('list-regras-s2');
  if (listRegras) {
    const savedRegras = [...(handoffData.step2.regras || [])];
    handoffData.step2.regras = [];
    listRegras.innerHTML = '';
    savedRegras.forEach(r => {
      addRegra();
      const newItem = listRegras.lastElementChild;
      const newEntry = handoffData.step2.regras[handoffData.step2.regras.length - 1];
      if (newEntry) {
        newEntry.titulo = r.titulo || '';
        newEntry.link = r.link || '';
        newEntry.notas = r.notas || '';
      }
      if (newItem) {
        const titleInput = newItem.querySelector('input[type="text"]');
        const linkInput = newItem.querySelectorAll('input[type="text"]')[1];
        const textarea = newItem.querySelector('textarea');
        if (titleInput) titleInput.value = r.titulo || '';
        if (linkInput) linkInput.value = r.link || '';
        if (textarea) textarea.value = r.notas || '';
      }
    });
    updateRegrasCount();
  }

  // Step 3 — Frames
  const framesContainer = document.getElementById('list-frames');
  if (framesContainer) {
    framesContainer.innerHTML = '';
    (handoffData.frames || []).forEach(frame => renderFrameCard(frame));
  }
  updateEmptyFramesState();

  // Audit global state
  const auditAutoBundle = handoffData.step2.auditAutoBundle;
  if (auditAutoBundle && typeof renderAuditRefsReady === 'function') {
    // Será usado quando o toggle de auditoria de algum frame for ativado
  }

  try { _refreshIcons(); } catch(e) {}
}

// ── Initialization ─────────────────────────────────────────────────────
window.addEventListener('load', () => {
  try { _refreshIcons(); } catch(e) {}
  parent.postMessage({ pluginMessage: { type: 'ui-ready' } }, '*');
  if (typeof initResizable === 'function') initResizable();
  if (handoffData && handoffData.uiScale) setUiScale(handoffData.uiScale);
});

// ── Accessibility & UX ─────────────────────────────────────────────────
function initResizable() {
  const handle = document.getElementById('resize-handle');
  if (!handle) return;
  let isResizing = false, startX, startY, startW, startH;
  handle.addEventListener('mousedown', (e) => {
    isResizing = true; startX = e.clientX; startY = e.clientY;
    startW = window.innerWidth; startH = window.innerHeight;
    document.body.style.cursor = 'nwse-resize'; e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    parent.postMessage({ pluginMessage: { type: 'resize', width: Math.round(Math.max(300, startW + (e.clientX - startX))), height: Math.round(Math.max(300, startH + (e.clientY - startY))) } }, '*');
  });
  window.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = 'default'; });
}

window.currentUiScale = 1;
function setUiScale(scale) {
  window.currentUiScale = scale;
  document.documentElement.style.setProperty('--ui-scale', scale);
  document.body.classList.toggle('scale-high', scale > 1.1);
  if (typeof handoffData !== 'undefined') { handoffData.uiScale = scale; saveToStorage(); }
}

function toggleUiScale() {
  const scales = [1, 1.15, 1.3, 0.9];
  let idx = scales.indexOf(window.currentUiScale);
  if (idx === -1) idx = 0;
  idx = (idx + 1) % scales.length;
  setUiScale(scales[idx]);
  showToast(`Escala da UI: ${Math.round(scales[idx] * 100)}%`);
}

window.toggleUiScale = toggleUiScale;
window.setUiScale = setUiScale;
window.initResizable = initResizable;
window.updateRegraField = updateRegraField;
window.removeAnexo = removeAnexo;
window.updateExcecaoField = updateExcecaoField;
window.linkCurrentSelectionForExc = linkCurrentSelectionForExc;
window.requestFrameRegistration = requestFrameRegistration;
