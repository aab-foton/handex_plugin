// ============================================================
// core.js — Estado, navegação e persistência do AMUX
// ============================================================

const AMUX_VERSION = '1.0.0';

let amuxData = _defaultState();

function _defaultState() {
  return {
    _schemaVersion: 1,
    projectId: _generateId(),
    createdAt: new Date().toISOString(),
    briefing: {
      comunidade: '',
      produto: '',
      canal: '',
      sistemaSigla: '',
      nomeProjeto: '',
      dataInicio: '',
      visaoGeral: '',
      objetivosNegocio: '',
      metaPesquisa: '',
      publicoAlvo: '',
      necessidades: '',
      frustracoes: '',
      entregaveis: '',
      stakeholders: '',
      tempo: '',
      rotina: '',
      compartilhamento: ''
    },
    evidencias: {
      descoberta:  { artefatos: [], observacoes: '' },
      definicao:   { artefatos: [], observacoes: '' },
      ideacao:     { artefatos: [], observacoes: '' },
      validacao:   { artefatos: [], observacoes: '' }
    },
    auditoria: {
      designSystem:   { status: 'pendente', observacoes: '', desvios: [] },
      acessibilidade: { status: 'pendente', observacoes: '', desvios: [] }
    },
    aiAnalysis: {
      status: 'idle',
      lastRunAt: null,
      agentResponses: {},
      scoreBreakdown: {}
    },
    score: {
      numeric: 0,
      stars: 0,
      computedAt: null
    },
    frameworks: []
  };
}

