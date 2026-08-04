// ============================================================
// evidence-bridge.js — Ponte Frameworks ↔ Auditoria (AMUX)
// Ao escanear o canvas, frameworks com auditStage conhecido e
// campos preenchidos viram evidência automaticamente na etapa
// correspondente da Auditoria — o scan É a fonte de evidência,
// não uma sugestão à parte. Isso é o que alimenta o checklist
// de maturidade e o Score: o que está de fato construído no
// canvas conta como evidência real do projeto.
// ============================================================

let _lastSyncSummary = [];

// designSystem/acessibilidade vivem em amuxData.auditoria (schema
// { status, observacoes, desvios }), diferente das 4 etapas de UX +
// pós-lançamento que vivem em amuxData.evidencias (schema
// { artefatos: [], observacoes }) — a sincronização precisa tratar
// os dois formatos.
const AMUX_AUDIT_DIMENSIONS = ['designSystem', 'acessibilidade'];

function _findEvidenceIndex(etapa, instanceId) {
  const artefatos = amuxData.evidencias[etapa]?.artefatos || [];
  return artefatos.findIndex(a => a.origemInstanceId === instanceId);
}

function _syncArtefatoEtapa(etapa, inst) {
  const artefato = {
    id: _generateId(),
    nome: inst.frameName || inst.frameworkName,
    tipo: 'framework',
    url: '',
    anexadoEm: new Date().toISOString(),
    metadados: {},
    origem: 'framework',
    origemFrameworkId: inst.frameworkId,
    origemInstanceId: inst.instanceId
  };

  const idx = _findEvidenceIndex(etapa, inst.instanceId);
  if (idx >= 0) {
    const existente = amuxData.evidencias[etapa].artefatos[idx];
    amuxData.evidencias[etapa].artefatos[idx] = { ...existente, ...artefato, id: existente.id, anexadoEm: existente.anexadoEm };
    return true;
  }
  amuxData.evidencias[etapa].artefatos.push(artefato);
  return false;
}

function _syncAuditoriaDimensao(dimensao, inst) {
  const dim = amuxData.auditoria[dimensao];
  const jaRegistrado = dim.observacoes.includes(`[${inst.instanceId}]`);
  if (dim.status === 'pendente') dim.status = 'conforme';
  const linha = `[${inst.instanceId}] ${inst.frameName || inst.frameworkName} — ${inst.fieldCount} campo(s), sincronizado do canvas em ${new Date(inst.scannedAt).toLocaleDateString('pt-BR')}.`;
  if (jaRegistrado) {
    dim.observacoes = dim.observacoes.replace(new RegExp(`\\[${inst.instanceId}\\][^\n]*`), linha);
  } else {
    dim.observacoes = dim.observacoes ? `${dim.observacoes}\n${linha}` : linha;
  }
  return jaRegistrado;
}

// Sincroniza os resultados de um scan com a Auditoria: cada framework
// escaneado com auditStage definido e ao menos 1 campo preenchido vira
// (ou atualiza, se já existir) evidência automaticamente — o scan É a
// fonte de evidência, não uma sugestão à parte. Frameworks sem
// auditStage ou sem conteúdo não entram — canvas vazio não é evidência.
function syncEvidenceFromScan(scanResults) {
  const synced = [];
  const etapasTocadas = new Set();
  const dimensoesTocadas = new Set();

  scanResults.forEach(inst => {
    const fw = AMUX_FRAMEWORKS.find(f => f.id === inst.frameworkId);
    const etapa = fw?.auditStage;
    if (!etapa) return;
    if (inst.fieldCount === 0) return;

    let updated;
    if (AMUX_AUDIT_DIMENSIONS.includes(etapa)) {
      if (!amuxData.auditoria[etapa]) return;
      updated = _syncAuditoriaDimensao(etapa, inst);
      dimensoesTocadas.add(etapa);
    } else {
      if (!amuxData.evidencias[etapa]) return;
      updated = _syncArtefatoEtapa(etapa, inst);
      etapasTocadas.add(etapa);
    }

    synced.push({ id: inst.instanceId, etapa, frameworkName: inst.frameworkName, frameName: inst.frameName, fieldCount: inst.fieldCount, updated });
  });

  if (synced.length > 0) {
    saveState();
    updateHomeBadges();
    if (typeof renderArtefatos === 'function') {
      etapasTocadas.forEach(etapa => renderArtefatos(etapa));
    }
    if (dimensoesTocadas.size > 0 && typeof renderAuditStatus === 'function') {
      renderAuditStatus();
      dimensoesTocadas.forEach(dim => { if (typeof _renderAuditToggle === 'function') _renderAuditToggle(dim); });
    }
  }

  _lastSyncSummary = synced;
  renderEvidenceSyncSummary();
  return synced;
}

