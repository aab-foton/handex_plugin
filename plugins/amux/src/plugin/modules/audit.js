// ============================================================
// audit.js — Auditoria de Maturidade: evidências das 4 etapas
// de UX (Descoberta, Definição, Ideação, Validação) + aderência
// ao Design System CAIXA e acessibilidade (AMUX)
// ============================================================

let _activeEtapa = 'descoberta';

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
  const obsEl = document.getElementById('etapa-obs-' + etapa);
  if (obsEl) obsEl.value = amuxData.evidencias[etapa]?.observacoes || '';
}

function saveEtapaObservacoes(etapa) {
  const el = document.getElementById('etapa-obs-' + etapa);
  if (!el || !amuxData.evidencias[etapa]) return;
  amuxData.evidencias[etapa].observacoes = el.value.trim();
  saveState();
}

function addArtefato(etapa) {
  const nomeEl = document.getElementById('artefato-nome-' + etapa);
  const urlEl = document.getElementById('artefato-url-' + etapa);
  const nome = nomeEl?.value?.trim();
  const url = urlEl?.value?.trim();
  if (!nome) {
    showToast('Informe um nome para o artefato.', 'error');
    return;
  }
  amuxData.evidencias[etapa].artefatos.push({
    id: _generateId(),
    nome,
    tipo: url ? 'link' : 'referencia',
    url: url || '',
    anexadoEm: new Date().toISOString()
  });
  if (nomeEl) nomeEl.value = '';
  if (urlEl) urlEl.value = '';
  renderArtefatos(etapa);
  saveState();
  updateHomeBadges();
  showToast('Artefato anexado.', 'success');
}

function removeArtefato(etapa, artefatoId) {
  const lista = amuxData.evidencias[etapa]?.artefatos || [];
  const idx = lista.findIndex(a => a.id === artefatoId);
  if (idx >= 0) lista.splice(idx, 1);
  renderArtefatos(etapa);
  saveState();
  updateHomeBadges();
}

function renderArtefatos(etapa) {
  const container = document.getElementById('artefatos-lista-' + etapa);
  if (!container) return;
  const artefatos = amuxData.evidencias[etapa]?.artefatos || [];

  if (artefatos.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400 dark:text-dark-muted">
        <i data-lucide="paperclip" class="w-6 h-6 mx-auto mb-1.5 opacity-40"></i>
        <p class="text-[11px]">Nenhum artefato anexado nesta etapa.</p>
      </div>`;
    try { lucide.createIcons(); } catch(e) {}
    return;
  }

  container.innerHTML = artefatos.map(a => `
    <div class="flex items-center justify-between gap-2 bg-slate-50 dark:bg-dark-bg/40 border border-gray-100 dark:border-dark-line rounded-xl px-3 py-2">
      <div class="flex items-center gap-2 min-w-0">
        <i data-lucide="${a.tipo === 'link' ? 'link' : 'file-text'}" class="w-3.5 h-3.5 shrink-0 text-blue-500"></i>
        <div class="min-w-0">
          <p class="text-[11px] font-bold text-slate-700 dark:text-white truncate">${a.nome}</p>
          ${a.url ? `<p class="text-[10px] text-slate-400 truncate">${a.url}</p>` : ''}
        </div>
      </div>
      <button onclick="removeArtefato('${etapa}', '${a.id}')" class="text-slate-300 hover:text-red-400 transition-colors shrink-0">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `).join('');

  try { lucide.createIcons(); } catch(e) {}
}

// ── Auditoria declarada: Design System / Acessibilidade ─────────
function setAuditStatus(dimensao, status) {
  if (!amuxData.auditoria[dimensao]) return;
  amuxData.auditoria[dimensao].status = status;
  renderAuditStatus();
  _renderAuditToggle(dimensao);
  saveState();
}

function _renderAuditToggle(dimensao) {
  const status = amuxData.auditoria[dimensao]?.status || 'pendente';
  document.querySelectorAll(`[data-audit-toggle="${dimensao}"]`).forEach(btn => {
    const active = btn.dataset.auditValue === status;
    btn.className = `flex-1 py-2 text-[11px] font-bold rounded-xl transition-all ${
      active
        ? (status === 'conforme' ? 'bg-emerald-600 text-white' : status === 'com-desvios' ? 'bg-amber-500 text-white' : 'bg-slate-400 text-white')
        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-dark-muted hover:bg-slate-200'
    }`;
  });
}

function saveAuditObservacoes(dimensao) {
  const el = document.getElementById('audit-obs-' + dimensao);
  if (!el || !amuxData.auditoria[dimensao]) return;
  amuxData.auditoria[dimensao].observacoes = el.value.trim();
  saveState();
}

function initAuditView() {
  ['designSystem', 'acessibilidade'].forEach(dim => {
    _renderAuditToggle(dim);
    const obsEl = document.getElementById('audit-obs-' + dim);
    if (obsEl) obsEl.value = amuxData.auditoria[dim]?.observacoes || '';
  });
}

Object.assign(window, {
  navigateToAudit, selectEtapa, saveEtapaObservacoes,
  addArtefato, removeArtefato, renderArtefatos,
  setAuditStatus, saveAuditObservacoes, initAuditView
});
