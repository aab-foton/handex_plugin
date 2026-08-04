// ============================================================
// core.js — Estado, navegação e persistência do AMUX
// ============================================================

const AMUX_VERSION = '1.0.0';
const AMUX_SCHEMA_VERSION = 5;
const AMUX_HISTORY_CAP = 24;

let amuxData = _defaultState();

function _defaultState() {
  return {
    _schemaVersion: AMUX_SCHEMA_VERSION,
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
      compartilhamento: '',
      // Campos absorvidos do antigo framework injetável "briefing" — o
      // Briefing deixou de existir como item do catálogo (é etapa
      // obrigatória, não opcional) e seus campos passaram a fazer parte
      // direta do card do plugin.
      inScope: '',
      maybeScope: '',
      outScope: '',
      dependencias: '',
      riscos: '',
      comunicacao: '',
      notas: ''
    },
    evidencias: {
      descoberta:     { artefatos: [], observacoes: '' },
      definicao:      { artefatos: [], observacoes: '' },
      ideacao:        { artefatos: [], observacoes: '' },
      validacao:      { artefatos: [], observacoes: '' },
      posLancamento:  { artefatos: [], observacoes: '' }
    },
    auditoria: {
      designSystem:   { status: 'pendente', observacoes: '', desvios: [] },
      acessibilidade: { status: 'pendente', observacoes: '', desvios: [] }
    },
    aiAnalysis: {
      status: 'idle',
      fonte: null,
      lastRunAt: null,
      lastErrorAt: null,
      agentResponses: {},
      scoreBreakdown: {},
      checklistResults: {}
    },
    score: {
      numeric: 0,
      stars: 0,
      computedAt: null
    },
    frameworks: [],
    // Teste de Usabilidade não é um framework (não desenha algo estático
    // no canvas) nem um artefato simples de evidência — é um processo com
    // fases próprias (planejar → rodar → coletar → analisar), múltiplas
    // sessões por teste e achados sintetizados ao final. Cada item de
    // `usabilityTests` é um estudo completo; ver módulo usability-test.js.
    usabilityTests: [],
    history: []
  };
}

// Migração aditiva de schema — nunca transforma dado existente,
// só preenche defaults para campos novos. Formatos desconhecidos
// (fora de 1–4) são descartados, como já era a regra para v1.
function _migrateState(raw) {
  if (raw._schemaVersion === AMUX_SCHEMA_VERSION) return raw;
  if (raw._schemaVersion === 1 || raw._schemaVersion === 2 || raw._schemaVersion === 3 || raw._schemaVersion === 4) {
    return {
      ...raw,
      history: raw.history || [],
      evidencias: {
        ...raw.evidencias,
        posLancamento: raw.evidencias?.posLancamento || { artefatos: [], observacoes: '' }
      },
      briefing: {
        ...raw.briefing,
        inScope: raw.briefing?.inScope || '',
        maybeScope: raw.briefing?.maybeScope || '',
        outScope: raw.briefing?.outScope || '',
        dependencias: raw.briefing?.dependencias || '',
        riscos: raw.briefing?.riscos || '',
        comunicacao: raw.briefing?.comunicacao || '',
        notas: raw.briefing?.notas || ''
      },
      usabilityTests: raw.usabilityTests || [],
      _schemaVersion: AMUX_SCHEMA_VERSION
    };
  }
  return null;
}