function dismissSyncItem(id) {
  _lastSyncSummary = _lastSyncSummary.filter(s => s.id !== id);
  renderEvidenceSyncSummary();
}

function dismissSyncSummary() {
  _lastSyncSummary = [];
  renderEvidenceSyncSummary();
}

function renderEvidenceSyncSummary() {
  const container = document.getElementById('evidence-suggestions');
  if (!container) return;

  if (_lastSyncSummary.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <p class="text-[10px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wide">Evidências sincronizadas do canvas (${_lastSyncSummary.length})</p>
      <button onclick="dismissSyncSummary()" class="text-slate-300 hover:text-slate-500 dark:hover:text-dark-muted transition-colors shrink-0" aria-label="Fechar resumo">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    </div>
    <div class="space-y-2 mb-4">
      ${_lastSyncSummary.map(s => `
        <div class="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <i data-lucide="${s.updated ? 'refresh-cw' : 'check-circle-2'}" class="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400"></i>
          <p class="text-[11px] text-slate-600 dark:text-dark-muted leading-snug flex-1">
            <span class="font-bold text-slate-800 dark:text-white">${s.frameworkName}</span>
            ${s.updated ? 'atualizado como' : 'anexado como'} evidência de
            <span class="font-bold text-emerald-600 dark:text-emerald-400">${AMUX_ETAPA_LABELS[s.etapa]}</span>
            (${s.fieldCount} campo(s) preenchidos)
          </p>
          <button onclick="dismissSyncItem('${s.id}')" class="text-emerald-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shrink-0" aria-label="Fechar item">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `).join('')}
    </div>`;

  try { lucide.createIcons(); } catch(e) {}
}

// Sincroniza um Teste de Usabilidade concluído com evidencias.validacao
// — mesmo princípio dos frameworks (o dado real vivo em outro módulo é
// a fonte de evidência, não uma cópia manual), mas aqui o artefato
// carrega métricas agregadas (participantes, taxa de sucesso) em vez de
// apenas fieldCount, porque um teste de usabilidade produz muito mais
// contexto do que um framework escaneado.
function syncUsabilityTestToEvidence(test) {
  if (!amuxData.evidencias.validacao) return false;
  const m = typeof _testMetrics === 'function' ? _testMetrics(test) : { taxaSucessoGeral: 0 };
  const artefato = {
    id: _generateId(),
    nome: test.nome,
    tipo: 'Teste de usabilidade moderado',
    url: '',
    anexadoEm: new Date().toISOString(),
    metadados: {
      qtdUsuariosTestados: String(test.sessoes.length),
      metricaColetada: `Taxa de sucesso geral: ${m.taxaSucessoGeral}% · ${test.achados.length} achado(s)`,
      dataRealizacao: (test.sessoes[test.sessoes.length - 1]?.dataRealizacao || '').slice(0, 10)
    },
    origem: 'usability-test',
    origemFrameworkId: '',
    origemInstanceId: test.id
  };

  const artefatos = amuxData.evidencias.validacao.artefatos;
  const idx = artefatos.findIndex(a => a.origemInstanceId === test.id);
  if (idx >= 0) {
    artefatos[idx] = { ...artefatos[idx], ...artefato, id: artefatos[idx].id, anexadoEm: artefatos[idx].anexadoEm };
  } else {
    artefatos.push(artefato);
  }
  saveState();
  if (typeof renderArtefatos === 'function') renderArtefatos('validacao');
  updateHomeBadges();
  return true;
}

Object.assign(window, { syncEvidenceFromScan, renderEvidenceSyncSummary, dismissSyncItem, dismissSyncSummary, syncUsabilityTestToEvidence });