function _generateId() {
  return 'ax-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const AMUX_ETAPAS = ['descoberta', 'definicao', 'ideacao', 'validacao'];
const AMUX_ETAPA_LABELS = {
  descoberta: 'Descoberta',
  definicao:  'Definição',
  ideacao:    'Ideação',
  validacao:  'Validação'
};

// ── Navigation ────────────────────────────────────────────────
function navigate(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');
  try { lucide.createIcons(); } catch(e) {}
}

// ── Persistence ───────────────────────────────────────────────
function saveState() {
  parent.postMessage({ pluginMessage: { type: 'save-state', data: amuxData } }, '*');
}

function restoreUIFromState() {
  const b = amuxData.briefing || {};
  _setVal('b-comunidade', b.comunidade);
  _setVal('b-produto', b.produto);
  _setVal('b-canal', b.canal);
  _setVal('b-sistema-sigla', b.sistemaSigla);
  _setVal('b-nome-projeto', b.nomeProjeto);
  _setVal('b-data-inicio', b.dataInicio);
  _setVal('b-visao-geral', b.visaoGeral);
  _setVal('b-objetivos-negocio', b.objetivosNegocio);
  _setVal('b-meta-pesquisa', b.metaPesquisa);
  _setVal('b-publico-alvo', b.publicoAlvo);
  _setVal('b-necessidades', b.necessidades);
  _setVal('b-frustracoes', b.frustracoes);
  _setVal('b-entregaveis', b.entregaveis);
  _setVal('b-stakeholders', b.stakeholders);
  _setVal('b-tempo', b.tempo);
  _setVal('b-rotina', b.rotina);
  _setVal('b-compartilhamento', b.compartilhamento);

  renderFrameworkInstances();
  renderAuditStatus();
  renderScore();
  updateHomeBadges();
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

// ── Briefing ──────────────────────────────────────────────────
function saveBriefing() {
  amuxData.briefing = {
    comunidade:        document.getElementById('b-comunidade')?.value?.trim() || '',
    produto:            document.getElementById('b-produto')?.value?.trim() || '',
    canal:              document.getElementById('b-canal')?.value?.trim() || '',
    sistemaSigla:       document.getElementById('b-sistema-sigla')?.value?.trim() || '',
    nomeProjeto:        document.getElementById('b-nome-projeto')?.value?.trim() || '',
    dataInicio:         document.getElementById('b-data-inicio')?.value?.trim() || '',
    visaoGeral:         document.getElementById('b-visao-geral')?.value?.trim() || '',
    objetivosNegocio:   document.getElementById('b-objetivos-negocio')?.value?.trim() || '',
    metaPesquisa:       document.getElementById('b-meta-pesquisa')?.value?.trim() || '',
    publicoAlvo:        document.getElementById('b-publico-alvo')?.value?.trim() || '',
    necessidades:       document.getElementById('b-necessidades')?.value?.trim() || '',
    frustracoes:        document.getElementById('b-frustracoes')?.value?.trim() || '',
    entregaveis:        document.getElementById('b-entregaveis')?.value?.trim() || '',
    stakeholders:       document.getElementById('b-stakeholders')?.value?.trim() || '',
    tempo:              document.getElementById('b-tempo')?.value?.trim() || '',
    rotina:             document.getElementById('b-rotina')?.value?.trim() || '',
    compartilhamento:   document.getElementById('b-compartilhamento')?.value?.trim() || ''
  };
  saveState();
  showToast('Briefing salvo.');
  updateHomeBadges();
}

function clearBriefing() {
  amuxData.briefing = _defaultState().briefing;
  restoreUIFromState();
  saveState();
  showToast('Briefing limpo.');
}

// ── Framework instances (herdado do Maturai UX) ─────────────────
function renderFrameworkInstances() {
  const container = document.getElementById('scanned-instances');
  if (!container) return;
  const instances = amuxData.frameworks || [];

  if (instances.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400 dark:text-dark-muted">
        <i data-lucide="scan-line" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
        <p class="text-[12px]">Nenhum framework escaneado ainda.</p>
        <p class="text-[11px] mt-1 opacity-70">Insira um framework no canvas e clique em Escanear.</p>
      </div>`;
    try { lucide.createIcons(); } catch(e) {}
    return;
  }

  container.innerHTML = instances.map((inst, i) => {
    const fw = AMUX_FRAMEWORKS.find(f => f.id === inst.frameworkId);
    const fieldCount = Object.keys(inst.data || {}).filter(k => inst.data[k]).length;
    const totalFields = fw ? fw.fields.length : 0;
    return `
      <div class="bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl p-3.5 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <i data-lucide="${fw?.icon || 'file'}" class="w-4 h-4 shrink-0 ${fw?.color || 'text-slate-400'}"></i>
            <span class="font-bold text-[12px] text-slate-800 dark:text-white truncate">${inst.frameName || fw?.name || inst.frameworkId}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[10px] text-slate-400">${fieldCount}/${totalFields} campos</span>
            <button onclick="removeFrameworkInstance(${i})" class="text-slate-300 hover:text-red-400 transition-colors">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
        <div class="flex flex-wrap gap-1">
          ${Object.entries(inst.data || {}).filter(([,v]) => v).slice(0, 3).map(([k, v]) =>
            `<span class="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[9px] font-bold rounded-full truncate max-w-[120px]">${v.slice(0, 40)}</span>`
          ).join('')}
          ${Object.values(inst.data || {}).filter(v => v).length > 3 ? `<span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 text-[9px] font-bold rounded-full">+${Object.values(inst.data).filter(v => v).length - 3}</span>` : ''}
        </div>
        <p class="text-[10px] text-slate-400">Escaneado em ${new Date(inst.scannedAt).toLocaleDateString('pt-BR')}</p>
      </div>`;
  }).join('');

  try { lucide.createIcons(); } catch(e) {}
}

function removeFrameworkInstance(idx) {
  amuxData.frameworks.splice(idx, 1);
  renderFrameworkInstances();
  saveState();
  updateHomeBadges();
}

// ── Auditoria (DSC / Acessibilidade) — status geral ─────────────
function renderAuditStatus() {
  ['designSystem', 'acessibilidade'].forEach(key => {
    const dim = amuxData.auditoria[key];
    const badge = document.getElementById('audit-status-' + key);
    if (badge && dim) {
      badge.textContent = _statusLabel(dim.status);
      badge.className = 'px-2 py-0.5 text-[10px] font-bold rounded-full ' + _statusClass(dim.status);
    }
  });
}

function _statusLabel(status) {
  return { pendente: 'Pendente', conforme: 'Conforme', 'com-desvios': 'Com desvios' }[status] || 'Pendente';
}

function _statusClass(status) {
  return {
    pendente:     'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-dark-muted',
    conforme:     'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    'com-desvios': 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
  }[status] || 'bg-slate-100 text-slate-500';
}

// ── Score ─────────────────────────────────────────────────────
function renderScore() {
  const starsEl = document.getElementById('score-stars');
  const numEl = document.getElementById('score-numeric');
  if (starsEl) {
    const stars = amuxData.score?.stars || 0;
    starsEl.innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<i data-lucide="star" class="w-5 h-5 ${i < stars ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-slate-700'}"></i>`
    ).join('');
  }
  if (numEl) numEl.textContent = amuxData.score?.numeric ? `${amuxData.score.numeric}/100` : '—';
  try { lucide.createIcons(); } catch(e) {}
}

// ── Home badges ───────────────────────────────────────────────
function updateHomeBadges() {
  const briefingFilled = Object.values(amuxData.briefing || {}).some(v => v);
  const el = document.getElementById('badge-briefing');
  if (el) el.classList.toggle('hidden', !briefingFilled);

  const evidenciasCount = AMUX_ETAPAS.filter(e => (amuxData.evidencias[e]?.artefatos || []).length > 0).length;
  const auditBadge = document.getElementById('badge-audit');
  if (auditBadge) {
    auditBadge.textContent = evidenciasCount;
    auditBadge.classList.toggle('hidden', evidenciasCount === 0);
  }

  const fwCount = (amuxData.frameworks || []).length;
  const fwBadge = document.getElementById('badge-frameworks');
  if (fwBadge) {
    fwBadge.textContent = fwCount;
    fwBadge.classList.toggle('hidden', fwCount === 0);
  }

  const scoreBadge = document.getElementById('badge-score');
  if (scoreBadge) scoreBadge.classList.toggle('hidden', !amuxData.score?.computedAt);
}

// ── Export ────────────────────────────────────────────────────
function exportAmuxData() {
  const payload = {
    ...amuxData,
    exportedAt: new Date().toISOString(),
    _plugin: 'AMUX',
    _version: AMUX_VERSION
  };
  parent.postMessage({ pluginMessage: { type: 'export-data', data: payload } }, '*');
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `amux-${amuxData.briefing.nomeProjeto || 'projeto'}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Dados exportados com sucesso!', 'success');
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const colors = {
    default: 'bg-slate-800 text-white',
    success: 'bg-blue-600 text-white',
    error:   'bg-red-600 text-white',
    info:    'bg-[#2563eb] text-white'
  };
  const toast = document.createElement('div');
  toast.className = `px-4 py-2.5 rounded-xl text-[12px] font-bold shadow-lg ${colors[type] || colors.default} transition-all`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Collapse / Expand ─────────────────────────────────────────
let _isCollapsed = false;
const _FULL_W = 380, _FULL_H = 600, _MINI_H = 44;

function toggleCollapse() {
  _isCollapsed = !_isCollapsed;
  const content = document.querySelector('body > div.flex-1');
  const footer  = document.getElementById('footer-signature');
  const btn     = document.getElementById('btn-collapse');
  if (_isCollapsed) {
    if (content) content.classList.add('hidden');
    if (footer)  footer.classList.add('hidden');
    if (btn) btn.innerHTML = '<i data-lucide="maximize-2" class="w-4 h-4" aria-hidden="true"></i>';
  } else {
    if (content) content.classList.remove('hidden');
    if (footer)  footer.classList.remove('hidden');
    if (btn) btn.innerHTML = '<i data-lucide="minimize-2" class="w-4 h-4" aria-hidden="true"></i>';
  }
  parent.postMessage({
    pluginMessage: { type: 'resize-ui', width: _FULL_W, height: _isCollapsed ? _MINI_H : _FULL_H }
  }, '*');
  try { lucide.createIcons(); } catch(e) {}
}

// ── Theme ─────────────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('amux-theme', isDark ? 'dark' : 'light'); } catch(e) {}
  document.querySelectorAll('.sun-icon').forEach(el => el.classList.toggle('hidden', isDark));
  document.querySelectorAll('.moon-icon').forEach(el => el.classList.toggle('hidden', !isDark));
  try { lucide.createIcons(); } catch(e) {}
}

function applyTheme() {
  let dark = false;
  try { dark = localStorage.getItem('amux-theme') === 'dark'; } catch(e) {}
  if (dark) {
    document.documentElement.classList.add('dark');
    document.querySelectorAll('.sun-icon').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.moon-icon').forEach(el => el.classList.remove('hidden'));
  }
}

applyTheme();

function handleScroll(el) {
  const btn = document.getElementById('btn-top');
  if (!btn) return;
  if (el.scrollTop > 80) {
    btn.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
  } else {
    btn.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
  }
}

function scrollToTop() {
  document.querySelectorAll('.view.active').forEach(v => v.scrollTo({ top: 0, behavior: 'smooth' }));
  const sc = document.querySelector('.flex-1.overflow-y-auto');
  if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
}

Object.assign(window, {
  navigate, saveBriefing, clearBriefing,
  removeFrameworkInstance, exportAmuxData,
  showToast, toggleTheme, updateHomeBadges,
  handleScroll, scrollToTop,
  toggleCollapse, renderAuditStatus, renderScore
});
