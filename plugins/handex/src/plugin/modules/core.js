// --- SECURITY: escape user/canvas data before inserting into innerHTML ---
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// --- UX: contador "N/max" genérico para campos de texto livre com maxlength.
// Acha o <span id="{input.id}-count"> pelo id do próprio campo -- todo campo
// que usa esse padrão precisa de um id fixo e de um span irmão com esse
// sufixo. Reaproveitado por qualquer input/textarea de texto livre do
// plugin (não usar em campos de URL/busca, que ficam sem limite). ---
function _updateCharCount(input, max) {
  const counter = document.getElementById(`${input.id}-count`);
  if (counter) counter.textContent = `${input.value.length}/${max}`;
}
window._updateCharCount = _updateCharCount;

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

// ── Conformidade automática por item/propriedade (batimento contra o DSC) ──
// Complementa a declaração humana por frame (checkDone/semDesvios/observacoes,
// ver specifications.js) -- não a substitui. Cada item/propriedade já chega
// do scan (code.js) com isDS calculado (true/"warning"/false); aqui só
// agregamos esse dado para exibição. isDS é uma FOTO do momento do scan --
// não recalcula sozinho se o elemento mudar no Figma depois; precisa rodar
// "Atualizar escaneamento" de novo para refletir edições (ver
// _isFrameScanStale em specifications.js).
const AUDIT_LABEL = { ok: 'Em conformidade', warning: 'Necessita revisão', error: 'Fora do padrão' };

function computeItemAuditStatus(item) {
  if (!item) return 'error';
  if (item.isDS === true) return 'ok';
  if (item.isDS === 'warning') return 'warning';
  return 'error';
}

function getItemAuditBreakdown(item) {
  const props = (item && item.properties) || [];
  const out = { total: props.length, ok: 0, warning: 0, error: 0 };
  props.forEach(p => {
    if (p.isDS === true) out.ok++;
    else if (p.isDS === 'warning') out.warning++;
    else out.error++;
  });
  return out;
}

let handoffData = {
  _schemaVersion: 2,
  step1: {
    titulo: '',
    versao: 'v1.0',
    objetivo: '',
    status: 'rascunho',
    jornada: '',
    feature: '',
    equipe: [],
    _autoTeamAdded: false
  },
  step2: {
    briefingEnabled: true,
    regrasEnabled: true,
    linksEnabled: true,
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
    subtitle.className = 'text-[10px] text-slate-500 dark:text-dark-muted font-medium';
    subtitle.textContent = 'Pendente';
    return;
  }

  // Critério exigente: item sem token vinculado nunca é "conforme" por
  // omissão. Marcar "Sem desvios" sem justificar por escrito o que o scan
  // encontrou fora do padrão não move o status pra amarelo -- continua
  // vermelho até existir uma observação de fato explicando o desvio.
  const hasUnlinked = _computeFrameHasUnlinked(frame);
  const hasJustification = !!(frame.audit.observacoes && frame.audit.observacoes.trim());
  if (hasUnlinked && hasJustification) {
    subtitle.className = 'text-[10px] text-amber-500 font-medium';
    subtitle.textContent = 'Em revisão';
  } else if (hasUnlinked && !hasJustification) {
    subtitle.className = 'text-[10px] text-red-500 font-medium';
    subtitle.textContent = 'Não Conforme';
  } else if (frame.audit.semDesvios) {
    subtitle.className = 'text-[10px] text-green-600 font-medium';
    subtitle.textContent = 'Conforme';
  } else {
    subtitle.className = 'text-[10px] text-red-500 font-medium';
    subtitle.textContent = 'Não Conforme';
  }
  if (typeof _refreshConformanceAlert === 'function') _refreshConformanceAlert(frameId);

  // Campo de declaração dos desvios só é útil quando há algo a justificar —
  // reavalia dinamicamente a cada mudança de checkDone/semDesvios (a classe
  // inicial em renderFrameCard não se atualiza sozinha depois do render).
  const obsField = document.getElementById(`audit-obs-${frameId}`);
  if (obsField && typeof _shouldShowAuditObs === 'function') {
    const show = _shouldShowAuditObs(frame);
    obsField.classList.toggle('hidden', !show);
    const obsCountRow = document.getElementById(`audit-obs-${frameId}-count-row`);
    if (obsCountRow) obsCountRow.classList.toggle('hidden', !show);
  }
}

function setFrameCheckDone(frameId, checked) {
  const frame = getFrame(frameId);
  if (!frame) return;
  if (!frame.audit) frame.audit = {};
  frame.audit.checkDone = checked;
  const el = document.getElementById(`audit-result-${frameId}`);
  if (el) el.classList.toggle('hidden', !checked);
  _updateFrameAuditSubtitle(frameId);
  saveToStorage();
}

function setFrameSemDesvios(frameId, checked) {
  const frame = getFrame(frameId);
  if (!frame) return;
  if (!frame.audit) frame.audit = {};
  frame.audit.semDesvios = checked;

  // Ao declarar conformidade, captura snapshot dos itens pendentes como ressalvas.
  // Limpa ao desmarcar para que um novo scan redefina a lista.
  if (checked) {
    const _secDefs = [
      { key: 'components', label: 'Componente' },
      { key: 'icons',      label: 'Ícone'      },
      { key: 'typography', label: 'Tipografia' },
      { key: 'vectors',    label: 'Vetor'      }
    ];
    const _ressalvas = [];
    if (frame.specs) {
      _secDefs.forEach(sec => {
        (frame.specs[sec.key] || []).forEach(item => {
          if (item.isDS === false || item.isDS === 'warning') {
            _ressalvas.push({
              category: sec.key,
              label: sec.label,
              name: item.name || '(sem nome)',
              nodeId: item.nodeId || null,
              status: item.isDS === false ? 'error' : 'warning'
            });
          }
        });
      });
    }
    frame.audit.ressalvas = _ressalvas;
    const _declarante = handoffData.currentUser?.name
      || (handoffData.step1?.equipe || []).find(m => (m.papel || '').toLowerCase() === 'designer')?.nome
      || null;
    frame.audit.declaradoPor = _declarante;
    frame.audit.declaradoEm = new Date().toISOString();
  } else {
    frame.audit.ressalvas = [];
    frame.audit.declaradoPor = null;
    frame.audit.declaradoEm = null;
  }

  // Obs fica visível quando sem desvios=false OU há itens desvinculados do DSC
  const hasUnlinked = _computeFrameHasUnlinked(frame);
  const showObs = !checked || hasUnlinked;
  const el = document.getElementById(`audit-obs-${frameId}`);
  if (el) el.classList.toggle('hidden', !showObs);
  const obsCountRow = document.getElementById(`audit-obs-${frameId}-count-row`);
  if (obsCountRow) obsCountRow.classList.toggle('hidden', !showObs);
  _updateFrameAuditSubtitle(frameId);
  saveToStorage();
}