function _generateId() {
  return 'ax-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const AMUX_ETAPAS = ['descoberta', 'definicao', 'ideacao', 'validacao', 'posLancamento'];
const AMUX_ETAPA_LABELS = {
  descoberta:    'Descoberta',
  definicao:     'Definição',
  ideacao:       'Ideação',
  validacao:     'Validação',
  posLancamento: 'Pós-lançamento'
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
  _setText('b-nome-projeto', b.nomeProjeto || window.__amuxFileName || '—');
  _setText('b-data-inicio', _formatDateBR(amuxData.createdAt) || '—');
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
  _setVal('b-in-scope', b.inScope);
  _setVal('b-maybe-scope', b.maybeScope);
  _setVal('b-out-scope', b.outScope);
  _setVal('b-dependencias', b.dependencias);
  _setVal('b-riscos', b.riscos);
  _setVal('b-comunicacao', b.comunicacao);
  _setVal('b-notas', b.notas);

  renderFrameworkInstances();
  renderAuditStatus();
  renderScore();
  if (typeof _renderScoreProvenance === 'function') _renderScoreProvenance();
  if (typeof renderHistory === 'function') renderHistory();
  updateHomeBadges();
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.textContent = val;
}

// Formata uma data ISO 8601 (ex: amuxData.createdAt) como DD/MM/AAAA para
// exibição em campos somente-leitura. Retorna '' se a data for inválida
// ou ausente — quem chama decide o placeholder ('—').
function _formatDateBR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ── Briefing ──────────────────────────────────────────────────
function saveBriefing() {
  amuxData.briefing = {
    comunidade:        document.getElementById('b-comunidade')?.value?.trim() || '',
    produto:            document.getElementById('b-produto')?.value?.trim() || '',
    canal:              document.getElementById('b-canal')?.value?.trim() || '',
    sistemaSigla:       document.getElementById('b-sistema-sigla')?.value?.trim() || '',
    nomeProjeto:        window.__amuxFileName || '',
    dataInicio:         _formatDateBR(amuxData.createdAt) || '',
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
    compartilhamento:   document.getElementById('b-compartilhamento')?.value?.trim() || '',
    inScope:            document.getElementById('b-in-scope')?.value?.trim() || '',
    maybeScope:         document.getElementById('b-maybe-scope')?.value?.trim() || '',
    outScope:           document.getElementById('b-out-scope')?.value?.trim() || '',
    dependencias:       document.getElementById('b-dependencias')?.value?.trim() || '',
    riscos:             document.getElementById('b-riscos')?.value?.trim() || '',
    comunicacao:        document.getElementById('b-comunicacao')?.value?.trim() || '',
    notas:              document.getElementById('b-notas')?.value?.trim() || ''
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

// Monta o mapa de valores do Briefing no formato esperado pelos nós
// field/<id> do frame (mesmo dicionário usado tanto para popular um
// frame novo quanto para atualizar um já existente via fill-framework-fields).
function _buildBriefingFillValues() {
  const b = amuxData.briefing;
  return {
    'nome': b.nomeProjeto,
    'data-inicio': b.dataInicio,
    'context': b.visaoGeral,
    'objectives': b.objetivosNegocio,
    'actors': b.publicoAlvo,
    'stakeholders': b.stakeholders,
    'in_scope': b.inScope,
    'maybe_scope': b.maybeScope,
    'out_scope': b.outScope,
    'dependencies': b.dependencias,
    'risks': b.riscos,
    'deadline': b.tempo,
    'team_routine': b.rotina,
    'communication': b.comunicacao,
    'data_sharing': b.compartilhamento,
    'notes': b.notas
  };
}

// Insere o Briefing no canvas. O Briefing deixou de ser um item do
// catálogo de frameworks (é etapa obrigatória, não opcional) — o
// builder ainda existe internamente (canvas/builders/briefing.js) e é
// reaproveitado aqui, mas nunca aparece na lista de "inserir novo
// framework". Reutiliza o mecanismo já existente de injeção + o
// handler fill-framework-fields (o mesmo usado por "Editar campos")
// para popular o frame com os dados reais do card, em vez de inventar
// um caminho de injeção paralelo.
//
// Se já existe uma instância de briefing conhecida no canvas, clicar em
// "Inserir no Canvas" de novo não deve duplicar o frame por padrão — o
// usuário decide, via modal, entre atualizar a instância existente
// (fill-framework-fields direto, sem criar frame novo) ou gerar uma nova
// versão (inject-framework, como já funcionava antes desta mudança).
function injectBriefingIntoCanvas() {
  saveBriefing();
  const existing = (amuxData.frameworks || []).find(f => f.frameworkId === 'briefing');
  if (!existing) {
    _injectNewBriefingVersion();
    return;
  }
  const modal = document.getElementById('modal-briefing-sync');
  if (modal) modal.classList.remove('hidden');
}

function closeBriefingSyncModal() {
  const modal = document.getElementById('modal-briefing-sync');
  if (modal) modal.classList.add('hidden');
}

function confirmBriefingSync(mode) {
  closeBriefingSyncModal();
  if (mode === 'update') {
    const existing = (amuxData.frameworks || []).find(f => f.frameworkId === 'briefing');
    if (!existing) return;
    const values = _buildBriefingFillValues();
    parent.postMessage({ pluginMessage: { type: 'fill-framework-fields', instanceId: existing.instanceId, values } }, '*');
    showToast('Atualizando Briefing no canvas...', 'info');
    return;
  }
  _injectNewBriefingVersion();
}

function _injectNewBriefingVersion() {
  const briefingFramework = {
    id: 'briefing',
    name: 'Briefing Estruturado',
    category: 'Descoberta'
  };
  window.__amuxPendingBriefingFill = _buildBriefingFillValues();
  parent.postMessage({ pluginMessage: { type: 'inject-framework', framework: briefingFramework } }, '*');
  showToast('Inserindo Briefing no canvas...', 'info');
}

// ── Framework instances (herdado do Maturai UX) ─────────────────
function renderFrameworkInstances() {
  const container = document.getElementById('scanned-instances');
  if (!container) return;
  const allInstances = amuxData.frameworks || [];

  if (allInstances.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400 dark:text-dark-muted">
        <i data-lucide="scan-line" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
        <p class="text-[12px]">Nenhum framework escaneado ainda.</p>
        <p class="text-[11px] mt-1 opacity-70">Insira um framework no canvas e clique em Escanear.</p>
      </div>`;
    try { lucide.createIcons(); } catch(e) {}
    return;
  }

  const filterEl = document.getElementById('instance-filter');
  const query = (filterEl?.value || '').trim().toLowerCase();

  // Filtra mantendo o índice REAL em amuxData.frameworks — os botões de
  // ação (editar, ver no canvas, apagar...) usam esse índice para achar
  // a instância certa, então nunca reindexamos a lista filtrada.
  const entries = allInstances
    .map((inst, i) => ({ inst, i }))
    .filter(({ inst }) => {
      if (!query) return true;
      const fw = AMUX_FRAMEWORKS.find(f => f.id === inst.frameworkId);
      const haystack = [inst.frameName, fw?.name, fw?.category, inst.pageName].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400 dark:text-dark-muted">
        <i data-lucide="search-x" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
        <p class="text-[12px]">Nenhum framework encontrado para "${filterEl?.value || ''}".</p>
      </div>`;
    try { lucide.createIcons(); } catch(e) {}
    return;
  }

  container.innerHTML = entries.map(({ inst, i }) => {
    const fw = AMUX_FRAMEWORKS.find(f => f.id === inst.frameworkId);
    const fieldCount = Object.keys(inst.data || {}).filter(k => inst.data[k]).length;
    const totalFields = fw ? fw.fields.length : 0;
    return `
      <div class="bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl p-3.5 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <i data-lucide="${fw?.icon || 'file'}" class="w-4 h-4 shrink-0 ${fw?.color || 'text-slate-400'}"></i>
            <span class="font-bold text-[12px] text-slate-800 dark:text-white truncate">${inst.frameName || fw?.name || inst.frameworkId}</span>
            ${inst.version ? `<span class="px-1.5 py-0.5 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 text-[9px] font-extrabold rounded-full shrink-0">v${inst.version}</span>` : ''}
          </div>
          <span class="text-[10px] text-slate-400 shrink-0">${fieldCount}/${totalFields} campos</span>
        </div>
        <div class="flex flex-wrap gap-1">
          ${Object.entries(inst.data || {}).filter(([,v]) => v).slice(0, 3).map(([k, v]) =>
            `<span class="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[9px] font-bold rounded-full truncate max-w-[120px]">${v.slice(0, 40)}</span>`
          ).join('')}
          ${Object.values(inst.data || {}).filter(v => v).length > 3 ? `<span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 text-[9px] font-bold rounded-full">+${Object.values(inst.data).filter(v => v).length - 3}</span>` : ''}
        </div>
        <div class="flex items-center gap-1.5 text-[10px] text-slate-400">
          ${inst.pageName ? `<i data-lucide="file" class="w-3 h-3 shrink-0"></i><span class="truncate">${inst.pageName}</span><span class="opacity-50">·</span>` : ''}
          <span class="shrink-0">${inst.injectedAt ? `Criado em ${new Date(inst.injectedAt).toLocaleDateString('pt-BR')}` : `Escaneado em ${new Date(inst.scannedAt).toLocaleDateString('pt-BR')}`}</span>
        </div>
        <div class="flex flex-wrap gap-1.5 pt-1">
          <button onclick="openFillFrameworkModal(${i})" class="flex-1 min-w-[100px] py-1.5 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1">
            <i data-lucide="pencil" class="w-3 h-3"></i> Editar campos
          </button>
          <button onclick="focusFrameworkInstance(${i})" class="flex-1 min-w-[100px] py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1">
            <i data-lucide="crosshair" class="w-3 h-3"></i> Ver no canvas
          </button>
          <button onclick="newVersionOfFramework(${i})" class="flex-1 min-w-[100px] py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-dark-muted text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1">
            <i data-lucide="copy-plus" class="w-3 h-3"></i> Nova versão
          </button>
          <button onclick="deleteFrameworkInstance(${i})" class="flex-1 min-w-[100px] py-1.5 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1">
            <i data-lucide="trash-2" class="w-3 h-3"></i> Apagar do canvas
          </button>
        </div>
      </div>`;
  }).join('');

  try { lucide.createIcons(); } catch(e) {}
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

  const uxTestCount = (amuxData.usabilityTests || []).length;
  const uxTestBadge = document.getElementById('badge-usability-test');
  if (uxTestBadge) {
    uxTestBadge.textContent = uxTestCount;
    uxTestBadge.classList.toggle('hidden', uxTestCount === 0);
  }

  const hasScore = !!amuxData.score?.computedAt;
  const isMockScore = hasScore && amuxData.aiAnalysis?.fonte === 'mock';
  const scoreBadge = document.getElementById('badge-score');
  if (scoreBadge) scoreBadge.classList.toggle('hidden', !hasScore || isMockScore);
  const scoreMockBadge = document.getElementById('badge-score-mock');
  if (scoreMockBadge) scoreMockBadge.classList.toggle('hidden', !isMockScore);
  const exportWarning = document.getElementById('export-mock-warning');
  if (exportWarning) exportWarning.classList.toggle('hidden', !isMockScore);
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

// ── Modal de exportação (consolida os antigos 3 botões/atalhos) ────────
// A modal decide, em runtime, entre os dois caminhos de export já
// existentes e validados (exportAmuxData / exportAmuxDataFlat) — não
// introduz um terceiro formato, só concentra a escolha de formato,
// tabelas e tipo de arquivo em um único fluxo de UI.
function openExportModal() {
  const modal = document.getElementById('modal-export');
  if (!modal) return;
  const radioFull = document.getElementById('export-format-full');
  if (radioFull) radioFull.checked = true;
  AMUX_FLAT_TABLE_IDS.forEach(id => {
    const cb = document.getElementById(`export-table-${id}`);
    if (cb) cb.checked = true;
  });
  const fileTypeJson = document.getElementById('export-filetype-json');
  if (fileTypeJson) fileTypeJson.checked = true;
  modal.classList.remove('hidden');
  updateExportModalUI();
  try { lucide.createIcons(); } catch(e) {}
}

function closeExportModal() {
  const modal = document.getElementById('modal-export');
  if (modal) modal.classList.add('hidden');
}

// Mostra/esconde o bloco de tabelas e tipo de arquivo conforme o formato
// escolhido — "Completo" é sempre um único JSON aninhado inteiro, sem
// filtro de tabela (não existe "tabela" nesse formato).
function updateExportModalUI() {
  const isFlat = document.getElementById('export-format-flat')?.checked;
  const flatOptions = document.getElementById('export-flat-options');
  if (flatOptions) flatOptions.classList.toggle('hidden', !isFlat);
}

function runExport() {
  const isFlat = document.getElementById('export-format-flat')?.checked;
  if (!isFlat) {
    exportAmuxData();
    closeExportModal();
    return;
  }
  const tables = AMUX_FLAT_TABLE_IDS.filter(id => document.getElementById(`export-table-${id}`)?.checked);
  const fileType = document.getElementById('export-filetype-csv')?.checked ? 'csv' : 'json';
  exportAmuxDataFlat(fileType, tables.length > 0 ? tables : AMUX_FLAT_TABLE_IDS);
  closeExportModal();
}

// ── Export achatado (Power BI) ───────────────────────────────────
// exportAmuxData() acima é o backup/integração fiel ao schema (JSON
// aninhado, 1:1 com amuxData) — ótimo para reimportar no plugin ou
// repassar a outro sistema que já entenda o schema do AMUX. Para
// consumo em Power BI (Get Data > JSON/CSV), aninhamento profundo é
// ruim: cada framework tem um conjunto de campos diferente, então uma
// coluna por campo exigiria prever de antemão todas as combinações
// possíveis dos 21 frameworks do catálogo. Em vez disso, exportamos em
// modelo "estrela" simples, já achatado:
//   instancias — 1 linha por instância de framework/briefing injetado
//   campos     — 1 linha por campo preenchido (chave-valor longo),
//                com instanceId como chave estrangeira para instancias
// Isso deixa o pivot/filtro por tipo de campo, framework ou etapa
// inteiramente a cargo do Power BI, sem o AMUX precisar prever colunas.
function _flattenBriefingAsInstance() {
  const b = amuxData.briefing || {};
  const labels = {
    comunidade: 'Comunidade', produto: 'Produto', canal: 'Canal',
    sistemaSigla: 'Sigla do sistema', nomeProjeto: 'Nome do projeto',
    dataInicio: 'Data de início', visaoGeral: 'Visão geral',
    objetivosNegocio: 'Objetivos de negócio', metaPesquisa: 'Meta de pesquisa',
    publicoAlvo: 'Público-alvo', necessidades: 'Necessidades',
    frustracoes: 'Frustrações', entregaveis: 'Entregáveis',
    stakeholders: 'Stakeholders', tempo: 'Prazo', rotina: 'Rotina da equipe',
    compartilhamento: 'Compartilhamento de dados', inScope: 'Dentro do escopo',
    maybeScope: 'Talvez no escopo', outScope: 'Fora do escopo',
    dependencias: 'Dependências', riscos: 'Riscos', comunicacao: 'Comunicação',
    notas: 'Notas'
  };
  const instance = {
    instanceId: 'briefing',
    frameworkId: 'briefing',
    frameworkName: 'Briefing Estruturado',
    category: 'Briefing',
    pageName: '',
    version: null,
    createdAt: amuxData.createdAt || null,
    scannedAt: null,
    fieldCount: Object.values(b).filter(v => v).length
  };
  const campos = Object.keys(labels).map(fieldId => ({
    instanceId: 'briefing',
    fieldId,
    fieldLabel: labels[fieldId],
    fieldValue: b[fieldId] || '',
    fieldType: fieldId === 'dataInicio' ? 'date' : 'text'
  }));
  return { instance, campos };
}

function _flattenFrameworkInstances() {
  const instancias = [];
  const campos = [];
  (amuxData.frameworks || []).forEach(inst => {
    const fw = (typeof AMUX_FRAMEWORKS !== 'undefined' ? AMUX_FRAMEWORKS : []).find(f => f.id === inst.frameworkId);
    const fieldCount = Object.values(inst.data || {}).filter(v => v).length;
    instancias.push({
      instanceId: inst.instanceId,
      frameworkId: inst.frameworkId,
      frameworkName: inst.frameName || fw?.name || inst.frameworkId,
      category: fw?.category || '',
      pageName: inst.pageName || '',
      version: inst.version || null,
      createdAt: inst.injectedAt || null,
      scannedAt: inst.scannedAt || null,
      fieldCount
    });

    // Cobrimos os campos pelo catálogo (fw.fields) quando disponível, para
    // que todo campo apareça no export mesmo sem valor salvo ainda (inclui
    // campos "scale", preenchíveis via frameworks.js) — e caímos de volta
    // em Object.keys(inst.data) só se o framework não for mais encontrado
    // no catálogo (ex.: catálogo mudou de versão), pra não perder dado.
    const fieldDefs = fw?.fields || Object.keys(inst.data || {}).map(id => ({ id, label: id, type: 'text' }));
    fieldDefs.forEach(field => {
      campos.push({
        instanceId: inst.instanceId,
        fieldId: field.id,
        fieldLabel: field.label || field.id,
        fieldValue: (inst.data || {})[field.id] || '',
        fieldType: field.type || 'text'
      });
    });
  });
  return { instancias, campos };
}

// Achata amuxData.evidencias em 1 linha por artefato + 1 linha (opcional)
// por observação de etapa. Forma real de cada item de `artefatos[]`
// confirmada em modules/audit.js (addArtefato) e modules/evidence-bridge.js
// (_syncArtefatoEtapa) — sempre objeto, nunca string solta:
//   { id, nome, tipo, url, anexadoEm, metadados: {},
//     origem?, origemFrameworkId?, origemInstanceId? }
// `origem`/`origemFrameworkId`/`origemInstanceId` só existem quando o
// artefato foi sincronizado automaticamente do canvas (evidence-bridge.js);
// artefatos cadastrados manualmente pelo formulário de auditoria não têm
// essas 3 chaves — por isso os campos de origem abaixo saem vazios/`null`
// nesse caso, não ausentes da linha (mantém a tabela com colunas estáveis).
function _flattenEvidencias() {
  const linhas = [];
  AMUX_ETAPAS.forEach(etapa => {
    const bloco = amuxData.evidencias?.[etapa] || { artefatos: [], observacoes: '' };
    const artefatos = Array.isArray(bloco.artefatos) ? bloco.artefatos : [];

    // 1 linha por artefato registrado na etapa (referência/link, nunca
    // upload binário — ver _defaultState(): `evidencias.<etapa>.artefatos[]`).
    artefatos.forEach(artefato => {
      linhas.push({
        etapa,
        etapaLabel: AMUX_ETAPA_LABELS[etapa] || etapa,
        tipoRegistro: 'artefato',
        artefatoId: artefato?.id || '',
        artefatoNome: artefato?.nome || '',
        artefatoTipo: artefato?.tipo || '',
        artefatoUrl: artefato?.url || '',
        artefatoAnexadoEm: artefato?.anexadoEm || null,
        artefatoOrigem: artefato?.origem || '',
        artefatoOrigemFrameworkId: artefato?.origemFrameworkId || '',
        artefatoOrigemInstanceId: artefato?.origemInstanceId || '',
        observacoes: ''
      });
    });

    // 1 linha para a observação da etapa (só se houver texto) — é um campo
    // único de texto livre por etapa (`evidencias.<etapa>.observacoes`), não
    // uma lista, então no máximo 1 linha por etapa com
    // `tipoRegistro = 'observacao'`. Fica na mesma tabela (em vez de uma
    // tabela à parte) porque ambos os registros (artefato e observação)
    // compartilham a mesma chave de agrupamento (`etapa`) e o Power BI
    // filtra por `tipoRegistro` sem custo adicional.
    if (bloco.observacoes && String(bloco.observacoes).trim()) {
      linhas.push({
        etapa,
        etapaLabel: AMUX_ETAPA_LABELS[etapa] || etapa,
        tipoRegistro: 'observacao',
        artefatoId: '',
        artefatoNome: '',
        artefatoTipo: '',
        artefatoUrl: '',
        artefatoAnexadoEm: null,
        artefatoOrigem: '',
        artefatoOrigemFrameworkId: '',
        artefatoOrigemInstanceId: '',
        observacoes: bloco.observacoes
      });
    }
  });
  return linhas;
}

// Rótulos de exibição das dimensões avaliadas pela IA. Reflete
// AMUX_AI_DIMENSIONS (src/plugin/ai/foundry-client.js) e dimLabels (usado em
// renderScoreBreakdown, modules/ai-client.js) — mantido em sincronia manual
// aqui porque o export roda no frontend e não importa o módulo do backend.
// Se uma dimensão nova for adicionada em ai/foundry-client.js, adicionar
// também aqui (e em ai-client.js) para o rótulo aparecer corretamente.
const AMUX_DIMENSAO_LABELS = {
  descoberta:     'Descoberta',
  definicao:      'Definição',
  ideacao:        'Ideação',
  validacao:      'Validação',
  posLancamento:  'Pós-lançamento',
  designSystem:   'Design System',
  acessibilidade: 'Acessibilidade'
};

// Achata amuxData.aiAnalysis em 1 linha por dimensão avaliada. Funciona com
// os dois formatos hoje possíveis de scoreBreakdown/agentResponses/
// checklistResults:
//   - mock atual (ai/foundry-client.js): todas as 7 dimensões sempre
//     presentes, checklistResults[dim] = [{ id, label, weight, passed }]
//   - Foundry real (ainda não implementado): contrato documentado no
//     cabeçalho de foundry-client.js é o mesmo formato de resposta — usamos
//     Object.keys(scoreBreakdown) como fonte da verdade de quais dimensões
//     existem (não uma lista fixa), para não quebrar se o Foundry real
//     retornar um subconjunto diferente de dimensões.
// Se a análise de IA nunca rodou (`aiAnalysis.scoreBreakdown` vazio), retorna
// lista vazia — não há nota nenhuma para expor.
function _flattenScoreBreakdown() {
  const ai = amuxData.aiAnalysis || {};
  const breakdown = ai.scoreBreakdown || {};
  const responses = ai.agentResponses || {};
  const checklist = ai.checklistResults || {};

  return Object.keys(breakdown).map(dimensao => {
    const items = Array.isArray(checklist[dimensao]) ? checklist[dimensao] : [];
    const totalItens = items.length;
    const itensAprovados = items.filter(i => i && i.passed).length;
    return {
      dimensao,
      dimensaoLabel: AMUX_DIMENSAO_LABELS[dimensao] || dimensao,
      nota: breakdown[dimensao] ?? null,
      comentario: responses[dimensao]?.comentario || '',
      fonte: ai.fonte || null,
      lastRunAt: ai.lastRunAt || null,
      checklistItensTotal: totalItens,
      checklistItensAprovados: itensAprovados
    };
  });
}

// Achata amuxData.usabilityTests em duas granularidades:
//   usabilityTests    — 1 linha por teste (agregado: nº participantes,
//                        taxa de sucesso geral, nº de achados)
//   usabilitySessions — 1 linha por (sessão × tarefa), o nível mais
//                        granular — permite ao Power BI cruzar taxa de
//                        sucesso por tarefa, por participante, por teste,
//                        sem o AMUX precisar prever esse cruzamento aqui.
// _testMetrics vem de modules/usability-test.js — mesmo padrão de reuso
// de _flattenFrameworkInstances (que depende de AMUX_FRAMEWORKS externo).
function _flattenUsabilityTests() {
  const tests = amuxData.usabilityTests || [];
  const usabilityTests = [];
  const usabilitySessions = [];

  tests.forEach(test => {
    const m = typeof _testMetrics === 'function' ? _testMetrics(test) : { taxaSucessoGeral: 0 };
    usabilityTests.push({
      testId: test.id,
      nome: test.nome,
      objetivo: test.objetivo || '',
      status: test.status,
      criadoEm: test.criadoEm || null,
      qtdTarefas: test.tarefas.length,
      qtdSessoes: test.sessoes.length,
      qtdAchados: test.achados.length,
      taxaSucessoGeral: m.taxaSucessoGeral
    });

    test.sessoes.forEach(sessao => {
      test.tarefas.forEach(tarefa => {
        const resultado = sessao.resultadosPorTarefa.find(r => r.tarefaId === tarefa.id);
        // passoAlcancadoId cru é um id interno (ou '_all') — resolvemos
        // para descrição legível aqui, já que o Power BI não teria como
        // relacionar com a lista de passos (que não é uma tabela própria).
        let passoAlcancadoDescricao = '';
        if (resultado?.passoAlcancadoId === '_all') passoAlcancadoDescricao = 'Concluiu todos os passos';
        else if (resultado?.passoAlcancadoId) {
          const passo = (tarefa.passos || []).find(p => p.id === resultado.passoAlcancadoId);
          if (passo) passoAlcancadoDescricao = passo.descricao;
        }
        usabilitySessions.push({
          testId: test.id,
          sessionId: sessao.id,
          participante: sessao.participante || '',
          dataRealizacao: sessao.dataRealizacao || null,
          tarefaId: tarefa.id,
          tarefaDescricao: tarefa.descricao,
          sucesso: resultado?.sucesso || '',
          passoAlcancadoDescricao,
          observacoes: resultado?.observacoes || ''
        });
      });
    });
  });

  return { usabilityTests, usabilitySessions };
}

function buildAmuxFlatExport() {
  const briefing = _flattenBriefingAsInstance();
  const frameworks = _flattenFrameworkInstances();
  const usabilidade = _flattenUsabilityTests();
  return {
    _plugin: 'AMUX',
    _version: AMUX_VERSION,
    _schemaVersion: AMUX_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projeto: {
      projectId: amuxData.projectId,
      nomeProjeto: amuxData.briefing?.nomeProjeto || '',
      createdAt: amuxData.createdAt || null,
      scoreNumeric: amuxData.score?.numeric ?? null,
      scoreStars: amuxData.score?.stars ?? null,
      scoreComputedAt: amuxData.score?.computedAt || null,
      scoreFonte: amuxData.aiAnalysis?.fonte || null,
      auditDesignSystemStatus: amuxData.auditoria?.designSystem?.status || 'pendente',
      auditAcessibilidadeStatus: amuxData.auditoria?.acessibilidade?.status || 'pendente'
    },
    instancias: [briefing.instance, ...frameworks.instancias],
    campos: [...briefing.campos, ...frameworks.campos],
    evidencias: _flattenEvidencias(),
    scoreBreakdown: _flattenScoreBreakdown(),
    usabilityTests: usabilidade.usabilityTests,
    usabilitySessions: usabilidade.usabilitySessions
  };
}

function _csvEscape(val) {
  const s = (val === null || val === undefined) ? '' : String(val);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function _toCSV(rows, columns) {
  const header = columns.join(';');
  const lines = rows.map(row => columns.map(c => _csvEscape(row[c])).join(';'));
  return [header, ...lines].join('\r\n');
}

function _downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Tabelas possíveis do export achatado e como cada uma é serializada em
// CSV (colunas fixas, na ordem em que devem aparecer no arquivo). "campos"
// e "instancias" andam juntas por padrão (uma referencia a outra via
// instanceId) mas cada uma é filtrável independentemente, pois o usuário
// pode querer só uma das duas tabelas.
const AMUX_FLAT_TABLES = {
  instancias: ['instanceId', 'frameworkId', 'frameworkName', 'category', 'pageName', 'version', 'createdAt', 'scannedAt', 'fieldCount'],
  campos: ['instanceId', 'fieldId', 'fieldLabel', 'fieldValue', 'fieldType'],
  evidencias: ['etapa', 'etapaLabel', 'tipoRegistro', 'artefatoId', 'artefatoNome', 'artefatoTipo', 'artefatoUrl', 'artefatoAnexadoEm', 'artefatoOrigem', 'artefatoOrigemFrameworkId', 'artefatoOrigemInstanceId', 'observacoes'],
  scoreBreakdown: ['dimensao', 'dimensaoLabel', 'nota', 'comentario', 'fonte', 'lastRunAt', 'checklistItensTotal', 'checklistItensAprovados'],
  usabilityTests: ['testId', 'nome', 'objetivo', 'status', 'criadoEm', 'qtdTarefas', 'qtdSessoes', 'qtdAchados', 'taxaSucessoGeral'],
  usabilitySessions: ['testId', 'sessionId', 'participante', 'dataRealizacao', 'tarefaId', 'tarefaDescricao', 'sucesso', 'passoAlcancadoDescricao', 'observacoes']
};
const AMUX_FLAT_TABLE_IDS = Object.keys(AMUX_FLAT_TABLES);

// Exportação achatada para Power BI. Formato escolhido: um único JSON
// com listas por tabela (instancias/campos/evidencias/scoreBreakdown) —
// mantém tudo em um arquivo, com tipos preservados (datas, números), e o
// Power Query do Power BI expande cada lista como uma tabela própria em
// "Get Data > JSON" sem passo extra de parsing. CSV fica como alternativa,
// útil se o usuário preferir importar direto em Excel antes do Power BI
// ou já tiver um fluxo de import CSV pronto — por isso mantemos os dois
// caminhos.
//
// `tables` filtra quais das 4 tabelas entram no export (JSON: só essas
// chaves aparecem no arquivo; CSV: só essas tabelas viram arquivo). Se
// omitido, inclui todas — mantém o comportamento anterior para quem já
// chama esta função sem o 2º argumento (ex.: console/testes).
function exportAmuxDataFlat(format = 'json', tables) {
  const selected = Array.isArray(tables) && tables.length > 0
    ? AMUX_FLAT_TABLE_IDS.filter(id => tables.includes(id))
    : AMUX_FLAT_TABLE_IDS;

  const full = buildAmuxFlatExport();
  const payload = {
    _plugin: full._plugin,
    _version: full._version,
    _schemaVersion: full._schemaVersion,
    exportedAt: full.exportedAt,
    projeto: full.projeto
  };
  selected.forEach(id => { payload[id] = full[id]; });

  const base = `amux-flat-${amuxData.briefing?.nomeProjeto || 'projeto'}-${Date.now()}`;

  if (format === 'csv') {
    selected.forEach(id => {
      const csv = _toCSV(payload[id] || [], AMUX_FLAT_TABLES[id]);
      const fileSlug = id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      _downloadBlob(csv, `${base}-${fileSlug}.csv`, 'text/csv;charset=utf-8');
    });
  } else {
    _downloadBlob(JSON.stringify(payload, null, 2), `${base}.json`, 'application/json');
  }

  showToast('Exportação para Power BI gerada.', 'success');
  return payload;
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
  navigate, saveBriefing, clearBriefing, injectBriefingIntoCanvas,
  closeBriefingSyncModal, confirmBriefingSync,
  exportAmuxData, exportAmuxDataFlat, buildAmuxFlatExport,
  openExportModal, closeExportModal, updateExportModalUI, runExport,
  showToast, toggleTheme, updateHomeBadges,
  handleScroll, scrollToTop,
  toggleCollapse, renderAuditStatus, renderScore
});
