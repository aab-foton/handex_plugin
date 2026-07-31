// ============================================================
// evidence-bridge.js — Ponte Frameworks ↔ Auditoria (AMUX)
// Depois de um scan de canvas, detecta frameworks com auditStage
// conhecido que ainda não viraram evidência formal na Auditoria,
// e oferece isso como SUGESTÃO confirmável pelo usuário — nunca
// anexa silenciosamente (evidência auto-anexada sem confirmação
// enfraqueceria a confiabilidade do que o score representa).
// ============================================================

let _evidenceSuggestions = [];

function _isAlreadyEvidence(etapa, instanceId) {
  const artefatos = amuxData.evidencias[etapa]?.artefatos || [];
  return artefatos.some(a => a.origemInstanceId === instanceId);
}

function collectEvidenceSuggestions(scanResults) {
  const novas = [];
  scanResults.forEach(inst => {
    const fw = AMUX_FRAMEWORKS.find(f => f.id === inst.frameworkId);
    const etapa = fw?.auditStage;
    if (!etapa || !amuxData.evidencias[etapa]) return;
    if (inst.fieldCount === 0) return; // framework vazio não é evidência
    if (_isAlreadyEvidence(etapa, inst.instanceId)) return;
    if (_evidenceSuggestions.some(s => s.instanceId === inst.instanceId)) return;
    novas.push({
      instanceId: inst.instanceId,
      frameworkId: inst.frameworkId,
      frameworkName: inst.frameworkName,
      frameName: inst.frameName,
      etapa,
      fieldCount: inst.fieldCount,
      scannedAt: inst.scannedAt
    });
  });
  if (novas.length === 0) return;
  _evidenceSuggestions = _evidenceSuggestions.concat(novas);
  renderEvidenceSuggestions();
}

function acceptEvidenceSuggestion(instanceId) {
  const idx = _evidenceSuggestions.findIndex(s => s.instanceId === instanceId);
  if (idx < 0) return;
  const s = _evidenceSuggestions[idx];
  amuxData.evidencias[s.etapa].artefatos.push({
    id: _generateId(),
    nome: s.frameName || s.frameworkName,
    tipo: 'framework',
    url: '',
    anexadoEm: new Date().toISOString(),
    metadados: {},
    origem: 'framework',
    origemFrameworkId: s.frameworkId,
    origemInstanceId: s.instanceId
  });
  _evidenceSuggestions.splice(idx, 1);
  saveState();
  updateHomeBadges();
  renderEvidenceSuggestions();
  showToast(`Anexado como evidência de ${AMUX_ETAPA_LABELS[s.etapa]}.`, 'success');
}

function dismissEvidenceSuggestion(instanceId) {
  _evidenceSuggestions = _evidenceSuggestions.filter(s => s.instanceId !== instanceId);
  renderEvidenceSuggestions();
}

function renderEvidenceSuggestions() {
  const container = document.getElementById('evidence-suggestions');
  if (!container) return;

  if (_evidenceSuggestions.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <p class="text-[10px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wide mb-2">Sugestões de evidência (${_evidenceSuggestions.length})</p>
    <div class="space-y-2 mb-4">
      ${_evidenceSuggestions.map(s => `
        <div class="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl px-3 py-2.5 space-y-1.5">
          <p class="text-[11px] text-slate-600 dark:text-dark-muted leading-snug">
            <span class="font-bold text-slate-800 dark:text-white">${s.frameworkName}</span>
            detectado com ${s.fieldCount} campo(s) preenchidos — anexar como evidência de
            <span class="font-bold text-indigo-600 dark:text-indigo-400">${AMUX_ETAPA_LABELS[s.etapa]}</span>?
          </p>
          <div class="flex flex-wrap gap-1.5">
            <button onclick="acceptEvidenceSuggestion('${s.instanceId}')" class="flex-1 min-w-[80px] py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors">Anexar</button>
            <button onclick="dismissEvidenceSuggestion('${s.instanceId}')" class="flex-1 min-w-[80px] py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 dark:text-dark-muted text-[10px] font-bold rounded-lg transition-colors">Descartar</button>
          </div>
        </div>
      `).join('')}
    </div>`;

  try { lucide.createIcons(); } catch(e) {}
}

Object.assign(window, {
  collectEvidenceSuggestions, acceptEvidenceSuggestion,
  dismissEvidenceSuggestion, renderEvidenceSuggestions
});