function setFrameAuditObs(frameId, value) {
  const frame = getFrame(frameId);
  if (!frame) return;
  if (!frame.audit) frame.audit = {};
  frame.audit.observacoes = value;
  // Debounced — sem isso, cada tecla digitada dispara save-storage completo
  // (serializa handoffData inteiro + _writeSharedPluginData percorre todos
  // os frames do projeto no backend), pesado em projetos com muitos frames.
  // _updateFrameAuditSubtitle no mesmo debounce: status (vermelho/amarelo)
  // depende de haver justificativa escrita ou não, ver ali.
  clearTimeout(setFrameAuditObs._t);
  setFrameAuditObs._t = setTimeout(() => {
    saveToStorage();
    _updateFrameAuditSubtitle(frameId);
  }, 600);
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
  collapseAllAccordions,
  toggleAllSpecsVisibility,
  exportSpecsToMd,
  toggleBriefingSection,
  toggleBriefingAxisAccordion,
  confirmBriefingAxisSelection,
  scrollToStep,
  scanFrame,
  openMeasureModal,
  openSpecFormModal,
  openFlowFormModal,
  addBriefingQuestion,
  addRegra,
  removeRegra,
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
  exportChecklistMd,
  exportChecklistJson,
  openDadosProjetoModal,
  ensureExpanded,
  setMeasureActiveFrame,
  exportHandoffMD,
  updateHandoffSummary,
  updateNewComponentObs,
  syncAndRenderSpecs,
  renderAllMeasurements,
  _computeFrameHasUnlinked,
  _updateFrameAuditSubtitle,
  setFrameCheckDone,
  setFrameSemDesvios,
  setFrameAuditObs,
  _restoreStep1Fields,
  applyImportedDataToCanvas,
  clearAllData,
  confirmClearAllData
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

// createdSpecs é um merge (avulsas + por-frame) recriado a cada resync — dar
// splice nele não remove a spec da fonte real quando ela pertence a um frame
// (frame.createdSpecs é um array próprio, não o mesmo array). Por isso a
// exclusão precisa remover pelo id em AMBAS as fontes possíveis antes de
// salvar, senão o item sobrevive em handoffData.frames[].createdSpecs e
// "ressuscita" no próximo syncAndRenderSpecs().
function removeSpecById(specId) {
  if (handoffData.specs && specId) {
    handoffData.specs = handoffData.specs.filter(s => s.id !== specId);
  }
  (handoffData.frames || []).forEach(frame => {
    if (frame.createdSpecs && specId) {
      frame.createdSpecs = frame.createdSpecs.filter(s => s.id !== specId);
    }
  });
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
  const btnTop = document.getElementById('btn-top');
  if (isCollapsed) {
    if (mainContent) mainContent.classList.add('hidden');
    if (collapseBtn) collapseBtn.innerHTML = '<i data-lucide="maximize-2" class="w-4 h-4" aria-hidden="true"></i>';
    if (btnTop) { btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10'); btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0'); }
  } else {
    if (mainContent) mainContent.classList.remove('hidden');
    if (collapseBtn) collapseBtn.innerHTML = '<i data-lucide="minimize-2" class="w-4 h-4" aria-hidden="true"></i>';
  }
  const _scale = window.currentUiScale || 1;
  const _collapsedH = Math.round(MINI_H * _scale);
  parent.postMessage({ pluginMessage: { type: 'resize-ui', width: FULL_W, height: isCollapsed ? _collapsedH : FULL_H } }, '*');
  _refreshIcons();
}

function ensureExpanded() {
  if (isCollapsed) toggleCollapse();
}

// ── Regras de Negócio (Step 2 global) ─────────────────────────────────
// Liga/desliga o card "Regras de Negócio e HUs" dentro do grupo Contexto de
// Negócio — vem ativado por padrão. Mesmo padrão de toggleBriefingSection
// (briefing.js) e toggleLinksSection, logo abaixo: desativado oculta o
// corpo, header com o toggle continua visível pra reativar.
function toggleRegrasSection(checked) {
  handoffData.step2.regrasEnabled = checked;
  const card = document.getElementById('regras-s2-card');
  if (card) card.classList.toggle('hidden', !checked);
  saveToStorage();
}
window.toggleRegrasSection = toggleRegrasSection;

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
      <button onclick="removeRegra('${id}')" title="Remover" class="text-gray-400 hover:text-red-500 transition-colors">
        <i data-lucide="trash-2" class="w-3 h-3"></i>
      </button>
    </div>
    <div class="space-y-2">
      <div>
        <input type="text" id="regra-titulo-${id}" maxlength="100" placeholder="Título da Regra/HU" class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none font-bold"
          onchange="updateRegraField('${id}','titulo',this.value)" oninput="_updateCharCount(this, 100)">
        <div class="flex items-center justify-end mt-0.5">
          <span id="regra-titulo-${id}-count" class="text-[9px] font-bold text-slate-400 dark:text-dark-muted">0/100</span>
        </div>
      </div>
      <div class="relative">
        <i data-lucide="link" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500"></i>
        <input type="text" placeholder="Link da HU/Regra (Jira, Confluence...)" class="w-full pl-7 pr-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none"
          onchange="updateRegraField('${id}','link',this.value)" onblur="validateUrl(this)">
      </div>
      <div>
        <textarea id="regra-notas-${id}" maxlength="400" placeholder="Descrição ou critérios de aceitação..." rows="2" class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none resize-none"
          onchange="updateRegraField('${id}','notas',this.value)" oninput="_updateCharCount(this, 400)"></textarea>
        <div class="flex items-center justify-end mt-0.5">
          <span id="regra-notas-${id}-count" class="text-[9px] font-bold text-slate-400 dark:text-dark-muted">0/400</span>
        </div>
      </div>
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

// ── Sub-accordion toggle ───────────────────────────────────────────────
function toggleSubAccordion(key) {
  const body = document.getElementById(`sub-body-${key}`);
  const chev = document.getElementById(`sub-chev-${key}`);
  if (!body) return;
  const isHidden = body.classList.toggle('hidden');
  if (chev) {
    chev.style.transform = isHidden ? '' : 'rotate(90deg)';
    chev.classList.toggle('text-[#005ca9]', !isHidden);
    chev.classList.toggle('dark:text-blue-300', !isHidden);
  }
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
  if (vincInput)   { vincInput.value   = ''; _updateCharCount(vincInput, 80); }
  if (anchorInput) anchorInput.value = '';
  if (obsCheck)    obsCheck.checked  = false;
  if (obsArea)     { obsArea.classList.add('hidden'); _updateCharCount(obsArea, 400); }
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
  const vinc   = (document.getElementById('exc-modal-vinc')?.value   || '').trim().slice(0, 80);
  const anchor = (document.getElementById('exc-modal-anchor')?.value || '').trim();
  const obsCheck = document.getElementById('exc-modal-has-obs');
  const obsArea  = document.getElementById('exc-modal-obs');
  const obs = (obsCheck && obsCheck.checked && obsArea) ? obsArea.value.trim().slice(0, 400) : '';

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
      // Card no canvas sempre reflete os cenários registrados -- distinto
      // da injeção opcional de um bloco [Obs] extra no frame da spec
      // (checkbox "injetar", abaixo), que é decisão do designer sobre o
      // que fica visível ali, não sobre a anotação de trabalho em si.
      if (createdSpecs[globalIdx].id) {
        parent.postMessage({ pluginMessage: {
          type: 'refresh-spec-card',
          nodeId: createdSpecs[globalIdx].id,
          excecoes: createdSpecs[globalIdx].excecoes
        }}, '*');
      }
      const injectCheck = document.getElementById('exc-modal-inject-spec');
      if (injectCheck && injectCheck.checked && obs && createdSpecs[globalIdx].id) {
        parent.postMessage({
          pluginMessage: {
            type: 'inject-obs-to-spec',
            specNodeId: createdSpecs[globalIdx].id,
            tipo: _currentExceptionType.tipo,
            titulo: vinc,
            obs
          }
        }, '*');
      }
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
  }
  // frame.excecoes (exceção no nível de FRAME, distinto de spec.excecoes)
  // era código morto -- addExcecaoForFrame dependia de `excecoes-list-${frameId}`,
  // elemento que nunca existiu em nenhuma view real. Removido: spec.excecoes
  // é o único conceito de exceção em uso de fato (ver branches acima).
  closeModal('exception-modal');
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
    audit: { checkDone: false, semDesvios: false, observacoes: '', ressalvas: [], declaradoPor: null, declaradoEm: null },
    newComponentObservations: '',
    specGroupNames: {},
    specGroupVisible: {},
    measurementsGroupVisible: true,
    measurements: [],
    nextMeasurementNumber: 1,
    createdSpecs: [],
    excecoes: []
  };
  handoffData.frames.push(frame);
  renderFrameCard(frame, true);
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
  // Oculta/exibe a seção de Conformidade DSC inteira
  const conformDiv = document.getElementById(`conformance-section-${frameId}`);
  if (conformDiv) conformDiv.classList.toggle('hidden', checked);
  _updateFrameAuditSubtitle(frameId);
}

function updateNewComponentObs(frameId, value) {
  const frame = getFrame(frameId);
  if (frame) { frame.newComponentObservations = value; saveToStorage(); }
}

