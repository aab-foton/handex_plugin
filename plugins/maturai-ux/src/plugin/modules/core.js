// ============================================================
// core.js — Estado, navegação e persistência do Maturai UX
// ============================================================

const MATURAI_VERSION = '1.0.0';

let maturaiData = _defaultState();

function _defaultState() {
  return {
    _schemaVersion: 1,
    projectId: _generateId(),
    createdAt: new Date().toISOString(),
    briefing: {
      projectName: '',
      squad: '',
      context: '',
      objectives: '',
      timeline: '',
      scope: '',
      outOfScope: ''
    },
    frameworks: []
  };
}

function _generateId() {
  return 'mx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Navigation ────────────────────────────────────────────────
function navigate(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');
  try { lucide.createIcons(); } catch(e) {}
}

// ── Persistence ───────────────────────────────────────────────
function saveState() {
  parent.postMessage({ pluginMessage: { type: 'save-state', data: maturaiData } }, '*');
}

function restoreUIFromState() {
  const b = maturaiData.briefing || {};
  _setVal('b-project-name', b.projectName);
  _setVal('b-squad', b.squad);
  _setVal('b-context', b.context);
  _setVal('b-objectives', b.objectives);
  _setVal('b-timeline', b.timeline);
  _setVal('b-scope', b.scope);
  _setVal('b-out-of-scope', b.outOfScope);
  renderFrameworkInstances();
  updateHomeBadges();
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

// ── Briefing ──────────────────────────────────────────────────
function saveBriefing() {
  maturaiData.briefing = {
    projectName: document.getElementById('b-project-name')?.value?.trim() || '',
    squad:       document.getElementById('b-squad')?.value?.trim() || '',
    context:     document.getElementById('b-context')?.value?.trim() || '',
    objectives:  document.getElementById('b-objectives')?.value?.trim() || '',
    timeline:    document.getElementById('b-timeline')?.value?.trim() || '',
    scope:       document.getElementById('b-scope')?.value?.trim() || '',
    outOfScope:  document.getElementById('b-out-of-scope')?.value?.trim() || ''
  };
  saveState();
  showToast('Briefing salvo.');
  updateHomeBadges();
}

function clearBriefing() {
  maturaiData.briefing = _defaultState().briefing;
  restoreUIFromState();
  saveState();
  showToast('Briefing limpo.');
}

// ── Framework instances ───────────────────────────────────────
function renderFrameworkInstances() {
  const container = document.getElementById('scanned-instances');
  if (!container) return;
  const instances = maturaiData.frameworks || [];

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
    const fw = MATURAI_FRAMEWORKS.find(f => f.id === inst.frameworkId);
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
            `<span class="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold rounded-full truncate max-w-[120px]">${v.slice(0, 40)}</span>`
          ).join('')}
          ${Object.values(inst.data || {}).filter(v => v).length > 3 ? `<span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 text-[9px] font-bold rounded-full">+${Object.values(inst.data).filter(v => v).length - 3}</span>` : ''}
        </div>
        <p class="text-[10px] text-slate-400">Escaneado em ${new Date(inst.scannedAt).toLocaleDateString('pt-BR')}</p>
      </div>`;
  }).join('');

  try { lucide.createIcons(); } catch(e) {}
}

function removeFrameworkInstance(idx) {
  maturaiData.frameworks.splice(idx, 1);
  renderFrameworkInstances();
  saveState();
  updateHomeBadges();
}

// ── Home badges ───────────────────────────────────────────────
function updateHomeBadges() {
  const briefingFilled = Object.values(maturaiData.briefing || {}).some(v => v);
  const el = document.getElementById('badge-briefing');
  if (el) el.classList.toggle('hidden', !briefingFilled);

  const fwCount = (maturaiData.frameworks || []).length;
  const fwBadge = document.getElementById('badge-frameworks');
  if (fwBadge) {
    fwBadge.textContent = fwCount;
    fwBadge.classList.toggle('hidden', fwCount === 0);
  }
}

// ── Export ────────────────────────────────────────────────────
function exportMaturaiData() {
  const payload = {
    ...maturaiData,
    exportedAt: new Date().toISOString(),
    _plugin: 'Maturai UX',
    _version: MATURAI_VERSION
  };
  parent.postMessage({ pluginMessage: { type: 'export-data', data: payload } }, '*');
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maturai-${maturaiData.briefing.projectName || 'projeto'}-${Date.now()}.json`;
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
    success: 'bg-emerald-600 text-white',
    error:   'bg-red-600 text-white',
    info:    'bg-[#059669] text-white'
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
  try { localStorage.setItem('maturai-theme', isDark ? 'dark' : 'light'); } catch(e) {}
  document.querySelectorAll('.sun-icon').forEach(el => el.classList.toggle('hidden', isDark));
  document.querySelectorAll('.moon-icon').forEach(el => el.classList.toggle('hidden', !isDark));
  try { lucide.createIcons(); } catch(e) {}
}

function applyTheme() {
  let dark = false;
  try { dark = localStorage.getItem('maturai-theme') === 'dark'; } catch(e) {}
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
  removeFrameworkInstance, exportMaturaiData,
  showToast, toggleTheme, updateHomeBadges,
  handleScroll, scrollToTop,
  toggleCollapse
});
