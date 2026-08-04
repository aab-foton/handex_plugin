// ============================================================
// frameworks.js — Catálogo e operações de frameworks de UX (AMUX)
// Herdado do Maturai UX, mantido como ferramenta auxiliar.
// ============================================================

let _hasScannedOnce = false;
let _selectedFrameworkId = '';

// Popula a lista customizada de inserção, agrupada por categoria e
// filtrável — substitui o <select> nativo, cujo dropdown de opções
// não respeita os limites da janela do plugin (renderizado pelo SO,
// fora do nosso controle de layout) e transbordava por cima da modal.
function renderFrameworkOptionList() {
  const container = document.getElementById('fw-option-list');
  if (!container) return;
  const filterEl = document.getElementById('fw-filter');
  const query = (filterEl?.value || '').trim().toLowerCase();

  const filtered = query
    ? AMUX_FRAMEWORKS.filter(f => f.name.toLowerCase().includes(query) || f.category.toLowerCase().includes(query))
    : AMUX_FRAMEWORKS;

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-slate-400 dark:text-dark-muted text-center py-6">Nenhum framework encontrado.</p>`;
    return;
  }

  const categories = [...new Set(filtered.map(f => f.category))];
  container.innerHTML = categories.map(cat => `
    <div>
      <p class="text-[9px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wide mb-1">${cat}</p>
      <div class="space-y-1">
        ${filtered.filter(f => f.category === cat).map(f => `
          <button onclick="selectFrameworkOption('${f.id}')" data-fw-option="${f.id}"
            class="w-full text-left px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${f.id === _selectedFrameworkId ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-dark-muted hover:bg-slate-100 dark:hover:bg-slate-800'}">
            ${f.name}
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function filterFrameworkList() {
  renderFrameworkOptionList();
}

function selectFrameworkOption(id) {
  _selectedFrameworkId = id;
  renderFrameworkOptionList();
  renderFrameworkPreview();
}

function renderFrameworkPreview() {
  const preview = document.getElementById('fw-preview');
  const btn = document.getElementById('btn-insert-framework');
  const fw = AMUX_FRAMEWORKS.find(f => f.id === _selectedFrameworkId);

  if (!fw) {
    if (preview) preview.classList.add('hidden');
    if (btn) btn.disabled = true;
    return;
  }

  document.getElementById('fw-preview-icon-wrap').className = `w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ${fw.bg}`;
  const iconEl = document.getElementById('fw-preview-icon');
  iconEl.setAttribute('data-lucide', fw.icon);
  iconEl.className = `w-4 h-4 ${fw.color}`;
  document.getElementById('fw-preview-name').textContent = fw.name;
  document.getElementById('fw-preview-category').textContent = fw.category;
  document.getElementById('fw-preview-category').className = `px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wide ${fw.categoryColor}`;
  document.getElementById('fw-preview-description').textContent = fw.description;
  document.getElementById('fw-preview-when').textContent = fw.when;

  if (preview) preview.classList.remove('hidden');
  if (btn) btn.disabled = false;
  try { lucide.createIcons(); } catch(e) {}
}

function injectSelectedFramework() {
  if (!_selectedFrameworkId) return;
  injectFramework(_selectedFrameworkId);
  closeInsertFrameworkModal();
}

function openInsertFrameworkModal() {
  _selectedFrameworkId = '';
  const filterEl = document.getElementById('fw-filter');
  if (filterEl) filterEl.value = '';
  renderFrameworkOptionList();
  renderFrameworkPreview();
  const modal = document.getElementById('modal-insert-framework');
  if (modal) modal.classList.remove('hidden');
  try { lucide.createIcons(); } catch(e) {}
}

function closeInsertFrameworkModal() {
  const modal = document.getElementById('modal-insert-framework');
  if (modal) modal.classList.add('hidden');
}

function injectFramework(id) {
  const fw = AMUX_FRAMEWORKS.find(f => f.id === id);
  if (!fw) return;
  parent.postMessage({ pluginMessage: { type: 'inject-framework', framework: fw } }, '*');
  showToast('Inserindo framework no canvas...', 'info');
}

function scanAll() {
  parent.postMessage({ pluginMessage: { type: 'scan-frameworks', frameworkIds: [] } }, '*');
  showToast('Escaneando canvas...', 'info');
}

// Chamado quando um scan-complete chega (ver messages.js) — só a partir
// do primeiro resultado o botão "Reescanear" passa a fazer sentido.
function onScanFinished() {
  _hasScannedOnce = true;
  const btn = document.getElementById('btn-rescan');
  if (btn) { btn.classList.remove('hidden'); btn.classList.add('flex'); }
}

function navigateToFrameworks() {
  navigate('view-frameworks');
  setTimeout(() => {
    const btn = document.getElementById('btn-rescan');
    if (btn) btn.classList.toggle('hidden', !_hasScannedOnce);
    const filterEl = document.getElementById('instance-filter');
    if (filterEl) filterEl.value = '';
    scanAll();
  }, 50);
}

// Filtra a lista de frameworks já injetados (ver renderFrameworkInstances
// em core.js) por nome, categoria ou página — não afeta a lista de
// inserção (modal separada).
function filterFrameworkInstances() {
  renderFrameworkInstances();
}

function deleteFrameworkInstance(idx) {
  const inst = (amuxData.frameworks || [])[idx];
  if (!inst) return;
  parent.postMessage({ pluginMessage: { type: 'delete-framework-instance', instanceId: inst.instanceId } }, '*');
}

function focusFrameworkInstance(idx) {
  const inst = (amuxData.frameworks || [])[idx];
  if (!inst) return;
  parent.postMessage({ pluginMessage: { type: 'focus-framework-instance', instanceId: inst.instanceId } }, '*');
}

function newVersionOfFramework(idx) {
  const inst = (amuxData.frameworks || [])[idx];
  const fw = inst && AMUX_FRAMEWORKS.find(f => f.id === inst.frameworkId);
  if (!fw) return;
  injectFramework(fw.id);
}

// ── Preenchimento de campos via formulário do plugin ────────────
// Em vez de o usuário clicar em cada texto no Figma, o formulário
// escreve direto nos nós field/<id> do frame já injetado — usa o
// mesmo `fields[]` do catálogo que já orienta o preview de inserção.
let _fillInstanceIdx = null;

function openFillFrameworkModal(idx) {
  const inst = (amuxData.frameworks || [])[idx];
  const fw = inst && AMUX_FRAMEWORKS.find(f => f.id === inst.frameworkId);
  if (!inst || !fw) return;

  _fillInstanceIdx = idx;

  document.getElementById('fill-modal-title').textContent = inst.frameName || fw.name;
  document.getElementById('fill-modal-subtitle').textContent = fw.name;

  const container = document.getElementById('fill-fields-list');
  container.innerHTML = fw.fields.map(field => {
    const currentValue = inst.data?.[field.id] || '';
    const label = `${field.label}${field.required ? ' *' : ''}`;
    if (field.type === 'scale') {
      // Escala 1-5: seletor de botões grava a nota tanto no dado quanto,
      // via fill.js, no destaque visual da linha _rating no canvas.
      const current = currentValue ? parseInt(currentValue, 10) : null;
      const options = [1, 2, 3, 4, 5].map(n => `
        <button type="button" data-scale-btn="${field.id}" data-scale-val="${n}"
          onclick="setScaleFieldValue('${field.id}', ${n})"
          class="w-8 h-8 rounded-lg text-[11px] font-bold transition-colors ${n === current ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-dark-muted hover:bg-slate-200 dark:hover:bg-slate-700'}">${n}</button>
      `).join('');
      return `
        <div>
          <label class="text-[10px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wide block mb-1">${label}</label>
          <input type="hidden" id="fill-field-${field.id}" value="${current || ''}" />
          <div class="flex gap-1.5">${options}</div>
        </div>`;
    }
    const isLong = currentValue.length > 60 || field.type === 'list';
    const inputEl = isLong
      ? `<textarea id="fill-field-${field.id}" rows="2" class="w-full resize-none leading-relaxed">${currentValue}</textarea>`
      : `<input id="fill-field-${field.id}" type="text" value="${currentValue.replace(/"/g, '&quot;')}" class="w-full" />`;
    return `
      <div>
        <label class="text-[10px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wide block mb-1">${label}</label>
        ${inputEl}
      </div>`;
  }).join('');

  document.getElementById('modal-fill-framework').classList.remove('hidden');
  try { lucide.createIcons(); } catch(e) {}
}

// Seleciona a nota (1-5) de um campo tipo "scale" no formulário: atualiza
// o input oculto que saveFillFrameworkFields lê, e o destaque visual dos
// botões 1-5 (o destaque no canvas é responsabilidade de fill.js, do
// lado do backend, quando os valores forem salvos).
function setScaleFieldValue(fieldId, value) {
  const hidden = document.getElementById(`fill-field-${fieldId}`);
  if (hidden) hidden.value = String(value);
  document.querySelectorAll(`[data-scale-btn="${fieldId}"]`).forEach(btn => {
    const isSel = btn.getAttribute('data-scale-val') === String(value);
    btn.className = `w-8 h-8 rounded-lg text-[11px] font-bold transition-colors ${isSel ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-dark-muted hover:bg-slate-200 dark:hover:bg-slate-700'}`;
  });
}

function closeFillFrameworkModal() {
  document.getElementById('modal-fill-framework').classList.add('hidden');
  _fillInstanceIdx = null;
}

function saveFillFrameworkFields() {
  if (_fillInstanceIdx === null) return;
  const inst = (amuxData.frameworks || [])[_fillInstanceIdx];
  const fw = inst && AMUX_FRAMEWORKS.find(f => f.id === inst.frameworkId);
  if (!inst || !fw) return;

  const values = {};
  fw.fields.forEach(field => {
    const el = document.getElementById(`fill-field-${field.id}`);
    if (el) values[field.id] = el.value;
  });

  parent.postMessage({ pluginMessage: { type: 'fill-framework-fields', instanceId: inst.instanceId, values } }, '*');
  showToast('Salvando no canvas...', 'info');
}

Object.assign(window, {
  renderFrameworkOptionList, filterFrameworkList, selectFrameworkOption, renderFrameworkPreview,
  injectSelectedFramework, openInsertFrameworkModal, closeInsertFrameworkModal,
  injectFramework, scanAll, onScanFinished, navigateToFrameworks, filterFrameworkInstances,
  deleteFrameworkInstance, newVersionOfFramework, focusFrameworkInstance,
  openFillFrameworkModal, closeFillFrameworkModal, saveFillFrameworkFields, setScaleFieldValue
});