function toggleFrameAccordion(frameId) {
  const body = document.getElementById(`frame-body-${frameId}`);
  const arrow = document.getElementById(`frame-chevron-${frameId}`);
  const header = document.getElementById(`frame-header-${frameId}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (arrow) {
    arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    arrow.classList.toggle('text-[#005ca9]', isHidden);
    arrow.classList.toggle('dark:text-blue-300', isHidden);
  }
  if (header) {
    header.setAttribute('aria-expanded', String(isHidden));
    const frame = typeof getFrame === 'function' ? getFrame(frameId) : null;
    const nome = frame && frame.nome ? frame.nome : '';
    header.setAttribute('aria-label', `${isHidden ? 'Recolher' : 'Expandir'} detalhes de ${nome}`);
    header.setAttribute('title', isHidden ? 'Recolher detalhes' : 'Expandir detalhes');
  }
  // Foco no canvas só ao expandir (clique explícito) — hover não move mais a
  // seleção/tela, isso ficava confuso passando o mouse pela lista.
  if (isHidden) {
    const frame = typeof getFrame === 'function' ? getFrame(frameId) : null;
    if (frame && frame.figmaId) focusNode(frame.figmaId);
  }
}

// Dica azul fixa ("Selecione um elemento e toque em +...") de cada view de
// lista (Escanear Tokens, Anotar Specs, Anotar Medidas, Fluxos de Tela) --
// não é o banner de onboarding "Primeira vez aqui?" (esse já é dispensável
// à parte). Essas dicas nascem sempre visíveis e hoje só reagiam a "lista
// vazia ou não" (reapareciam se o usuário apagasse tudo de novo). Passam a
// sumir de vez assim que a view tem conteúdo pela primeira vez -- o
// designer já aprendeu o fluxo, apagar tudo depois não deve trazer a dica
// de volta. Persistido em localStorage, mesmo padrão do tema/ordem da home,
// uma chave por view (hintId).
function _contentHintDismissed(hintId) {
  try { return localStorage.getItem(`handexHintDismissed_${hintId}`) === '1'; } catch (e) { return false; }
}
function _dismissContentHint(hintId) {
  try { localStorage.setItem(`handexHintDismissed_${hintId}`, '1'); } catch (e) { }
}
function _updateContentHint(hintId, hasContent) {
  if (hasContent) _dismissContentHint(hintId);
  const hint = document.getElementById(hintId);
  if (hint) hint.classList.toggle('hidden', hasContent || _contentHintDismissed(hintId));
}

function updateEmptyFramesState() {
  const empty = document.getElementById('frames-empty-state');
  if (!empty) return;
  const hasFrames = handoffData.frames.length > 0;
  empty.classList.toggle('hidden', hasFrames);
  const collapseBtn = document.querySelector('#view-frames [data-collapse-toggle]');
  if (collapseBtn) collapseBtn.classList.toggle('hidden', !hasFrames);
  const finalizeWrap = document.getElementById('btn-finalize-tokens-wrap');
  if (finalizeWrap) finalizeWrap.classList.toggle('hidden', !hasFrames);
  const sectionTitle = document.getElementById('frames-section-title');
  if (sectionTitle) {
    sectionTitle.classList.toggle('hidden', !hasFrames);
    if (hasFrames) sectionTitle.textContent = `Tokens Escaneados (${handoffData.frames.length})`;
  }
  _updateContentHint('frames-register-hint', hasFrames);
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
    const color = typeof getCategoryColor === 'function' ? getCategoryColor(sel.value) : '#004d8d';
    labelEl.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${color};margin-right:6px;vertical-align:middle;flex-shrink:0"></span>${escapeHtml(sel.text)}`;
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
    btn.classList.toggle('text-[#005ca9]',      active);
    btn.classList.toggle('font-bold',           active);
    // Remove active from inactive
    if (!active) {
      btn.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'text-[#005ca9]', 'font-bold');
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
      const color = typeof getCategoryColor === 'function' ? getCategoryColor(opt.value) : '#004d8d';
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
  'rascunho':        { label: 'Rascunho',        dot: 'bg-gray-400',  chipBg: 'bg-gray-100 dark:bg-slate-700',        chipText: 'text-slate-600 dark:text-dark-muted' },
  'em-revisao':      { label: 'Em Revisão',       dot: 'bg-amber-400', chipBg: 'bg-amber-50 dark:bg-amber-900/20',    chipText: 'text-amber-700 dark:text-amber-300' },
  'pronto-para-dev': { label: 'Pronto para Dev',  dot: 'bg-blue-500',  chipBg: 'bg-blue-50 dark:bg-blue-900/20',      chipText: 'text-blue-700 dark:text-blue-300' },
  'finalizado':      { label: 'Finalizado',       dot: 'bg-green-500', chipBg: 'bg-green-50 dark:bg-green-900/20',    chipText: 'text-green-700 dark:text-green-300' }
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
  if (chev)  {
    chev.style.transform = '';
    chev.classList.remove('text-[#005ca9]', 'dark:text-blue-300');
  }
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
    if (chev) {
      chev.style.transform = 'rotate(180deg)';
      chev.classList.add('text-[#005ca9]', 'dark:text-blue-300');
    }
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
function _hasValidTeamMember(equipe) {
  return (equipe || []).some(m => (m.nome || '').trim().length > 0);
}

function validateStep1() {
  const titulo = (document.getElementById('s1-titulo')?.value || '').trim().slice(0, STEP1_FIELD_MAX.titulo);
  handoffData.step1.titulo = titulo;
  clearTimeout(validateStep1._t);
  validateStep1._t = setTimeout(saveToStorage, 600);
  const equipe = handoffData.step1.equipe || [];
  const hasTeamMember = _hasValidTeamMember(equipe);
  const ok = titulo.length > 0 && hasTeamMember;

  const hint = document.getElementById('step1-validation-hint');
  if (hint) {
    if (!titulo) {
      hint.textContent = 'Preencha o título do projeto para avançar.';
      hint.classList.remove('hidden');
    } else if (!hasTeamMember) {
      hint.textContent = 'Adicione ao menos um membro da equipe com nome preenchido.';
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
          class="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-xl text-[11px] font-bold text-slate-700 dark:text-white cursor-pointer hover:border-gray-300 focus:ring-1 focus:ring-[#005ca9]/30 outline-none transition-all">
          <span data-cs-label>${papel}</span>
          <i data-lucide="chevron-down" data-cs-chev class="w-3 h-3 text-gray-500 dark:text-dark-muted transition-transform"></i>
        </button>
        <div data-cs-panel class="hidden absolute top-full left-0 mt-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg shadow-lg z-50 overflow-hidden py-1 min-w-[110px]">
          ${['Designer','DEV','PO','QA','Outro'].map(r => `<button type="button" onclick="_csSelect('cs-role-${id}','${r}')" data-cs-opt="${r}" class="w-full text-left px-3 py-2 text-[11px] text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors${papel === r ? ' bg-blue-50 dark:bg-blue-900/20 text-[#005ca9] font-bold' : ''}">${r}</button>`).join('')}
        </div>
      </div>
      <button onclick="removeTeamMember('${id}')" title="Remover membro" class="text-gray-400 hover:text-red-500 transition-colors">
        <i data-lucide="trash-2" class="w-3 h-3"></i>
      </button>
    </div>
    <div class="flex items-center gap-2">
      <input type="text" id="team-nome-${id}" maxlength="80" placeholder="Nome Completo" value="${nome}" class="flex-1 min-w-0 px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none"
        onchange="updateTeamMember('${id}','nome',this.value)" oninput="_updateCharCount(this, 80)" aria-label="Nome completo do membro da equipe">
      <input type="email" placeholder="Email Institucional" value="${email}" class="flex-1 min-w-0 px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none"
        onchange="updateTeamMember('${id}','email',this.value)" onblur="validateEmail(this);validateStep1()"
        aria-label="Email institucional do membro da equipe (opcional)" aria-describedby="email-hint-${id}" aria-invalid="false">
    </div>
    <div class="flex items-center justify-end mt-0.5">
      <span id="team-nome-${id}-count" class="text-[9px] font-bold text-slate-400 dark:text-dark-muted">${nome.length}/80</span>
    </div>
    <p id="email-hint-${id}" class="hidden text-[10px] text-red-500 dark:text-red-400 mt-1" role="alert"></p>
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

// ── Jornadas (agrupamento de fluxos) ────────────────────────────────────
// Uma "jornada" é um componente conexo do grafo formado por sourceId/
// targetId das conexões em handoffData.createdFlows — NUNCA um id de grupo
// persistido. Duas conexões pertencem à mesma jornada se compartilham
// algum nó do canvas (ex: A→B e B→C formam uma jornada só, porque ambas
// tocam o nó B). Recalculado a cada chamada, nunca guardado em cache — é a
// mesma decisão de projeto que já evitou bugs de dado duplicado em specs
// avulsas-vs-por-frame e contagem de medidas (ver saveSpecsToStorage/
// _mergeLooseAndFramed): agrupamento derivado nunca dessincroniza, porque
// não existe um segundo lugar guardando "quem pertence a quem".
//
// Função ÚNICA reaproveitada por renderFlowsList() (lista da UI),
// _buildAiContext() (design-data.js) e a Ficha de Handoff (handoff.js,
// markdown e HTML) — não duplicar esta lógica em nenhum desses lugares.
//
// journeyName é um campo opcional por conexão (redundante entre todos os
// membros do mesmo grupo, nunca usado para decidir o agrupamento em si) —
// só um rótulo de exibição. Grupos sem nenhum membro nomeado recebem
// "Jornada sem nome N", N sequencial só entre os grupos sem nome, na ordem
// em que aparecem em createdFlows (determinístico a cada render).
function computeFlowJourneys(flows) {
  const list = flows || handoffData.createdFlows || [];
  // Union-Find simples — id do nó (string) -> raiz do componente.
  const parent = {};
  const find = (x) => {
    if (!(x in parent)) parent[x] = x;
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  list.forEach(f => {
    if (f.sourceId) find(f.sourceId);
    if (f.targetId) find(f.targetId);
    if (f.sourceId && f.targetId) union(f.sourceId, f.targetId);
  });

  // Agrupa as conexões pela raiz do componente do sourceId (toda conexão
  // tem sourceId; targetId pode ser null para eventos de Início/Fim).
  const groupsByRoot = new Map();
  list.forEach(f => {
    if (!f.sourceId) return; // defensivo — não deveria existir sem sourceId
    const root = find(f.sourceId);
    if (!groupsByRoot.has(root)) groupsByRoot.set(root, []);
    groupsByRoot.get(root).push(f);
  });

  let unnamedCount = 0;
  const journeys = [];
  groupsByRoot.forEach(conexoes => {
    const namedMember = conexoes.find(f => f.journeyName && f.journeyName.trim());
    let nome;
    if (namedMember) {
      nome = namedMember.journeyName.trim();
    } else {
      unnamedCount++;
      nome = `Jornada sem nome ${unnamedCount}`;
    }
    journeys.push({ nome, isUnnamed: !namedMember, conexoes: _orderJourneyConexoes(conexoes) });
  });
  return journeys;
}

// Ordena as conexões de uma jornada pela POSIÇÃO REAL na cadeia (Início →
// sequência A→B→C → Fim), não pela ordem de inserção em createdFlows.
// Sem isso, o marcador de Início/Fim (criado depois do loop de conexões da
// cadeia, ver _moveFlowEndpointMarker em code.js) sempre aparecia no fim da
// lista mesmo quando logicamente é a primeira etapa da jornada. Eventos
// (f.type === 'event_start'/'event_end') não têm targetId — são ancorados
// pelo sourceId que aponta pro elemento de início/fim real da cadeia; a
// sequência entre eles é reconstruída seguindo sourceId→targetId como uma
// lista ligada.
function _orderJourneyConexoes(conexoes) {
  const startEvent = conexoes.find(f => f.type === 'event_start');
  const endEvent = conexoes.find(f => f.type === 'event_end');
  const sequence = conexoes.filter(f => f.type !== 'event_start' && f.type !== 'event_end');

  const bySource = new Map();
  sequence.forEach(f => { if (f.sourceId) bySource.set(f.sourceId, f); });
  const targetIds = new Set(sequence.map(f => f.targetId).filter(Boolean));
  let head = sequence.find(f => f.sourceId && !targetIds.has(f.sourceId)) || sequence[0];

  const ordered = [];
  const visited = new Set();
  let current = head;
  while (current && !visited.has(current)) {
    ordered.push(current);
    visited.add(current);
    current = current.targetId ? bySource.get(current.targetId) : null;
  }
  sequence.forEach(f => { if (!visited.has(f)) ordered.push(f); });

  const result = [];
  if (startEvent) result.push(startEvent);
  result.push(...ordered);
  if (endEvent) result.push(endEvent);
  return result;
}
window.computeFlowJourneys = computeFlowJourneys;

// ── Checklist exports ──────────────────────────────────────────────────
function _buildChecklistData() {
  const titulo = (handoffData.step1.titulo || '').trim();
  const equipe = handoffData.step1.equipe || [];
  const frames = handoffData.frames || [];
  const flows = handoffData.createdFlows || [];
  const briefingQs = handoffData.step2.briefingQuestions || [];
  const regras = handoffData.step2.regras || [];
  return { titulo, equipe, frames, flows, briefingQs, regras };
}

function exportChecklistMd() {
  const { titulo, equipe, frames, flows, briefingQs, regras } = _buildChecklistData();
  const ok = (b) => b ? '✅' : '❌';
  let md = `# Checklist do Handoff — ${titulo || 'Sem título'}\n\n`;
  md += `**Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n`;
  md += `## Configuração\n`;
  md += `- ${ok(!!titulo)} Título: ${titulo || '—'}\n`;
  const responsaveis = equipe.filter(m => (m.nome || '').trim().length > 0);
  md += `- ${ok(responsaveis.length > 0)} Equipe: ${equipe.length} membro(s)${responsaveis.length > 0 ? ` — ${responsaveis.map(m => m.email ? `${m.nome || m.papel} <${m.email}>` : (m.nome || m.papel)).join(', ')}` : ''}\n\n`;
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
  const { titulo, equipe, frames, flows, briefingQs, regras } = _buildChecklistData();
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
  const hasTeamMember = _hasValidTeamMember(equipe);
  const frames = handoffData.frames || [];
  const frameCount = frames.length;
  const flowCount = (handoffData.createdFlows || []).length;

  const regularFrames = frames.filter(f => !f.isNewComponent);
  const newComponentFrames = frames.filter(f => f.isNewComponent);
  const pendingConformance = regularFrames.filter(f => !f.audit || !f.audit.status);
  const allConformanceDeclared = regularFrames.length === 0 || pendingConformance.length === 0;

  const items = [
    { ok: !!titulo, label: titulo ? `Título: <strong>${titulo}</strong>` : 'Título do projeto não preenchido' },
    { ok: hasTeamMember, label: hasTeamMember ? `${equipe.length} ${equipe.length === 1 ? 'responsável' : 'responsáveis'} na equipe` : 'Nenhum membro da equipe cadastrado' },
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
  const allOk = !!titulo && hasTeamMember && frameCount > 0 && allConformanceDeclared;
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
      dot.classList.toggle("bg-[#005ca9]", i === currentStep);
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
    showToast('Preencha o título e ao menos um membro da equipe para avançar.');
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
        openModal('check-designs-modal');
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
    btnNext.classList.add("bg-[#005ca9]");
    btnNext.onclick = () => nextStep();
  }
  _refreshIcons();
}

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

const STEP1_FIELD_MAX = { titulo: 100, versao: 15, objetivo: 500, jornada: 80, feature: 80 };

// Liga/desliga o card "Links de Referência" dentro do grupo Contexto de
// Negócio — vem ativado por padrão. Mesmo padrão de toggleBriefingSection/
// toggleRegrasSection: desativado oculta o corpo (checkboxes de Protótipo/
// Handoff de Acessibilidade/Pesquisa de UX), header com o toggle continua
// visível pra reativar. Não apaga nenhum link já preenchido.
function toggleLinksSection(checked) {
  handoffData.step2.linksEnabled = checked;
  const card = document.getElementById('links-referencia-card');
  if (card) card.classList.toggle('hidden', !checked);
  saveToStorage();
}
window.toggleLinksSection = toggleLinksSection;

function updateData(step, key, value) {
  if (!handoffData[step]) handoffData[step] = {};
  if (step === 'step1' && typeof value === 'string' && STEP1_FIELD_MAX[key]) {
    value = value.slice(0, STEP1_FIELD_MAX[key]);
  }
  handoffData[step][key] = value;
  // Debounced — usada tanto em oninput (versão/jornada/feature/objetivo,
  // uma chamada por tecla) quanto em onchange (links, já infrequente); sem
  // isso, digitar dispara save-storage completo a cada tecla (ver
  // setFrameAuditObs, mesmo padrão de correção).
  clearTimeout(updateData._t);
  updateData._t = setTimeout(saveToStorage, 600);
}

function saveAndGoHome(check, msg) {
  saveToStorage();
  navigate('view-home');
  if (check) showToast(msg);
}
window.saveAndGoHome = saveAndGoHome;

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'bg-slate-800 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-2';
  const isError = type === 'error';
  // Container é aria-live="polite" por padrão; erro é mais urgente e
  // sobrescreve pra "assertive" no próprio toast (não interrompe o que o
  // leitor de tela está lendo, mas anuncia com prioridade maior que sucesso).
  if (isError) toast.setAttribute('aria-live', 'assertive');
  toast.innerHTML = isError
    ? `<i data-lucide="alert-circle" class="w-3.5 h-3.5 text-red-400"></i>`
    : `<i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-green-400"></i>`;
  const _tn = document.createTextNode(' ' + message);
  toast.appendChild(_tn);
  container.appendChild(toast);
  try { _refreshIcons(); } catch(e) {}
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
}

const FOCUSABLE_SELECTOR = 'input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';
const _modalReturnFocus = {};

// Figma Desktop (Electron) às vezes demora alguns segundos pra ceder foco
// de teclado à janela do plugin depois que ela abre/ganha destaque -- uma
// única chamada de .focus() logo na abertura do modal não tem efeito
// nenhum nesse intervalo (o clique/foco é aceito pelo DOM, mas o SO ainda
// não roteou input de teclado pra essa janela). Insiste em focar por até
// ~3s, parando assim que o foco realmente "pegar" (document.activeElement
// muda de verdade) -- não custa nada quando o foco já estava disponível
// de primeira (a 1ª tentativa já resolve e as seguintes são no-op).
//
// GUARDA CRÍTICA: para em cada tentativa se `target` deixou de estar
// visível (offsetParent null -- cobre tanto o próprio elemento quanto
// qualquer ancestral, ex: o modal, terem ganho `hidden`). Sem isso, fechar
// o modal ANTES do fim da janela de retentativa (ex: usuário clica
// "Cancelar" em menos de 3s) deixava o loop rodando sozinho, chamando
// .focus() num campo escondido -- isso rouba o foco de teclado de volta
// pro iframe do plugin repetidamente, mesmo com o usuário já de volta no
// canvas do Figma (sintoma: "Espaço não navega o canvas", sem nenhum
// modal aberto).
//
// offsetParent === null sozinho não cobre todo caso de fechamento: se o
// plugin inteiro for fechado (X do painel do Figma) enquanto o loop ainda
// está de pé, ou se o modal for fechado por um caminho que não passa por
// closeModal(), o alvo pode continuar tecnicamente visível e o loop nunca
// para -- reproduzindo o mesmo sintoma ("Espaço não navega") já na
// reabertura do plugin. Token de invalidação: cada nova chamada de
// _persistentFocus, e todo closeModal(), incrementam o token e assim
// matam qualquer loop anterior ainda em voo, sem depender só de
// offsetParent.
let _persistentFocusToken = 0;
function _persistentFocus(target, attempts = 15, intervalMs = 200) {
  if (!target) return;
  const token = ++_persistentFocusToken;
  let tries = 0;
  const tryFocus = () => {
    if (token !== _persistentFocusToken) return;
    if (target.offsetParent === null) return;
    tries++;
    target.focus();
    if (document.activeElement === target || tries >= attempts) return;
    setTimeout(tryFocus, intervalMs);
  };
  tryFocus();
}
window._persistentFocus = _persistentFocus;

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  _modalReturnFocus[id] = document.activeElement;
  el.classList.remove("hidden");
  updateFABVisibility(true);
  const focusTarget = el.querySelector(FOCUSABLE_SELECTOR);
  if (focusTarget) {
    _persistentFocus(focusTarget);
  } else {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    _persistentFocus(el);
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
  updateFABVisibility(false);
  // Mata qualquer loop de _persistentFocus ainda em voo -- inclusive de um
  // modal diferente do que está sendo fechado agora, já que o cenário
  // problemático é justamente um fechamento que não passou por aqui da
  // forma esperada (ver comentário de _persistentFocus).
  _persistentFocusToken++;
  const returnEl = _modalReturnFocus[id];
  if (returnEl && document.contains(returnEl)) returnEl.focus();
  delete _modalReturnFocus[id];
  // Desliga o listener de selectionchange do mini-mapa de ancoragem do
  // backend — ligado só em openFlowFormModal(), independente de por onde o
  // modal foi fechado (X, Cancelar, ou confirmar a conexão).
  if (id === 'flow-form-modal') {
    parent.postMessage({ pluginMessage: { type: 'track-flow-anchor-preview', active: false } }, '*');
  }
}

function _topmostVisibleModal() {
  const visibleModals = Array.from(document.querySelectorAll('[id$="-modal"]:not(.hidden)'));
  if (!visibleModals.length) return null;
  let topModal = visibleModals[0];
  let topZ = parseInt(getComputedStyle(topModal).zIndex, 10) || 0;
  for (const m of visibleModals) {
    const z = parseInt(getComputedStyle(m).zIndex, 10) || 0;
    if (z >= topZ) { topZ = z; topModal = m; }
  }
  return topModal;
}

// Alguns modais têm função de fechamento dedicada (ex: closeSpecFormModal,
// closeMeasureModal) que limpa estado extra além de esconder o modal -- não
// só closeModal(id) genérico. Escape chamava sempre o genérico, então fechar
// via teclado (em vez de clicar no X/botão Cancelar) podia deixar esse
// estado (ex: _pendingSpecPosition) pendurado pra próxima abertura. Acha o
// onclick real a partir do botão "Fechar"/"Fechar modal" do próprio modal
// (mesmo padrão usado em toda a UI) e o invoca; cai pro backdrop, depois
// pro closeModal(id) genérico se nenhum dos dois existir.
function _closeHandlerForModal(modalEl) {
  // .onclick (não getAttribute) pega a função já parseada pelo navegador a
  // partir do atributo inline -- evita reconstruir a string manualmente.
  const closeBtn = modalEl.querySelector('button[aria-label="Fechar"], button[aria-label="Fechar modal"]');
  if (closeBtn && typeof closeBtn.onclick === 'function') return () => closeBtn.onclick();
  const backdrop = modalEl.querySelector('.absolute.inset-0[onclick]');
  if (backdrop && typeof backdrop.onclick === 'function') return () => backdrop.onclick();
  return () => closeModal(modalEl.id);
}

// Fecha o modal visível com maior z-index ao pressionar Escape (topo em caso de sobreposição).
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  const topModal = _topmostVisibleModal();
  if (topModal) _closeHandlerForModal(topModal)();
});

// Focus trap: com o modal aberto, o Tab não tem mais nenhuma borda real do
// DOM pra parar -- ele sai do último campo do modal, atravessa o resto do
// body por trás (invisível, mas ainda dentro do iframe do plugin) e o
// usuário perde o teclado sem conseguir voltar pro canvas do Figma sem
// clicar nele manualmente (relatado como "trava"/"modo tab do leitor").
// Ciclagem: Tab no último focável volta pro primeiro; Shift+Tab no
// primeiro vai pro último.
//
// SÓ intercepta quando o foco JÁ ESTAVA dentro do modal antes do Tab --
// nunca força o foco de volta pra dentro. Um clique no canvas do Figma
// (fora do iframe do plugin) faz document.activeElement voltar pro <body>,
// que não está dentro do modal; sem essa condição, o trap "roubava" o
// primeiro Tab do usuário de volta pro modal mesmo quando a intenção
// óbvia era continuar interagindo com o canvas (clique fora = sinal de
// que quer o canvas, não o plugin -- recolher/expandir já cobre o caso
// de sair do plugin de propósito).
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Tab') return;
  const topModal = _topmostVisibleModal();
  if (!topModal) return;
  const active = document.activeElement;
  if (!topModal.contains(active)) return;
  const focusable = Array.from(topModal.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(el => el.offsetParent !== null && !el.disabled);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
});

// Clique no overlay (fora da caixa branca do modal) fecha o modal -- o
// próprio div "*-modal" é o overlay inteiro (fixed inset-0 bg-black/40), e
// a caixa de conteúdo é um filho dentro dele. Se e.target é o próprio
// overlay (não um filho), o clique não acertou nenhum elemento de
// conteúdo — o usuário clicou na área escura de propósito, o que
// normalmente significa "quero voltar pro canvas", não "não fiz nada".
document.addEventListener('click', function (e) {
  if (!e.target.matches || !e.target.matches('[id$="-modal"]')) return;
  if (e.target.classList.contains('hidden')) return;
  closeModal(e.target.id);
});

function startHandoff() {
  navigate("view-frames");
  restoreUIFromState();
  parent.postMessage({ pluginMessage: { type: 'get-project-name' } }, '*');
}

function openDadosProjetoModal() {
  navigate('view-dados-projeto');
}

function navigate(viewId) {
  // focusNode() (usado pelo ícone de foco em specs/medidas/fluxos) cria um
  // [HighlightStroke] persistente no canvas que só some com um clique
  // explícito subsequente — sem isso, o highlight ficava "preso" ao
  // navegar pra outra tela do plugin sem interagir de novo com o elemento.
  if (typeof clearHighlight === 'function') clearHighlight();
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  const targetView = document.getElementById(viewId);
  if (targetView) {
    // Reset scroll while still hidden — prevents any flash of stale scroll position
    targetView.scrollTop = 0;
    targetView.querySelectorAll('.overflow-y-auto').forEach(c => { c.scrollTop = 0; });
    targetView.classList.add("active");
  }
  const btnTop = document.getElementById('btn-top');
  if (btnTop) {
    btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
    btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
  }
  document.getElementById("header-home")?.classList.remove("hidden");
  if (viewId === 'view-specifications') {
    if (typeof _resetSpecsSearchInputs === 'function') _resetSpecsSearchInputs();
    syncAndRenderSpecs();
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
    parent.postMessage({ pluginMessage: { type: 'get-project-name' } }, '*');
    // Snackbar: se o conteúdo couber sem scroll, dispara após breve delay
    setTimeout(() => {
      const scrollEl = document.querySelector('#view-dados-projeto .overflow-y-auto');
      if (scrollEl && scrollEl.scrollHeight <= scrollEl.clientHeight) {
        _showDadosProjetoSnackbar();
      }
    }, 800);
  }
  if (viewId === 'view-handoff-summary') {
    updateHandoffSummary();
  }
  if (typeof maybeShowOnboardingBanner === 'function') {
    const onboardingKeyByView = {
      'view-home': 'home',
      'view-dados-projeto': 'dadosProjeto',
      'view-frames': 'handoff',
      'view-specifications': 'specs',
      'view-measurement': 'medidas',
      'view-flows': 'fluxos',
      'view-handoff-summary': 'handoffSummary'
    };
    const toolKey = onboardingKeyByView[viewId];
    if (toolKey) maybeShowOnboardingBanner(toolKey);
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
  if (target) {
    sel.value = target;
  } else if (frames.length === 1) {
    // Com um único frame mapeado não há escolha real a fazer — a única
    // opção sensata já vem selecionada, virando confirmação de estado em
    // vez de pergunta em aberto (evita specs/medidas caindo em "avulsa"
    // por esquecimento de trocar um dropdown com uma opção só).
    setMeasureActiveFrame(frames[0].id);
    return;
  }
  _updateFrameSelectorCopy();
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
  _updateFrameSelectorCopy();
}

// Ajusta rótulo/instrução/destaque do Frame Selector conforme o estado:
// - 1 frame mapeado: confirma "Documentando: <nome>" (decisão já tomada
//   automaticamente por populateFrameSelector, não pendente).
// - N frames, nenhum selecionado: destaca a borda — specs/medidas criadas
//   agora ficariam avulsas, uma decisão que afeta a estrutura da ficha
//   final e merece não passar despercebida.
// - N frames, um selecionado: texto padrão de seleção múltipla.
function _updateFrameSelectorCopy() {
  [
    { selectId: 'spec-frame-selector', labelId: 'spec-frame-selector-label', hintId: 'spec-frame-selector-hint', noun: 'spec' },
    { selectId: 'measure-frame-selector', labelId: 'measure-frame-selector-label', hintId: 'measure-frame-selector-hint', noun: 'medida' }
  ].forEach(({ selectId, labelId, hintId, noun }) => {
    const sel = document.getElementById(selectId);
    const label = document.getElementById(labelId);
    const hint = document.getElementById(hintId);
    if (!sel || !label || !hint) return;
    const frames = handoffData.frames || [];
    const selected = frames.find(f => f.id === sel.value);
    if (frames.length === 1 && selected) {
      label.textContent = 'Documentando';
      hint.textContent = `Focado em "${selected.nome || selected.id}" — toda nova ${noun} criada agora fica vinculada a este frame.`;
      sel.classList.remove('border-amber-400', 'dark:border-amber-500');
    } else {
      label.textContent = 'Frames Mapeados';
      hint.textContent = `Selecione um frame para focá-lo no canvas e associar esta ${noun} a ele.`;
      sel.classList.toggle('border-amber-400', frames.length > 0 && !selected);
      sel.classList.toggle('dark:border-amber-500', frames.length > 0 && !selected);
    }
  });
}

function updateHandoffSummary() {
  collectHandoffData();
  const frames  = handoffData.frames || [];
  const titulo  = handoffData.step1?.titulo || '—';
  const versao  = handoffData.step1?.versao || '—';
  const status  = handoffData.step1?.status || '—';
  const designer = (handoffData.step1?.equipe || []).find(m => (m.papel || '').toLowerCase() === 'designer');

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('hs-titulo', titulo);
  set('hs-versao', versao);
  set('hs-designer', designer?.nome || '—');

  const statusChip = document.getElementById('hs-status');
  const statusDot  = document.getElementById('hs-status-dot');
  const statusText = document.getElementById('hs-status-text');
  const statusCfg  = _STATUS_CONFIG[status] || null;
  if (statusChip) {
    statusChip.className = statusCfg
      ? `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${statusCfg.chipBg} ${statusCfg.chipText}`
      : 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 dark:bg-slate-700 text-slate-600 dark:text-dark-muted';
  }
  if (statusDot) statusDot.className = `w-1.5 h-1.5 rounded-full shrink-0 ${statusCfg ? statusCfg.dot : 'bg-gray-400'}`;
  if (statusText) statusText.textContent = statusCfg ? statusCfg.label : status;

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

// Junta a lista "avulsa" (handoffData.specs, nível superior — specs criadas
// sem activeFrameId) com as por-frame, deduplicando por id. saveSpecsToStorage()
// grava de volta em handoffData.specs o array global inteiro (avulsas + por-frame
// já resolvidas), então uma spec com frame pode aparecer nos dois lados na próxima
// leitura — sem dedup, ela dobraria de contagem a cada resync.
// IMPORTANTE: o merge é raso (.concat) de propósito — os objetos dentro do
// array resultante são as MESMAS referências de handoffData.specs/
// frame.createdSpecs, não clones. Qualquer código que mute um item de
// createdSpecs (ex: editar connectorStyle de uma spec) já muta o objeto
// original nos dois lados automaticamente. Se este merge for trocado por
// clonagem profunda no futuro, essa mutação por referência para de
// funcionar e a persistência de edições passa a falhar silenciosamente.
function _mergeLooseAndFramed(looseArr, framedArr) {
  const merged = (looseArr || []).concat(framedArr || []);
  const seen = new Set();
  const out = [];
  for (let i = merged.length - 1; i >= 0; i--) {
    const item = merged[i];
    const key = item && item.id ? item.id : Symbol();
    if (seen.has(key)) continue;
    seen.add(key);
    out.unshift(item);
  }
  return out;
}

// Sugere a próxima letra-base livre (A, B, C...) pra tag de uma nova spec,
// olhando TODAS as specs já existentes no frame. Regra deliberadamente
// simples: sempre a próxima letra-base do alfabeto ainda não usada, nunca
// tenta adivinhar sub-níveis (A1, B1.1) — o designer edita manualmente pra
// isso, mantendo o controle que já era decisão de produto (specs não são
// reordenadas/geradas automaticamente, só a letra inicial sugerida).
function _suggestNextSpecTag(frameId) {
  const frame = frameId ? getFrame(frameId) : null;
  const specs = frame
    ? [...(frame.createdSpecs || [])]
    : [...(handoffData.specs || [])];

  const usedBaseLetters = new Set();
  specs.forEach(s => {
    const raw = String((s && s.letter) || '').trim().toUpperCase();
    const match = raw.match(/^([A-Z]+)/);
    if (match) usedBaseLetters.add(match[1]);
  });

  // Sequência A, B, C... Z, AA, AB... — cobre o caso raro de >26 grupos.
  let i = 0;
  const toLetters = (n) => {
    let s = '';
    n += 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  let candidate = toLetters(i);
  while (usedBaseLetters.has(candidate)) {
    i++;
    candidate = toLetters(i);
  }
  return candidate;
}

function syncAndRenderSpecs() {
  // Specs "avulsas" (criadas sem activeFrameId, ex: nenhum frame
  // mapeado/selecionado no momento) só existem no nível superior de
  // handoffData.specs, não dentro de nenhum frame.* — precisam entrar aqui
  // junto com as por-frame, senão somem (accordion nunca persiste) na
  // primeira resync depois de criadas.
  createdSpecs = _mergeLooseAndFramed(handoffData.specs, (handoffData.frames || []).flatMap(f => f.createdSpecs || []));
  if (typeof renderSpecsList === 'function') renderSpecsList();
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

  // Accordions com nodeId (medidas) são exclusivos: abrir um fecha os irmãos,
  // mantendo só um item expandido/selecionado por vez na lista.
  if (nodeId && isHidden) {
    const list = btn.closest('ul, [data-accordion-list]');
    if (list) {
      list.querySelectorAll('[data-accordion-toggle]').forEach(otherBtn => {
        if (otherBtn === btn) return;
        const otherParent = otherBtn.closest('.border, .rounded-xl, .mb-3');
        const otherContent = otherParent ? otherParent.querySelector('.accordion-content, [data-accordion-content]') : null;
        if (otherContent && !otherContent.classList.contains('hidden')) {
          otherContent.classList.add('hidden');
          otherBtn.setAttribute('aria-expanded', 'false');
          const otherIcon = otherBtn.querySelector('[data-lucide="chevron-down"]');
          if (otherIcon) {
            otherIcon.style.transform = "rotate(0deg)";
            otherIcon.classList.remove('text-[#005ca9]', 'dark:text-blue-300');
          }
        }
      });
    }
  }

  content.classList.toggle("hidden");
  btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  if (icon) {
    icon.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
    icon.classList.toggle('text-[#005ca9]', isHidden);
    icon.classList.toggle('dark:text-blue-300', isHidden);
  }
  if (nodeId) {
    if (isHidden) {
      // Expandir seleciona e rola até o elemento, mas sem o retângulo de
      // destaque (HighlightStroke) — esse fica reservado só pro hover
      // (sendHighlight/clearHighlight), pra não persistir no canvas
      // enquanto o accordion estiver simplesmente aberto.
      parent.postMessage({ pluginMessage: { type: 'highlight-node', id: nodeId, highlight: false, shouldScroll: true } }, '*');
    } else {
      parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
    }
  }
}

function collapseAllAccordions(containerEl) {
  const root = containerEl || document;
  const allContent = root.querySelectorAll('.accordion-content, [data-accordion-content]');
  // Estado explícito lido do PRÓPRIO botão (texto = próxima ação), não
  // inferido pela mistura de conteúdo aberto/fechado -- alguns níveis
  // (ex: grupo de tag em Anotar Specs) nascem sempre abertos por padrão
  // enquanto outros (ex: item individual dentro do grupo) nascem sempre
  // fechados, então "existe algo aberto" nunca reflete de verdade "tudo
  // está aberto". Com estado explícito, "Expandir todos" sempre abre
  // literalmente todo nível de accordion dentro do container, e "Recolher
  // todos" sempre fecha todos, sem depender do que já estava em cada um.
  const toggleBtnEl = root.querySelector ? root.querySelector('[data-collapse-toggle]') : null;
  const shouldCollapse = !toggleBtnEl || toggleBtnEl.textContent.trim() === 'Recolher todos';
  allContent.forEach(c => {
    c.classList.toggle('hidden', shouldCollapse);
    // Frame body (id="frame-body-{id}") — rotate frame-chevron
    if (c.id && c.id.startsWith('frame-body-')) {
      const frameId = c.id.replace('frame-body-', '');
      const chevron = document.getElementById(`frame-chevron-${frameId}`);
      if (chevron) {
        chevron.style.transform = shouldCollapse ? 'rotate(180deg)' : 'rotate(0deg)';
        chevron.classList.toggle('text-[#005ca9]', !shouldCollapse);
        chevron.classList.toggle('dark:text-blue-300', !shouldCollapse);
      }
    } else if (c.matches('[data-accordion-content]') && c.previousElementSibling && c.previousElementSibling.querySelector('.journey-chevron')) {
      // Card de jornada de fluxo (renderFlowsList) — chevron próprio
      // (.journey-chevron), não usa toggleAccordion/aria-expanded.
      const chevron = c.previousElementSibling.querySelector('.journey-chevron');
      chevron.classList.toggle('rotate-180', shouldCollapse);
      chevron.classList.toggle('text-[#005ca9]', !shouldCollapse);
      chevron.classList.toggle('dark:text-blue-300', !shouldCollapse);
    } else if (c.matches('[data-accordion-content]') && c.previousElementSibling && c.previousElementSibling.querySelector('.group-chevron')) {
      // Grupo de tag em Anotar Specs (renderSpecsList) — chevron próprio
      // (.group-chevron), toggle feito via headerInfo.onclick, não
      // toggleAccordion/aria-expanded.
      const chevron = c.previousElementSibling.querySelector('.group-chevron');
      chevron.classList.toggle('rotate-180', shouldCollapse);
      chevron.classList.toggle('text-[#005ca9]', !shouldCollapse);
      chevron.classList.toggle('dark:text-blue-300', !shouldCollapse);
    } else if (c.id && document.getElementById('chev-' + c.id)) {
      // Item individual de spec (renderSpecsList/toggleSpecDetails) —
      // chevron com id="chev-{detailsId}", rotacionado via style.transform
      // inline (mesmo padrão de toggleSpecDetails), não classList/aria.
      const chevron = document.getElementById('chev-' + c.id);
      chevron.style.transform = shouldCollapse ? '' : 'rotate(180deg)';
      chevron.classList.toggle('text-[#005ca9]', !shouldCollapse);
      chevron.classList.toggle('dark:text-blue-300', !shouldCollapse);
    } else if (c.id && c.id.startsWith('sub-body-') && document.getElementById('sub-chev-' + c.id.replace('sub-body-', ''))) {
      // Sub-accordion aninhado dentro do card de frame (ex: Tokens
      // Escaneados, toggleSubAccordion em core.js) — chevron com
      // id="sub-chev-{key}", rotaciona 90deg (não 180) via style.transform
      // inline, mesmo padrão de toggleSubAccordion.
      const chevron = document.getElementById('sub-chev-' + c.id.replace('sub-body-', ''));
      chevron.style.transform = shouldCollapse ? '' : 'rotate(90deg)';
      chevron.classList.toggle('text-[#005ca9]', !shouldCollapse);
      chevron.classList.toggle('dark:text-blue-300', !shouldCollapse);
    } else {
      // Regular accordion — find toggle button
      const parent = c.closest('.border, .rounded-xl, .mb-3');
      const btn = parent ? parent.querySelector('[onclick*="toggleAccordion"]') : null;
      if (btn) {
        btn.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
        const icon = btn.querySelector('[data-lucide="chevron-down"]');
        if (icon) {
          icon.style.transform = shouldCollapse ? 'rotate(0deg)' : 'rotate(180deg)';
          icon.classList.toggle('text-[#005ca9]', !shouldCollapse);
          icon.classList.toggle('dark:text-blue-300', !shouldCollapse);
        }
      }
    }
  });
  // Texto do botão reflete a PRÓXIMA ação (não o estado atual) -- se acabou
  // de recolher tudo, a próxima ação passa a ser expandir, e vice-versa.
  // Label aberta em texto, sem ícone (ver views/*.html).
  if (toggleBtnEl) toggleBtnEl.textContent = shouldCollapse ? 'Expandir todos' : 'Recolher todos';
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
  if (!inputOrValue || !inputOrValue.value) {
    // Campo vazio: e-mail é opcional, não é erro — limpa qualquer estado de validação anterior.
    if (inputOrValue) {
      inputOrValue.classList.remove('border-red-500', 'ring-2', 'ring-red-100', 'border-green-500');
      inputOrValue.setAttribute('aria-invalid', 'false');
      const hintEl = inputOrValue.getAttribute('aria-describedby') && document.getElementById(inputOrValue.getAttribute('aria-describedby'));
      if (hintEl) { hintEl.textContent = ''; hintEl.classList.add('hidden'); }
    }
    return false;
  }
  const val = inputOrValue.value.trim();
  const valid = emailRegex.test(val);
  const hintId = inputOrValue.getAttribute('aria-describedby');
  const hintEl = hintId && document.getElementById(hintId);
  inputOrValue.classList.toggle('border-red-500', !valid);
  inputOrValue.classList.toggle('ring-2', !valid);
  inputOrValue.classList.toggle('ring-red-100', !valid);
  inputOrValue.setAttribute('aria-invalid', valid ? 'false' : 'true');
  if (hintEl) {
    if (valid) {
      hintEl.textContent = '';
      hintEl.classList.add('hidden');
    } else {
      hintEl.textContent = 'E-mail em formato inválido';
      hintEl.classList.remove('hidden');
    }
  }
  if (valid) {
    inputOrValue.classList.add('border-green-500');
    setTimeout(() => inputOrValue.classList.remove('border-green-500'), 2000);
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
    if (!isCollapsed && el.scrollTop > 100) {
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
    if (atBottom) _showDadosProjetoSnackbar();
  }
}

function _showDadosProjetoSnackbar() {
  const snack = document.getElementById('dados-projeto-snackbar');
  if (!snack || sessionStorage.getItem('handex_snack_dados_shown')) return;
  sessionStorage.setItem('handex_snack_dados_shown', '1');
  snack.classList.remove('hidden');
  if (typeof _refreshIcons === 'function') _refreshIcons();
  clearTimeout(window._dadosProjetoSnackTimer);
  window._dadosProjetoSnackTimer = setTimeout(() => {
    snack.classList.add('hidden');
  }, 5000);
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
  parent.postMessage({ pluginMessage: { type: 'highlight-node', id, highlight: true, shouldScroll: true, color: '#005ca9' } }, '*');
}

// Destaque transitório (retângulo HighlightStroke) pra qualquer lista que
// queira dar um preview do elemento no canvas ao passar o mouse — não
// seleciona nem rola a tela (isso fica reservado pra clique explícito), e
// some assim que o mouse sai (clearHighlight). Padrão reaproveitável por
// qualquer accordion/lista que precise desse preview (hoje: medidas).
function sendHighlight(figmaId) {
  if (figmaId) {
    parent.postMessage({ pluginMessage: { type: 'highlight-node', id: figmaId, highlight: true, shouldScroll: false, selectNode: false, color: '#005ca9' } }, '*');
  }
}
function clearHighlight() {
  parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
}

// ── Restauração leve no boot (só step1, sem renderizar frames/flows/specs) ──
function _restoreStep1Fields() {
  const fieldMax = { 's1-titulo': 100, 's1-versao': 15, 's1-objetivo': 500, 's1-jornada': 80, 's1-feature': 80 };
  const fields = ['s1-titulo', 's1-versao', 's1-objetivo', 's1-jornada', 's1-feature'];
  fields.forEach(id => {
    const key = id.replace('s1-', '');
    const el = document.getElementById(id);
    if (el) {
      el.value = handoffData.step1[key] || (key === 'versao' ? 'v1.0' : '');
      _updateCharCount(el, fieldMax[id]);
    }
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
  if (s1Titulo) { s1Titulo.value = handoffData.step1.titulo || ""; _updateCharCount(s1Titulo, 100); }
  _syncStatusUI(handoffData.step1.status || "rascunho");
  const s1Versao = document.getElementById("s1-versao");
  if (s1Versao) { s1Versao.value = handoffData.step1.versao || "v1.0"; _updateCharCount(s1Versao, 15); }
  const s1Objetivo = document.getElementById("s1-objetivo");
  if (s1Objetivo) { s1Objetivo.value = handoffData.step1.objetivo || ""; _updateCharCount(s1Objetivo, 500); }
  const s1Jornada = document.getElementById("s1-jornada");
  if (s1Jornada) { s1Jornada.value = handoffData.step1.jornada || ""; _updateCharCount(s1Jornada, 80); }
  const s1Feature = document.getElementById("s1-feature");
  if (s1Feature) { s1Feature.value = handoffData.step1.feature || ""; _updateCharCount(s1Feature, 80); }

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

  // Toggles do grupo Contexto de Negócio (Briefing/Regras/Links) — vêm
  // ativados por padrão; !== false trata handoffData de antes desse campo
  // existir (undefined) como ativado, não como desativado.
  [
    { key: 'briefingEnabled', chk: 'chk-briefing-enabled', card: 'briefing-card' },
    { key: 'regrasEnabled', chk: 'chk-regras-enabled', card: 'regras-s2-card' },
    { key: 'linksEnabled', chk: 'chk-links-enabled', card: 'links-referencia-card' }
  ].forEach(({ key, chk, card }) => {
    const enabled = handoffData.step2[key] !== false;
    const chkEl = document.getElementById(chk);
    const cardEl = document.getElementById(card);
    if (chkEl) chkEl.checked = enabled;
    if (cardEl) cardEl.classList.toggle('hidden', !enabled);
  });

  // Step 2 — Briefing (accordions por eixo + cards de pergunta dentro de cada um)
  // renderBriefingAxisAccordions definida em modules/briefing.js, não aqui —
  // escopo global compartilhado entre módulos (ver CLAUDE.md, arquitetura).
  renderBriefingAxisAccordions();
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
        if (titleInput) { titleInput.value = r.titulo || ''; _updateCharCount(titleInput, 100); }
        if (linkInput) linkInput.value = r.link || '';
        if (textarea) { textarea.value = r.notas || ''; _updateCharCount(textarea, 400); }
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
  // Throttle via rAF — mousemove bruto dispara dezenas de vezes/s, e cada
  // postMessage aqui aciona figma.ui.resize() (API nativa do host), bem
  // mais cara que um cálculo em JS puro. No máximo 1 resize por frame de
  // tela, sempre com a posição mais recente do cursor.
  let _resizeScheduled = false, _resizeX = 0, _resizeY = 0;
  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    _resizeX = e.clientX; _resizeY = e.clientY;
    if (_resizeScheduled) return;
    _resizeScheduled = true;
    requestAnimationFrame(() => {
      _resizeScheduled = false;
      parent.postMessage({ pluginMessage: { type: 'resize', width: Math.round(Math.max(300, startW + (_resizeX - startX))), height: Math.round(Math.max(300, startH + (_resizeY - startY))) } }, '*');
    });
  });
  window.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = 'default'; });
}

window.currentUiScale = 1;
function setUiScale(scale) {
  window.currentUiScale = scale;
  document.documentElement.style.setProperty('--ui-scale', scale);
  document.body.classList.toggle('scale-high', scale > 1.1);
  if (typeof handoffData !== 'undefined') { handoffData.uiScale = scale; saveToStorage(); }
  const btnOut = document.getElementById('btn-zoom-out');
  const btnIn  = document.getElementById('btn-zoom-in');
  if (btnOut) btnOut.classList.toggle('hidden', scale <= 1);
  if (btnIn)  btnIn.classList.toggle('hidden', scale >= 1.3);
}

const _ZOOM_STEPS = [1, 1.15, 1.3];

function zoomIn() {
  const idx = _ZOOM_STEPS.indexOf(window.currentUiScale);
  const next = idx === -1 ? _ZOOM_STEPS[0] : (_ZOOM_STEPS[idx + 1] || _ZOOM_STEPS[_ZOOM_STEPS.length - 1]);
  setUiScale(next);
  showToast(`Escala da UI: ${Math.round(next * 100)}%`);
}

function zoomOut() {
  const idx = _ZOOM_STEPS.indexOf(window.currentUiScale);
  const prev = idx <= 0 ? _ZOOM_STEPS[0] : _ZOOM_STEPS[idx - 1];
  setUiScale(prev);
  showToast(`Escala da UI: ${Math.round(prev * 100)}%`);
}

function toggleUiScale() { zoomIn(); }

window.toggleUiScale = toggleUiScale;
window.setUiScale = setUiScale;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.initResizable = initResizable;
window.updateRegraField = updateRegraField;
window.removeAnexo = removeAnexo;
window.linkCurrentSelectionForExc = linkCurrentSelectionForExc;
window.requestFrameRegistration = requestFrameRegistration;
