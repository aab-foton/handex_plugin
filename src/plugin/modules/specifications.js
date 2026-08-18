// ============================================================
// specifications.js — modal "Criar Especificação" + render + flows
//
// Inclui:
//   - scanFrame + render dos cards de specs (renderSpecs, createAccordionSection, createSpecItem)
//   - filtros e busca (filterSpecItems, toggleStatusFilter)
//   - botões de visibilidade (updateHideAllSpecsButtonState, updateGroupVisButtonState, toggleAllSpecsVisibility)
//   - modal de criação (openSpecFormModal, closeSpecFormModal, requestSpecProperties, advanceToSpecExceptionStep, finalizeSpecCreation)
//   - categorias customizadas (saveCategories, renderCategoryDropdown, renderCategoryList, toggleCategoryManager, addCategory, deleteCategory, renameCategory)
//   - render no plugin (renderSpecsList)
//   - exportação (exportSpecsToMd)
//   - fluxos (selectFlowType, openFlowFormModal, confirmFlowConnection, switchSpecTab, renderFlowsList, openEditFlowModal, toggleFlowVisibility, createLegend)
//   - manipulação de nós (hideNode, deleteNode)
//   - executeUnifiedSpec, toggleLinkInput, toggleAllSpecProperties, toggleAllAnnotationProps, togglePropGroup
//
// Depende de: handoffData, createdSpecs, currentSpecTab, saveSpecsToStorage,
// saveToStorage, focusNode, openModal/closeModal, showToast
// ============================================================

    function isCurrentFrameAuditEnabled() {
      return false;
    }

    function scanFrame(frameId, categories = null, selectedLibSlugs = null) {
      if (frameId) activeFrameId = frameId;

      const frame = activeFrameId ? getFrame(activeFrameId) : null;

      // Loading visual — overlay de scan + spinner discreto no frame
      if (typeof showScanLoading === 'function') showScanLoading();
      if (activeFrameId) {
        const spinner = document.getElementById(`sub-spinner-tokens-${activeFrameId}`);
        if (spinner) spinner.classList.remove('hidden');
        const sec = document.getElementById(`sub-sec-tokens-${activeFrameId}`);
        if (sec) sec.classList.remove('hidden');
      }
      _refreshIcons();

      parent.postMessage({
        pluginMessage: {
          type: "scan-frame",
          frameId: activeFrameId || null,
          nodeId: frame ? frame.figmaId : null,
          isAudit: false,
          referenceTokens: null,
          selectedLibSlugs: null,
          categories: categories
        }
      }, "*");
    }


    function renderSpecs(data, frameId) {
      const containerId = frameId ? `scan-results-${frameId}` : "scan-results";
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = "";

      // Restaura o activeFrameId para que createAccordionSection / createSpecItem
      // consigam chamar isCurrentFrameAuditEnabled() corretamente
      if (frameId) activeFrameId = frameId;

      const sections = [
        { title: "Componentes", items: data.components, type: "components", icon: "box" },
        { title: "Ícones", items: data.icons, type: "icons", icon: "image" },
        { title: "Tipografia", items: data.typography, type: "typography", icon: "type" },
        { title: "Vetores", items: data.vectors, type: "vectors", icon: "pen-tool" }
      ];

      // Oculta spinner do sub-header de tokens
      if (frameId) {
        const spinner = document.getElementById(`sub-spinner-tokens-${frameId}`);
        if (spinner) spinner.classList.add('hidden');
      }

      sections.forEach(section => {
        if (section.items && section.items.length > 0) {
          container.appendChild(createAccordionSection(section));
        }
      });

      _refreshIcons();
      // Atualiza subtítulo de conformidade após scan (itens desvinculados podem mudar o estado)
      if (frameId && typeof _updateFrameAuditSubtitle === 'function') {
        _updateFrameAuditSubtitle(frameId);
      }
    }

    // ── Helpers de visibilidade de seções ──────────────────────────────
    function showFrameSection(frameId, type) {
      const wrap = document.getElementById(`sub-sec-${type}-${frameId}`);
      if (!wrap) return;
      wrap.classList.remove('hidden');
      const body = document.getElementById(`sub-body-${type}-${frameId}`);
      const chev = document.getElementById(`sub-chev-${type}-${frameId}`);
      if (body && body.classList.contains('hidden')) {
        body.classList.remove('hidden');
        if (chev) chev.style.transform = 'rotate(90deg)';
      }
    }
    window.showFrameSection = showFrameSection;

    // ── Conformance alert helpers ────────────────────────────────────────
    // Campo de declaração dos desvios (textarea) só faz sentido quando existe
    // algo a justificar: Check Designs concluído E (é Novo Componente OU o
    // designer marcou que HÁ desvios OU o scan automatizado achou itens fora
    // do DS mesmo com "Sem desvios" marcado — contradição que precisa de
    // explicação). Se checkDone+semDesvios e nenhum achado automatizado, não
    // há nada a declarar — o campo fica oculto.
    function _shouldShowAuditObs(frame) {
      if (!frame || !frame.audit || !frame.audit.checkDone) return false;
      const hasUnl = typeof _computeFrameHasUnlinked === 'function' ? _computeFrameHasUnlinked(frame) : false;
      return frame.isNewComponent || !frame.audit.semDesvios || hasUnl;
    }

    function _buildConformanceAlertHTML(frame) {
      if (!frame || !frame.audit || !frame.audit.checkDone) return '';
      const hasUnl = typeof _computeFrameHasUnlinked === 'function' ? _computeFrameHasUnlinked(frame) : false;
      const semDesvios = frame.audit.semDesvios;
      if (semDesvios && !hasUnl && !frame.isNewComponent) return '';

      const secDefs = [
        { key: 'components', label: 'Componente' },
        { key: 'icons', label: 'Ícone' },
        { key: 'typography', label: 'Tipografia' },
        { key: 'frames', label: 'Frame' },
        { key: 'vectors', label: 'Vetor' }
      ];
      const items = [];
      if (frame.specs) {
        secDefs.forEach(sec => {
          (frame.specs[sec.key] || []).forEach(item => {
            if (item.isDS === false) items.push({ label: sec.label, name: item.name || '(sem nome)', nodeId: item.nodeId || null, status: 'error' });
            else if (item.isDS === 'warning') items.push({ label: sec.label, name: item.name || '(sem nome)', nodeId: item.nodeId || null, status: 'warning' });
          });
        });
      }

      if (items.length === 0) {
        return `<div class="flex items-start gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/15 rounded-xl border border-amber-100 dark:border-amber-800/30">
          <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5"></i>
          <p class="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">Desvios declarados. Descreva abaixo quais adequações são necessárias.</p>
        </div>`;
      }

      const rows = items.map(it => {
        const icon = it.status === 'error' ? 'x-circle' : 'alert-triangle';
        const cls  = 'text-amber-600 dark:text-amber-400';
        const clickable = it.nodeId
          ? `onclick="focusNode('${it.nodeId}')" title="Focar no elemento no Figma" class="flex items-center gap-1.5 min-w-0 w-full cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded px-1 py-0.5 transition-colors group"`
          : `class="flex items-center gap-1.5 min-w-0 w-full px-1 py-0.5"`;
        return `<li ${clickable}>
          <i data-lucide="${icon}" class="w-3 h-3 ${cls} shrink-0"></i>
          <span class="text-[10px] text-slate-500 dark:text-dark-muted shrink-0">${it.label}</span>
          <span class="text-[10px] font-medium text-slate-700 dark:text-white truncate flex-1">${it.name}</span>
          ${it.nodeId ? `<i data-lucide="locate" class="w-3 h-3 text-slate-400 dark:text-slate-600 group-hover:text-amber-500 shrink-0 transition-colors"></i>` : ''}
        </li>`;
      }).join('');

      return `<div class="px-3 py-2.5 bg-amber-50 dark:bg-amber-900/15 rounded-xl border border-amber-100 dark:border-amber-800/30 space-y-1.5">
        <div class="flex items-center gap-1.5">
          <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-600 shrink-0"></i>
          <p class="text-[11px] font-bold text-amber-700 dark:text-amber-400">Itens para revisar:</p>
        </div>
        <ul class="space-y-1 pl-0.5">${rows}</ul>
      </div>`;
    }

    function _refreshConformanceAlert(frameId) {
      const frame = typeof getFrame === 'function' ? getFrame(frameId) : null;
      if (!frame) return;
      const el = document.getElementById('conformance-alert-' + frameId);
      if (!el) return;
      el.innerHTML = _buildConformanceAlertHTML(frame);
      if (typeof _refreshIcons === 'function') _refreshIcons();
    }

    // ── Accordion card por frame (Step 3 — Documentação & Specs) ────────
    function renderFrameCard(frame, autoExpand = false) {
      const list = document.getElementById('list-frames');
      if (!list) return;

      const emptyState = document.getElementById('frames-empty-state');
      if (emptyState) emptyState.classList.add('hidden');

      const fid = frame.id;
      const card = document.createElement('li');
      card.id = `frame-card-${fid}`;
      card.className = 'frame-card bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-2xl overflow-hidden shadow-sm mb-3';
      card.setAttribute('data-frame-id', fid);

      const subHead = (key, icon, label, countId) => `
        <button type="button" onclick="event.stopPropagation(); toggleSubAccordion('${key}')"
          class="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors text-left">
          <div class="w-6 h-6 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
            <i data-lucide="${icon}" class="w-3.5 h-3.5 text-slate-500 dark:text-dark-muted"></i>
          </div>
          <span class="flex-1 text-[12px] font-bold text-slate-700 dark:text-white">${label}</span>
          <span id="${countId}" class="text-[10px] text-slate-500 dark:text-dark-muted mr-1"></span>
          <i data-lucide="chevron-right" id="sub-chev-${key}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0"></i>
        </button>`;

      // Subtítulo dinâmico baseado no estado de conformidade DSC
      let _subCls, _subLabel;
      if (frame.isNewComponent) {
        _subCls = 'text-[10px] text-violet-500 font-medium'; _subLabel = 'Novo Componente';
      } else if (!frame.audit || !frame.audit.checkDone) {
        _subCls = 'text-[10px] text-slate-500 dark:text-dark-muted font-medium'; _subLabel = 'Pendente';
      } else {
        const _hasUnl = typeof _computeFrameHasUnlinked === 'function' ? _computeFrameHasUnlinked(frame) : false;
        if (frame.audit.semDesvios && !_hasUnl) {
          _subCls = 'text-[10px] text-green-600 font-medium'; _subLabel = 'Conforme';
        } else {
          _subCls = 'text-[10px] text-red-500 font-medium'; _subLabel = 'Não Conforme';
        }
      }

      card.innerHTML = `
        <!-- Cabeçalho -->
        <div id="frame-header-${fid}" role="button" tabindex="0" aria-expanded="false" aria-label="Expandir detalhes de ${escapeHtml(frame.nome)}" title="Expandir detalhes"
          class="flex items-center gap-2 px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors select-none"
          onclick="toggleFrameAccordion('${fid}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleFrameAccordion('${fid}');}">
          <div class="flex-1 min-w-0">
            <p class="text-[12px] font-bold text-slate-800 dark:text-white truncate">${frame.nome}</p>
            <p id="frame-subtitle-${fid}" class="${_subCls}">${_subLabel}</p>
          </div>
          <span class="text-[9px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wider shrink-0">Detalhes</span>
          <i data-lucide="chevron-down" id="frame-chevron-${fid}" class="w-4 h-4 text-gray-400 transition-transform shrink-0" aria-hidden="true"></i>
        </div>

        <!-- Ações -->
        <div class="flex items-center justify-end gap-2 px-3 py-1.5 border-t border-gray-50 dark:border-dark-line bg-gray-50/50 dark:bg-slate-900/30">
          <span class="text-[9px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wider shrink-0">Ações</span>
          <div class="flex items-center gap-0.5">
            <button type="button"
              onclick="focusNode('${frame.figmaId}')"
              title="Focar no elemento no canvas"
              aria-label="Focar no elemento no canvas"
              class="w-7 h-7 flex items-center justify-center rounded-xl text-[#3d3dff] hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shrink-0">
              <i data-lucide="locate" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button"
              onclick="removeFrame('${fid}')"
              title="Remover frame"
              aria-label="Remover frame"
              class="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- Corpo -->
        <div id="frame-body-${fid}" class="accordion-content hidden border-t border-gray-50 dark:border-dark-line">

          <!-- ── Toggle Novo Componente ── -->
          <div class="px-4 py-2.5 flex items-center justify-between border-b border-gray-50 dark:border-dark-line">
            <div class="flex items-center gap-2.5">
              <div class="w-6 h-6 flex items-center justify-center bg-violet-50 dark:bg-violet-900/30 rounded-lg shrink-0">
                <i data-lucide="component" class="w-3.5 h-3.5 text-violet-500"></i>
              </div>
              <div>
                <p class="text-[12px] font-bold text-slate-700 dark:text-white">Novo Componente</p>
                <p class="text-[10px] text-slate-500 dark:text-dark-muted">Frame introduz um componente inédito no DSC</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" id="toggle-new-component-${fid}" class="sr-only peer"
                ${frame.isNewComponent ? 'checked' : ''}
                onchange="toggleNewComponent('${fid}', this.checked)">
              <div class="w-9 h-5 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-500"></div>
            </label>
          </div>

          <!-- ── Observações Novo Componente ── -->
          <div id="new-component-obs-${fid}" class="${frame.isNewComponent ? '' : 'hidden'} px-3 pt-2.5 pb-0">
            <div class="flex items-center justify-end mb-1">
              <span id="new-component-obs-text-${fid}-count" class="text-[9px] font-bold text-slate-400 dark:text-dark-muted">${(frame.newComponentObservations || '').length}/500</span>
            </div>
            <textarea id="new-component-obs-text-${fid}" maxlength="500"
              onchange="updateNewComponentObs('${fid}', this.value)"
              oninput="_updateCharCount(this, 500)"
              placeholder="Descreva o padrão de uso, nomenclatura de tokens e diretrizes de aplicação deste componente..."
              rows="3"
              class="w-full bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/30 rounded-xl px-3 py-2.5 text-[11px] text-slate-700 dark:text-white outline-none resize-none focus:border-violet-400 transition-colors"
            >${frame.newComponentObservations || ''}</textarea>
          </div>

          <!-- ── Tokens Escaneados (oculto até escanear) ── -->
          <div id="sub-sec-tokens-${fid}" class="hidden border-b border-gray-50 dark:border-dark-line">
            <button type="button" onclick="event.stopPropagation(); toggleSubAccordion('tokens-${fid}')"
              class="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors text-left">
              <div class="w-6 h-6 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
                <i data-lucide="scan-line" class="w-3.5 h-3.5 text-slate-500 dark:text-dark-muted"></i>
              </div>
              <span class="flex-1 text-[12px] font-bold text-slate-700 dark:text-white">Tokens Escaneados</span>
              <span id="sub-count-tokens-${fid}" class="text-[10px] text-slate-500 dark:text-dark-muted mr-1"></span>
              <span id="sub-spinner-tokens-${fid}" class="hidden mr-1.5">
                <i data-lucide="loader-2" class="w-3 h-3 text-[#3d3dff] animate-spin"></i>
              </span>
              <i data-lucide="chevron-right" id="sub-chev-tokens-${fid}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0"></i>
            </button>
            <div id="sub-body-tokens-${fid}" data-accordion-content class="hidden bg-gray-50/30 dark:bg-dark-bg/20">
              <div id="scan-results-${fid}" class="p-1"></div>
            </div>
          </div>

          <!-- ── Conformidade DSC (oculta para Novo Componente — passa por revisão dedicada no DSC) ── -->
          <div id="conformance-section-${fid}" class="${frame.isNewComponent ? 'hidden' : ''} border-t border-gray-50 dark:border-dark-line px-4 py-3 space-y-1">
            <p class="text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider pb-1">Conformidade DSC</p>

            <!-- Toggle: Check Designs realizado -->
            <div class="flex items-center justify-between py-1.5">
              <div>
                <p class="text-[12px] font-medium text-slate-700 dark:text-white">Check Designs realizado</p>
                <p class="text-[10px] text-slate-500 dark:text-dark-muted">Verificação com a biblioteca DSC concluída</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" id="check-done-${fid}" class="sr-only peer"
                  ${frame.audit && frame.audit.checkDone ? 'checked' : ''}
                  onchange="setFrameCheckDone('${fid}', this.checked)">
                <div class="w-9 h-5 bg-gray-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#3d3dff]"></div>
              </label>
            </div>

            <!-- Re-escanear (visível só quando checkDone) -->
            <div id="rescan-row-${fid}" class="${frame.audit && frame.audit.checkDone ? '' : 'hidden'} flex items-center justify-between py-1 border-t border-gray-50 dark:border-dark-line pt-2">
              <div>
                <p class="text-[11px] font-medium text-slate-600 dark:text-dark-muted">Atualizar escaneamento</p>
                <p class="text-[10px] text-slate-500 dark:text-dark-muted leading-snug">Re-escaneia o frame após ajustes</p>
              </div>
              <button onclick="scanFrame('${fid}')"
                class="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#3d3dff]/8 hover:bg-[#3d3dff]/15 border border-[#3d3dff]/20 rounded-xl text-[#3d3dff] dark:text-blue-400 text-[10px] font-bold transition-colors shrink-0">
                <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                Escanear
              </button>
            </div>

            <!-- Resultado (visível só quando checkDone) -->
            <div id="audit-result-${fid}" class="${frame.audit && frame.audit.checkDone ? '' : 'hidden'} space-y-1.5 border-t border-gray-50 dark:border-dark-line pt-2">
              ${!frame.isNewComponent ? `
              <div class="flex items-center justify-between py-1.5">
                <div>
                  <p class="text-[12px] font-medium text-slate-700 dark:text-white">Sem desvios encontrados</p>
                  <p class="text-[10px] text-slate-500 dark:text-dark-muted">Frame em conformidade com o DSC</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" id="sem-desvios-${fid}" class="sr-only peer"
                    ${frame.audit && frame.audit.semDesvios ? 'checked' : ''}
                    onchange="setFrameSemDesvios('${fid}', this.checked)">
                  <div class="w-9 h-5 bg-gray-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                </label>
              </div>` : `
              <div class="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800/30">
                <i data-lucide="component" class="w-3.5 h-3.5 text-violet-500 shrink-0"></i>
                <p class="text-[11px] text-violet-700 dark:text-violet-300 leading-snug">Componente novo — desvios são esperados. Registre as divergências nas observações abaixo.</p>
              </div>`}
              <div id="conformance-alert-${fid}">${_buildConformanceAlertHTML(frame)}</div>
              <div class="${_shouldShowAuditObs(frame) ? '' : 'hidden'} flex items-center justify-end" id="audit-obs-${fid}-count-row">
                <span id="audit-obs-${fid}-count" class="text-[9px] font-bold text-slate-400 dark:text-dark-muted">${(frame.audit && frame.audit.observacoes ? frame.audit.observacoes : '').length}/500</span>
              </div>
              <textarea id="audit-obs-${fid}" rows="2" maxlength="500"
                placeholder="Descreva os desvios encontrados ou o motivo da não conformidade com o DSC..."
                oninput="setFrameAuditObs('${fid}', this.value); _updateCharCount(this, 500)"
                class="${_shouldShowAuditObs(frame) ? '' : 'hidden'} w-full bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-line rounded-xl px-3 py-2 text-[11px] text-slate-700 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 resize-none focus:ring-2 focus:ring-[#3d3dff]/20 outline-none transition-all">${frame.audit && frame.audit.observacoes ? frame.audit.observacoes : ''}</textarea>
            </div>
          </div>

        </div>
      `;

      list.appendChild(card);

      // Sync subtitle initial state
      _updateFrameAuditSubtitle(fid);

      _refreshIcons();

      if (frame.specs) { renderSpecs(frame.specs, fid); showFrameSection(fid, 'tokens'); }

      // Expandir + focar automaticamente só faz sentido para um frame
      // RECÉM-REGISTRADO (mostra o resultado do scan na hora) -- ao
      // reconstruir a lista inteira (restoreUIFromState, abrir a tela com
      // frames já existentes), isso não deve rodar para cada card, senão o
      // viewport pula pra cada frame do array (bug reportado: abrir a tela
      // "joga" pro primeiro item sem nenhum clique do usuário).
      if (autoExpand) toggleFrameAccordion(fid);
    }

    // ── Spec helpers (inline edit, obs, visibility) ──────────────────
    function updateSpecTitle(frameId, index, value) {
      const frame = getFrame(frameId);
      if (frame && frame.createdSpecs[index]) {
        frame.createdSpecs[index].name = value;
        saveToStorage();
      }
    }

    function toggleSpecVisibility(frameId, index) {
      const frame = getFrame(frameId);
      if (!frame || !frame.createdSpecs[index]) return;
      const spec = frame.createdSpecs[index];
      spec.visible = spec.visible === false ? true : false;
      if (spec.id) {
        parent.postMessage({ pluginMessage: { type: spec.visible === false ? 'hide-node' : 'show-node', id: spec.id } }, '*');
      }
      saveToStorage();
      renderSpecsListForFrame(frameId);
    }

    function toggleSpecObs(obsId) {
      const el = document.getElementById(obsId);
      if (el) el.classList.toggle('hidden');
    }

    function updateSpecObs(frameId, index, value) {
      const frame = getFrame(frameId);
      if (frame && frame.createdSpecs[index]) {
        frame.createdSpecs[index].obs = value;
        saveToStorage();
      }
    }

    function deleteSpecFromFrame(frameId, index, nodeId) {
      const frame = getFrame(frameId);
      if (!frame) return;
      frame.createdSpecs.splice(index, 1);
      if (nodeId) parent.postMessage({ pluginMessage: { type: 'delete-node', id: nodeId } }, '*');
      saveToStorage();
      renderSpecsListForFrame(frameId);
      if (!frame.createdSpecs.length) {
        const wrap = document.getElementById(`sub-sec-specs-${frameId}`);
        if (wrap) wrap.classList.add('hidden');
      }
    }
    function lockSpecPositioning(frameId, index, specId) {
      const frame = getFrame(frameId);
      if (!frame || !frame.createdSpecs[index]) return;
      parent.postMessage({ pluginMessage: { type: 'lock-spec', specId } }, '*');
    }
    window.updateSpecTitle = updateSpecTitle;
    window.toggleSpecVisibility = toggleSpecVisibility;
    window.toggleSpecObs = toggleSpecObs;
    window.updateSpecObs = updateSpecObs;
    window.deleteSpecFromFrame = deleteSpecFromFrame;
    window.lockSpecPositioning = lockSpecPositioning;

    // ── Cores por categoria de spec ─────────────────────────────────
    const _CAT_COLORS = {
      'info':          { fill: '#EBF1F2', stroke: '#64747A' },
      'comportamento': { fill: '#F8EAF3', stroke: '#93537D' },
      'regra':         { fill: '#E5F5F8', stroke: '#008CB2' },
      'api':           { fill: '#F5FEC1', stroke: '#6D8000' },
    };
    function _getCatColor(value) {
      return _CAT_COLORS[value] || { fill: '#F1F5F9', stroke: '#94A3B8' };
    }

    // ── Cores por tipo de exceção ─────────────────────────────────────
    const _excColors = {
      'Erro':        { bg: 'bg-red-50 dark:bg-red-900/20',    border: 'border-red-100 dark:border-red-900/30',    text: 'text-red-600 dark:text-red-400',    dot: 'bg-red-500' },
      'Alerta':      { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-900/30', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
      'Sucesso':     { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-100 dark:border-green-900/30', text: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' },
      'Confirmação': { bg: 'bg-blue-50 dark:bg-blue-900/20',   border: 'border-blue-100 dark:border-blue-900/30',   text: 'text-blue-600 dark:text-blue-400',   dot: 'bg-blue-500' },
    };
    function _excColor(tipo) {
      return _excColors[tipo] || { bg: 'bg-slate-50 dark:bg-slate-800/30', border: 'border-slate-100 dark:border-dark-line', text: 'text-slate-500 dark:text-dark-muted', dot: 'bg-slate-400' };
    }
    const _excEmoji = { 'Sucesso': '✅', 'Erro': '❌', 'Alerta': '⚠️', 'Confirmação': '❓' };
    function _renderExcItem(exc, onDelete) {
      const c = _excColor(exc.tipo);
      return `<div class="flex flex-col gap-1 px-2 py-1.5 ${c.bg} border ${c.border} rounded-lg">
        <div class="flex items-center gap-1.5">
          <span class="text-[9px] font-bold ${c.text} uppercase shrink-0 px-1.5 py-0.5 rounded-md ${c.bg} border ${c.border}">${_excEmoji[exc.tipo] || '❔'} ${exc.tipo || ''}</span>
          <span class="flex-1 min-w-0 text-[10px] text-slate-600 dark:text-dark-text leading-snug truncate">${exc.titulo || ''}</span>
          ${onDelete ? `<button type="button" onclick="event.stopPropagation(); ${onDelete}"
            title="Remover exceção" aria-label="Remover exceção"
            class="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
            <i data-lucide="x" class="w-3 h-3"></i></button>` : ''}
        </div>
        ${exc.obs ? `<p class="text-[9px] text-slate-500 dark:text-dark-muted leading-snug pl-1 italic">${exc.obs}</p>` : ''}
      </div>`;
    }

    // ── Render da lista de specs criadas por frame ─────────────────────
    // ÓRFÃ: `specs-list-${frameId}` nunca existe em nenhum HTML do projeto (confirmado por grep
    // em toda a árvore src/plugin). Toda chamada cai em `if (!list) return;` e o resto da função
    // (incluindo header de grupo com ocultar linhas/grupo/cadeado) nunca executa, apesar de a
    // função ser chamada de vários lugares (core.js, messages.js, esta própria função).
    // A view "Anotar Specs" real é alimentada por `renderSpecsList()` (mais abaixo neste arquivo),
    // que opera sobre o array global `createdSpecs`/`handoffData.specs`, não sobre `frame.createdSpecs`.
    // Não implemente features novas aqui — elas nunca vão aparecer na UI. Ver docs/spec-visibility-and-ordering-proposal.md.
    function renderSpecsListForFrame(frameId) {
      const frame = getFrame(frameId);
      if (!frame) return;
      const specsData = frame.createdSpecs || [];
      const list = document.getElementById(`specs-list-${frameId}`);
      if (!list) return;
      list.innerHTML = '';

      const countEl = document.getElementById(`sub-count-specs-${frameId}`);
      if (countEl) countEl.textContent = specsData.length ? `${specsData.length}` : '';

      if (specsData.length === 0) return;

      const grouped = {};
      specsData.forEach((spec, idx) => {
        if (!spec) return;
        const letter = spec.letter || '?';
        if (!grouped[letter]) grouped[letter] = [];
        grouped[letter].push({ ...spec, _idx: idx });
      });

      Object.keys(grouped).sort().forEach(letter => {
        const specs = grouped[letter];
        const color = specs[0].color || '#2e2ee0';
        const groupEl = document.createElement('div');
        groupEl.className = 'mb-3';

        const groupNames = frame.specGroupNames || {};
        const groupVisible = frame.specGroupVisible || {};
        const isGroupHidden = groupVisible[letter] === false;
        const groupName = groupNames[letter] || '';
        const linesVisible = frame.specLinesVisible || {};
        const isLinesHidden = linesVisible[letter] === false;
        const groupLocked = frame.specGroupLocked || {};
        const isGroupUnlocked = groupLocked[letter] === false;

        // Group header with editable name and visibility toggle
        const groupHeader = document.createElement('div');
        groupHeader.className = 'flex items-center gap-1.5 px-1 mb-1.5';
        groupHeader.innerHTML = `
          <div class="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-extrabold text-white shrink-0" style="background-color:${color}">${letter}</div>
          <input type="text" id="spec-group-name-${frameId}-${letter}" value="${groupName.replace(/"/g, '&quot;')}"
            placeholder="Nomear grupo..."
            title="Nome do grupo" maxlength="40"
            class="flex-1 min-w-0 text-[10px] font-bold text-slate-500 dark:text-dark-muted bg-transparent border border-transparent focus:border-[#3d3dff]/30 focus:ring-1 focus:ring-[#3d3dff]/20 rounded px-1 py-0.5 outline-none placeholder:text-gray-400 transition-all"
            onchange="updateSpecGroupName('${frameId}', '${letter}', this.value)"
            oninput="_updateCharCount(this, 40)"
            onclick="event.stopPropagation()" />
          <span id="spec-group-name-${frameId}-${letter}-count" class="text-[8px] font-bold text-slate-300 dark:text-dark-muted shrink-0">${groupName.length}/40</span>
          <span class="text-[10px] text-slate-500 dark:text-dark-muted shrink-0">${specs.length} esp.</span>
          ${isGroupUnlocked ? `
          <span title="Grupo destravado — fora do estado padrão protegido"
            class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[8px] font-bold uppercase tracking-wide shrink-0">
            <i data-lucide="lock-open" class="w-2.5 h-2.5"></i>destravado
          </span>` : ''}
          <button type="button" title="${isLinesHidden ? 'Exibir linhas' : 'Ocultar linhas'}"
            aria-label="${isLinesHidden ? 'Exibir linhas' : 'Ocultar linhas'}"
            onclick="event.stopPropagation(); toggleSpecLinesVisibility('${frameId}', '${letter}')"
            class="w-5 h-5 flex items-center justify-center ${isLinesHidden ? 'text-gray-400' : 'text-slate-500'} hover:text-[#3d3dff] transition-colors shrink-0">
            <i data-lucide="spline" class="w-3 h-3"></i>
          </button>
          <button type="button" title="${isGroupHidden ? 'Exibir grupo' : 'Ocultar grupo'}"
            aria-label="${isGroupHidden ? 'Exibir grupo' : 'Ocultar grupo'}"
            onclick="event.stopPropagation(); toggleSpecGroupVisibility('${frameId}', '${letter}')"
            class="w-5 h-5 flex items-center justify-center ${isGroupHidden ? 'text-gray-400' : 'text-slate-500'} hover:text-[#3d3dff] transition-colors shrink-0">
            <i data-lucide="${isGroupHidden ? 'eye-off' : 'eye'}" class="w-3 h-3"></i>
          </button>
          <button type="button" title="${isGroupUnlocked ? 'Travar grupo' : 'Destravar grupo'}"
            aria-label="${isGroupUnlocked ? 'Travar grupo' : 'Destravar grupo'}"
            onclick="event.stopPropagation(); toggleSpecGroupLock('${frameId}', '${letter}')"
            class="w-5 h-5 flex items-center justify-center ${isGroupUnlocked ? 'text-amber-500' : 'text-slate-500'} hover:text-[#3d3dff] transition-colors shrink-0">
            <i data-lucide="${isGroupUnlocked ? 'lock-open' : 'lock'}" class="w-3 h-3"></i>
          </button>`;
        groupEl.appendChild(groupHeader);

        // Items with dashed left connector
        const itemsWrapper = document.createElement('div');
        itemsWrapper.className = 'ml-2.5 pl-3 space-y-1.5';
        itemsWrapper.style.cssText = `border-left: 2px dashed ${color}40;`;
        if (isGroupHidden) itemsWrapper.style.opacity = '0.4';

        specs.forEach(spec => {
          const isHidden = spec.visible === false;
          const detailsId = `spec-details-${frameId}-${spec._idx}`;
          const excListId = `spec-exc-list-${frameId}-${spec._idx}`;
          const excCount = (spec.excecoes || []).length;
          const props = spec.properties || [];

          // Keys where a missing token is a real concern (color/spacing/sizing tokens)
          const tokenKeys = new Set(['fill', 'stroke', 'padding', 'gap', 'radius', 'fontSize']);
          const hasRawTokenWarning = props.some(p => tokenKeys.has(p.key) && !p.token);

          // Category pill
          const _ccPill = _getCatColor(spec.category);
          const categoryPill = spec.category ? `
            <div class="mb-2.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold" style="background-color:${_ccPill.fill};border-color:${_ccPill.stroke};color:${_ccPill.stroke};">${spec.categoryLabel || spec.category}</span>
            </div>` : '';

          // Build properties rows HTML
          const propsHtml = props.length > 0 ? `
            <div class="mb-3">
              <p class="text-[9px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider mb-1.5">Propriedades</p>
              ${hasRawTokenWarning ? `
              <div class="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/30">
                <i data-lucide="alert-triangle" class="w-3 h-3 text-amber-500 shrink-0"></i>
                <p class="text-[10px] text-amber-700 dark:text-amber-400 leading-snug flex-1">Valores sem token. Use o <strong>Check Design</strong> para escanear tokens deste elemento.</p>
              </div>` : ''}
              <div class="space-y-1">
                ${props.map(p => `
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] text-slate-500 dark:text-dark-muted shrink-0">${p.label || p.key}</span>
                    <span class="text-[10px] font-semibold ${tokenKeys.has(p.key) && !p.token ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-white'} text-right font-mono">${p.token || p.value}</span>
                  </div>`).join('')}
              </div>
            </div>` : '';

          // Build exceptions HTML
          const excHtml = (spec.excecoes || []).map((exc, ei) =>
            _renderExcItem(exc, `deleteSpecException('${frameId}', ${spec._idx}, ${ei})`)
          ).join('');

          const isPending = spec.pendingConfirmation === true;

          const pendingBarHtml = isPending ? `
            <div class="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/30">
              <i data-lucide="move" class="w-3 h-3 text-amber-500 shrink-0"></i>
              <span class="flex-1 min-w-0 text-[9px] font-bold text-amber-600 dark:text-amber-400 truncate">Posicionando…</span>
              <button type="button" onclick="event.stopPropagation(); lockSpecPositioning('${frameId}', ${spec._idx}, '${spec.id}')"
                class="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/30 border border-amber-200 dark:border-amber-700/40 rounded-md hover:bg-amber-200 transition-colors shrink-0">
                <i data-lucide="check" class="w-2.5 h-2.5"></i> Concluir posicionamento
              </button>
            </div>` : '';

          const item = document.createElement('div');
          // overflow-hidden fica só no painel de detalhes (abaixo), não aqui
          // -- este card tem o menu "..." (specMenuPanel, absolute) como
          // filho direto, e overflow-hidden aqui cortava o menu quando o
          // item estava recolhido (mesmo padrão já corrigido no grupo, ver
          // comentário equivalente perto de headerInfo/groupContent).
          item.className = `relative bg-white dark:bg-dark-surface rounded-xl border ${isPending ? 'border-amber-200 dark:border-amber-800/40' : isHidden ? 'border-gray-100 opacity-50' : 'border-gray-100 dark:border-dark-line'} transition-all`;

          item.innerHTML = `
            <div class="absolute -left-[18px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-dark-surface" style="background-color:${color}"></div>
            ${pendingBarHtml}
            <div role="button" tabindex="0" class="flex items-center px-2 py-1.5 gap-1.5 cursor-pointer select-none" onclick="toggleSpecDetails('${detailsId}')" onkeydown="if((event.key==='Enter'||event.key===' ')&&event.target===event.currentTarget){event.preventDefault();toggleSpecDetails('${detailsId}');}" aria-label="Expandir/recolher detalhes da especificação ${escapeHtml(spec.name || '')}">
              <div class="w-4 h-4 rounded flex items-center justify-center text-[8px] font-extrabold text-white shrink-0" style="background-color:${color}">${letter}</div>
              <div class="flex-1 min-w-0">
                <input type="text" id="spec-title-${frameId}-${spec._idx}" value="${(spec.name || '').replace(/"/g, '&quot;')}"
                  title="Clique para editar o título" maxlength="80"
                  class="w-full text-[11px] font-semibold text-slate-700 dark:text-white bg-transparent border border-transparent focus:border-[#3d3dff]/30 focus:ring-1 focus:ring-[#3d3dff]/20 rounded px-1 py-0 outline-none cursor-text transition-all"
                  onchange="updateSpecTitle('${frameId}', ${spec._idx}, this.value)"
                  oninput="_updateCharCount(this, 80)"
                  onclick="event.stopPropagation()" />
                <div class="flex items-center justify-between gap-1.5">
                  ${spec.category ? `<span class="inline-flex mt-0.5 px-1.5 py-0.5 rounded-full border ${_ccPill.border} text-[9px] font-bold ${_ccPill.text} ${_ccPill.bg}">${spec.categoryLabel || spec.category}</span>` : `<p class="text-[9px] text-slate-400 dark:text-slate-600 px-1 leading-none">Sem categoria</p>`}
                  <span id="spec-title-${frameId}-${spec._idx}-count" class="text-[8px] font-bold text-slate-300 dark:text-dark-muted shrink-0">${(spec.name || '').length}/80</span>
                </div>
              </div>
              ${hasRawTokenWarning ? `<span title="Valores sem token — use Check Design" class="w-4 h-4 flex items-center justify-center text-amber-400 shrink-0"><i data-lucide="alert-triangle" class="w-3 h-3"></i></span>` : ''}
              <span id="exc-badge-${frameId}-${specIdx}" class="px-1 py-0.5 rounded bg-orange-50 text-[9px] font-bold text-orange-800 shrink-0 ${excCount > 0 ? '' : 'hidden'}">${excCount} exc</span>
              <button type="button" title="Focar no elemento no canvas" aria-label="Focar no elemento no canvas"
                onclick="event.stopPropagation(); focusNode('${spec.id}')"
                class="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-[#3d3dff] transition-colors shrink-0">
                <i data-lucide="locate" class="w-3 h-3"></i>
              </button>
              <button type="button" title="${isHidden ? 'Mostrar' : 'Ocultar'} no canvas"
                aria-label="${isHidden ? 'Mostrar' : 'Ocultar'} no canvas"
                onclick="event.stopPropagation(); toggleSpecVisibility('${frameId}', ${spec._idx})"
                class="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-[#3d3dff] transition-colors shrink-0">
                <i data-lucide="${isHidden ? 'eye-off' : 'eye'}" class="w-3 h-3"></i>
              </button>
              <button type="button" title="${spec.linesHidden ? 'Exibir linhas' : 'Ocultar linhas'}"
                aria-label="${spec.linesHidden ? 'Exibir linhas' : 'Ocultar linhas'}"
                onclick="event.stopPropagation(); toggleSpecItemLines('${frameId}', ${spec._idx})"
                class="w-5 h-5 flex items-center justify-center ${spec.linesHidden ? 'text-gray-400' : 'text-slate-500'} hover:text-[#3d3dff] transition-colors shrink-0">
                <i data-lucide="spline" class="w-3 h-3"></i>
              </button>
              <i data-lucide="chevron-down" id="chev-${detailsId}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0"></i>
              <button type="button" title="Excluir especificação" aria-label="Excluir especificação"
                onclick="event.stopPropagation(); deleteSpecFromFrame('${frameId}', ${spec._idx}, '${spec.id}')"
                class="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </div>
            <!-- Details panel (expandable) -->
            <div id="${detailsId}" data-accordion-content class="hidden px-3 pb-3 pt-2 border-t border-gray-50 dark:border-dark-line rounded-b-xl overflow-hidden">
              ${categoryPill}
              ${propsHtml}
              <!-- Observations -->
              <div class="mb-3">
                <textarea placeholder="Observações sobre esta spec..."
                  class="w-full text-[11px] text-slate-600 dark:text-slate-300 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-line rounded-lg px-2 py-1.5 resize-none outline-none placeholder:text-gray-300 focus:border-[#3d3dff]/30 transition-all"
                  rows="2"
                  onchange="updateSpecObs('${frameId}', ${spec._idx}, this.value)">${spec.obs || ''}</textarea>
              </div>
              <!-- Cenários de Exceção -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <p class="text-[9px] font-bold text-orange-800 uppercase tracking-wider">Cenários de Exceção</p>
                  <div class="flex items-center gap-1.5">
                    ${(spec.excecoes || []).length > 0 ? `
                    <button type="button" onclick="event.stopPropagation(); refreshSpecCardOnCanvas('${frameId}', ${spec._idx})"
                      title="Atualiza o card no Figma com os cenários mapeados"
                      class="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:text-dark-muted bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-dark-line rounded-md hover:bg-slate-100 transition-colors">
                      <i data-lucide="refresh-cw" class="w-2.5 h-2.5"></i> Atualizar card
                    </button>` : ''}
                    <button type="button" onclick="event.stopPropagation(); openSpecException('${frameId}', ${spec._idx})"
                      class="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-orange-800 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-md hover:bg-orange-100 transition-colors">
                      <i data-lucide="plus" class="w-2.5 h-2.5"></i> Cenário
                    </button>
                  </div>
                </div>
                <div id="${excListId}" class="space-y-1">
                  ${excHtml || '<p class="text-[10px] text-slate-400 dark:text-slate-600 italic">Nenhum cenário registrado</p>'}
                </div>
              </div>
            </div>`;

          itemsWrapper.appendChild(item);
        });

        groupEl.appendChild(itemsWrapper);
        list.appendChild(groupEl);
      });

      _refreshIcons();

      // Expand spec sinalizada após adicionar cenário
      const targetId = window._expandSpecIdAfterRender;
      if (targetId) {
        window._expandSpecIdAfterRender = null;
        setTimeout(() => {
          const detailsEl = document.getElementById('spec-details-' + frameId + '-' + (() => {
            const specs = frame.createdSpecs || [];
            return specs.findIndex(s => s.id === targetId);
          })());
          if (detailsEl && detailsEl.classList.contains('hidden')) {
            detailsEl.classList.remove('hidden');
            const chev = document.getElementById('chev-' + detailsEl.id);
            if (chev) chev.style.transform = 'rotate(180deg)';
            detailsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 50);
      }
    }
    window.renderSpecsListForFrame = renderSpecsListForFrame;

    // Close spec-cat-popover when clicking outside
    document.addEventListener('click', function() {
      const pop = document.getElementById('spec-cat-popover');
      if (pop) pop.classList.add('hidden');
      document.querySelectorAll('.spec-overflow-menu-panel').forEach(p => p.classList.add('hidden'));
    });

    function toggleSpecDetails(id) {
      const el = document.getElementById(id);
      if (!el) return;
      const isHidden = el.classList.toggle('hidden');
      const chev = document.getElementById('chev-' + id);
      if (chev) chev.style.transform = isHidden ? '' : 'rotate(180deg)';
      _refreshIcons();
    }
    window.toggleSpecDetails = toggleSpecDetails;

    // _currentExceptionSpecIdx is set in core.js; here we only expose the opener
    function openSpecException(frameId, specIdx) {
      if (typeof openExceptionModal === 'function') openExceptionModal(frameId);
      window._currentExceptionSpecIdx = specIdx; // set AFTER openExceptionModal resets it
    }
    window.openSpecException = openSpecException;

    function openGlobalSpecException(originalIndex) {
      window._globalSpecExceptionIdx = originalIndex;
      window._currentExceptionSpecIdx = null;
      if (typeof openExceptionModal === 'function') openExceptionModal('__global__');
    }
    window.openGlobalSpecException = openGlobalSpecException;

    function deleteGlobalSpecException(specIdx, excIdx) {
      if (!createdSpecs[specIdx]) return;
      if (!createdSpecs[specIdx].excecoes) return;
      createdSpecs[specIdx].excecoes.splice(excIdx, 1);
      saveSpecsToStorage();
      const excListEl = document.getElementById('global-exc-list-' + specIdx);
      if (excListEl) {
        const excs = createdSpecs[specIdx].excecoes;
        excListEl.innerHTML = excs.length
          ? excs.map((exc, ei) => _renderExcItem(exc, `deleteGlobalSpecException(${specIdx}, ${ei})`)).join('')
          : '<p class="text-[10px] text-slate-400 dark:text-slate-600 italic">Nenhum cenário registrado</p>';
        const hdr = excListEl.previousElementSibling;
        if (hdr) {
          const p = hdr.querySelector('p');
          if (p) p.textContent = 'Cenários de Exceção' + (excs.length > 0 ? ' (' + excs.length + ')' : '');
        }
        _refreshIcons();
      }
      if (createdSpecs[specIdx].id) {
        parent.postMessage({ pluginMessage: {
          type: 'refresh-spec-card',
          nodeId: createdSpecs[specIdx].id,
          excecoes: createdSpecs[specIdx].excecoes
        }}, '*');
      }
    }
    window.deleteGlobalSpecException = deleteGlobalSpecException;

    // Nota pós-criação (mesmo padrão de exceção: grava só no dado, sem
    // atualizar o card visual no canvas -- nota já aparecia na ficha via
    // s.note, o que faltava era poder incluir/editar depois da criação).
    function openSpecNoteModal(originalIndex) {
      if (!createdSpecs[originalIndex]) return;
      window._editingSpecNoteIdx = originalIndex;
      const textarea = document.getElementById('spec-note-textarea');
      if (textarea) {
        textarea.value = createdSpecs[originalIndex].note || '';
        _updateCharCount(textarea, 500);
      }
      openModal('spec-note-modal');
    }
    window.openSpecNoteModal = openSpecNoteModal;

    function confirmSpecNote() {
      const idx = window._editingSpecNoteIdx;
      if (typeof idx !== 'number' || !createdSpecs[idx]) return;
      const textarea = document.getElementById('spec-note-textarea');
      createdSpecs[idx].note = textarea ? textarea.value.trim().slice(0, 500) : '';
      saveSpecsToStorage();
      window._expandSpecIdAfterRender = createdSpecs[idx].id;
      if (createdSpecs[idx].id) {
        // refresh-spec-card SEMPRE remove o bloco [Spec] Exceções do card no
        // canvas antes de redesenhar (ver code.js) -- sem reenviar excecoes
        // aqui, o backend nunca recria o bloco, e os cenários já criados
        // "desaparecem" visualmente do card ao editar só a nota.
        parent.postMessage({ pluginMessage: {
          type: 'refresh-spec-card',
          nodeId: createdSpecs[idx].id,
          note: createdSpecs[idx].note,
          excecoes: createdSpecs[idx].excecoes || []
        }}, '*');
      }
      renderSpecsList();
      closeModal('spec-note-modal');
    }
    window.confirmSpecNote = confirmSpecNote;

    function refreshSpecCardOnCanvas(frameId, specIdx) {
      const frame = getFrame(frameId);
      if (!frame) return;
      const spec = (frame.createdSpecs || [])[specIdx];
      if (!spec || !spec.id) { showToast('Spec sem ID de canvas. Recrie a anotação.', 'error'); return; }
      parent.postMessage({ pluginMessage: {
        type: 'refresh-spec-card',
        nodeId: spec.id,
        excecoes: spec.excecoes || [],
        letter: spec.letter || spec.name?.[0] || 'A',
        name: spec.name || ''
      }}, '*');
    }
    window.refreshSpecCardOnCanvas = refreshSpecCardOnCanvas;

    function deleteSpecException(frameId, specIdx, excIdx) {
      const frame = getFrame(frameId);
      if (!frame) return;
      const spec = (frame.createdSpecs || [])[specIdx];
      if (!spec || !spec.excecoes) return;
      spec.excecoes.splice(excIdx, 1);
      saveToStorage();
      const excListEl = document.getElementById('spec-exc-list-' + frameId + '-' + specIdx);
      if (excListEl) {
        excListEl.innerHTML = spec.excecoes.length
          ? spec.excecoes.map((exc, ei) => _renderExcItem(exc, `deleteSpecException('${frameId}', ${specIdx}, ${ei})`)).join('')
          : '<p class="text-[10px] text-slate-400 dark:text-slate-600 italic">Nenhum cenário registrado</p>';
        _refreshIcons();
      }
      const badge = document.getElementById('exc-badge-' + frameId + '-' + specIdx);
      if (badge) {
        badge.textContent = `${spec.excecoes.length} exc`;
        badge.classList.toggle('hidden', spec.excecoes.length === 0);
      }
    }
    window.deleteSpecException = deleteSpecException;

    function updateSpecGroupName(frameId, letter, value) {
      const frame = getFrame(frameId);
      if (!frame) return;
      if (!frame.specGroupNames) frame.specGroupNames = {};
      frame.specGroupNames[letter] = value.trim();
      saveToStorage();
    }
    window.updateSpecGroupName = updateSpecGroupName;

    function toggleSpecGroupVisibility(frameId, letter) {
      const frame = getFrame(frameId);
      if (!frame) return;
      if (!frame.specGroupVisible) frame.specGroupVisible = {};
      const isNowHidden = !(frame.specGroupVisible[letter] === false);
      frame.specGroupVisible[letter] = isNowHidden ? false : true;
      // Toggle visibility of all specs in this group on canvas
      (frame.createdSpecs || []).forEach(spec => {
        if ((spec.letter || '?') === letter && spec.id) {
          parent.postMessage({ pluginMessage: { type: 'hide-node', id: spec.id, forceState: !isNowHidden } }, '*');
        }
      });
      saveToStorage();
      renderSpecsListForFrame(frameId);
    }
    window.toggleSpecGroupVisibility = toggleSpecGroupVisibility;

    // Mesma lógica de toggleSpecLinesVisibility, mas por especificação
    // individual — o toggle do grupo continua existindo pra ocultar tudo de
    // uma vez, este aqui permite ajustar linha a linha dentro do grupo.
    function toggleSpecItemLines(frameId, specIdx) {
      const frame = getFrame(frameId);
      if (!frame) return;
      const spec = (frame.createdSpecs || [])[specIdx];
      if (!spec || !spec.id) return;
      const isNowHidden = !(spec.linesHidden === true);
      spec.linesHidden = isNowHidden;
      parent.postMessage({ pluginMessage: { type: 'hide-spec-lines', specIds: [spec.id], forceState: !isNowHidden } }, '*');
      saveToStorage();
      renderSpecsListForFrame(frameId);
    }
    window.toggleSpecItemLines = toggleSpecItemLines;

    function toggleSpecLinesVisibility(frameId, letter) {
      const frame = getFrame(frameId);
      if (!frame) return;
      if (!frame.specLinesVisible) frame.specLinesVisible = {};
      const isNowHidden = !(frame.specLinesVisible[letter] === false);
      frame.specLinesVisible[letter] = isNowHidden ? false : true;
      const groupSpecs = (frame.createdSpecs || []).filter(spec => (spec.letter || '?') === letter && spec.id);
      // Sincroniza o estado individual de cada spec do grupo — sem isso o
      // ícone por item ficava dizendo "Ocultar linhas" mesmo com as linhas
      // já ocultas via toggle de grupo (e vice-versa ao reexibir).
      groupSpecs.forEach(spec => { spec.linesHidden = isNowHidden; });
      const specIds = groupSpecs.map(spec => spec.id);
      parent.postMessage({ pluginMessage: { type: 'hide-spec-lines', specIds, forceState: !isNowHidden } }, '*');
      saveToStorage();
      renderSpecsListForFrame(frameId);
    }
    window.toggleSpecLinesVisibility = toggleSpecLinesVisibility;

    function toggleSpecGroupLock(frameId, letter) {
      const frame = getFrame(frameId);
      if (!frame) return;
      if (!frame.specGroupLocked) frame.specGroupLocked = {};
      const isNowUnlocked = !(frame.specGroupLocked[letter] === false);
      frame.specGroupLocked[letter] = isNowUnlocked ? false : true;
      const willLock = !isNowUnlocked; // isNowUnlocked=true significa que esta ação DESTRAVOU o grupo
      const groupSpecs = (frame.createdSpecs || []).filter(spec => (spec.letter || '?') === letter && spec.id);
      // Travar via grupo nunca deve pegar specs ainda pendentes de posicionamento inicial —
      // essas só podem ser travadas via "Concluir posicionamento" (lock-spec), para a UI
      // não ficar mostrando "Posicionando…" com o nó já travado no canvas.
      const specIds = groupSpecs
        .filter(spec => !willLock || !spec.pendingConfirmation)
        .map(spec => spec.id);
      if (specIds.length > 0) {
        parent.postMessage({ pluginMessage: { type: 'unlock-spec-group', specIds, locked: !isNowUnlocked } }, '*');
      } else if (willLock) {
        // Nenhuma spec foi de fato travada (todas pendentes) — não fingir que o grupo travou.
        frame.specGroupLocked[letter] = false;
      }
      saveToStorage();
      renderSpecsListForFrame(frameId);
      const skippedPending = willLock && groupSpecs.some(spec => spec.pendingConfirmation);
      showToast(isNowUnlocked
        ? `Grupo ${letter} destravado — edite com cuidado e trave novamente ao concluir.`
        : (skippedPending
          ? `Grupo ${letter} travado — specs ainda pendentes de posicionamento não foram travadas.`
          : `Grupo ${letter} travado novamente.`));
    }
    window.toggleSpecGroupLock = toggleSpecGroupLock;

    function toggleSpecLock(originalIndex) {
      const spec = createdSpecs[originalIndex];
      if (!spec || !spec.id) return;
      const isNowUnlocked = spec.locked !== false;
      spec.locked = isNowUnlocked ? false : true;
      // Travando de volta (willLock=true): manda targetNodeId/color pra
      // backend recalcular o lado da linha a partir de onde o card
      // REALMENTE ficou depois de arrastado (ver _computeSideFromBounds em
      // code.js) -- sem lado escolhido antes de saber onde ia parar.
      const willLock = !isNowUnlocked;
      parent.postMessage({
        pluginMessage: {
          type: 'unlock-spec-group',
          specIds: [spec.id],
          locked: !isNowUnlocked,
          targetNodeId: willLock ? spec.targetNodeId : undefined,
          color: willLock ? spec.color : undefined
        }
      }, '*');
      saveSpecsToStorage();
      renderSpecsList();
      showToast(isNowUnlocked
        ? 'Especificação destravada — edite com cuidado e trave novamente ao concluir.'
        : 'Especificação travada novamente.');
    }
    window.toggleSpecLock = toggleSpecLock;

    // true assim que o usuário troca o estilo manualmente nesse modal --
    // mesmo espírito de _flowConnectorStyleManuallySet (fluxos): a sugestão
    // automática (chega depois, via spec-connector-bounds) só se aplica se
    // ele não tiver decidido antes dela chegar.
    let _editSpecConnectorStyleManuallySet = false;

    function openEditSpecConnectorModal(originalIndex) {
      const spec = createdSpecs[originalIndex];
      if (!spec || !spec.id || !spec.targetNodeId) {
        showToast('Esta especificação não pode ter a linha editada — foi criada antes deste recurso existir ou não tem elemento vinculado.', 'error');
        return;
      }
      window._editingSpecConnectorIndex = originalIndex;
      const style = spec.connectorStyle || 'straight';
      const styleRadio = document.querySelector(`input[name="edit-spec-connector-style"][value="${style}"]`);
      if (styleRadio) styleRadio.checked = true;
      const saveBtn = document.getElementById('edit-spec-connector-save-btn');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Salvar'; }
      openModal('edit-spec-connector-modal');
      _refreshIcons();
      // Pede os bounds atuais (elemento + card já no canvas) pra sugerir
      // Reta/Angular -- só na edição, ver comentário do handler no backend
      // (get-spec-connector-bounds em code.js).
      _editSpecConnectorStyleManuallySet = false;
      parent.postMessage({ pluginMessage: { type: 'get-spec-connector-bounds', specId: spec.id, targetNodeId: spec.targetNodeId } }, '*');
    }
    window.openEditSpecConnectorModal = openEditSpecConnectorModal;

    // Chamada quando a resposta 'spec-connector-bounds' chega do backend
    // (ver messages.js) -- aplica a sugestão só se o modal ainda estiver
    // aberto pra essa mesma spec e o usuário não tiver escolhido manualmente
    // enquanto a resposta viajava.
    function _applySuggestedSpecConnectorStyle(specId, nodeBounds, cardBounds) {
      const idx = window._editingSpecConnectorIndex;
      if (typeof idx !== 'number') return;
      const spec = createdSpecs[idx];
      if (!spec || spec.id !== specId || _editSpecConnectorStyleManuallySet) return;
      if (!nodeBounds || !cardBounds) return;
      const suggested = _suggestConnectorStyleFromBounds(nodeBounds, cardBounds);
      const radio = document.querySelector(`input[name="edit-spec-connector-style"][value="${suggested}"]`);
      if (radio) radio.checked = true;
    }
    window._applySuggestedSpecConnectorStyle = _applySuggestedSpecConnectorStyle;

    function closeEditSpecConnectorModal() {
      window._editingSpecConnectorIndex = null;
      closeModal('edit-spec-connector-modal');
    }
    window.closeEditSpecConnectorModal = closeEditSpecConnectorModal;

    function confirmEditSpecConnector() {
      const idx = window._editingSpecConnectorIndex;
      if (typeof idx !== 'number') return;
      const spec = createdSpecs[idx];
      if (!spec) return;

      const saveBtn = document.getElementById('edit-spec-connector-save-btn');
      if (saveBtn) {
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Salvando...';
        _refreshIcons();
      }

      const styleInput = document.querySelector('input[name="edit-spec-connector-style"]:checked');
      const curvatureInput = document.getElementById('edit-spec-curvature-input');
      const connectorStyle = styleInput ? styleInput.value : 'straight';
      const connectorCurvature = curvatureInput ? Number(curvatureInput.value) || 0 : 0;

      parent.postMessage({
        pluginMessage: {
          type: 'edit-spec-connector',
          specId: spec.id,
          targetNodeId: spec.targetNodeId,
          // Sem guideSide explícito -- deixa o backend recalcular o lado a
          // partir da posição REAL atual do card (ver _computeSideFromBounds
          // em code.js), em vez de reusar o lado salvo desde a criação, que
          // fica obsoleto assim que o card é arrastado pra longe (mesma
          // lógica já usada em toggleSpecLock/unlock-spec-group -- editar
          // o estilo aqui não deveria usar uma premissa diferente).
          color: spec.color || '#2e2ee0',
          connectorStyle,
          connectorCurvature
        }
      }, '*');
    }
    window.confirmEditSpecConnector = confirmEditSpecConnector;

    // Global stores already defined at top: lastMeasurements, createdSpecs



    function updateHideAllSpecsButtonState() {
      const btn = document.getElementById('btn-hide-all-specs');
      if (!btn) return;
      
      const specs = createdSpecs || [];
      if (specs.length === 0) return;
      
      const allHidden = specs.every(s => s.visible === false);
      _specsHidden = allHidden;
      
      btn.textContent = allHidden ? 'Mostrar tudo' : 'Ocultar tudo';
    }

    function updateGroupVisButtonState(letter, groupWrapper) {
      const groupVisBtn = groupWrapper.querySelector('[data-group-vis-btn]');
      if (!groupVisBtn) return;
      
      const specs = createdSpecs.filter(s => (s.letter || 'Sem Tag') === letter);
      const isGroupVisible = specs.some(s => s.visible !== false);
      
      groupVisBtn.innerHTML = isGroupVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
      groupVisBtn.classList.toggle('text-[#2e2ee0]', isGroupVisible);
      groupVisBtn.classList.toggle('text-gray-500', !isGroupVisible);
      
      _refreshIcons();
    }

    function toggleAllSpecsVisibility() {
      const specs = createdSpecs || [];
      if (specs.length === 0) return;
      
      const anyVisible = specs.some(s => s.visible !== false);
      const targetState = !anyVisible;
      
      specs.forEach(s => {
        s.visible = targetState;
        if (s.id) {
          parent.postMessage({ pluginMessage: { type: 'hide-node', id: s.id, forceState: targetState } }, '*');
        }
      });
      
      _specsHidden = !targetState;
      saveSpecsToStorage();
      
      const container = document.getElementById('specs-results');
      if (container) {
        const groupBtns = container.querySelectorAll('[data-group-vis-btn]');
        groupBtns.forEach(gBtn => {
          gBtn.innerHTML = targetState ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
          gBtn.classList.toggle('text-[#2e2ee0]', targetState);
          gBtn.classList.toggle('text-gray-500', !targetState);
        });

        const specBtns = container.querySelectorAll('[data-spec-vis-btn]');
        specBtns.forEach(sBtn => {
          sBtn.innerHTML = targetState ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i>` : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
          sBtn.classList.toggle("text-[#2e2ee0]", targetState);
          sBtn.classList.toggle("text-gray-400", !targetState);
        });
      }
      
      const btn = document.getElementById('btn-hide-all-specs');
      if (btn) btn.textContent = _specsHidden ? 'Mostrar tudo' : 'Ocultar tudo';
      
      _refreshIcons();
    }


    function createAccordionSection(section) {
      const div = document.createElement("div");
      div.className = "mb-3 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl overflow-hidden shadow-sm";

      const count = section.items.length;

      let issuesCount = 0;
      let adjustmentsCount = 0;

      if (isCurrentFrameAuditEnabled()) {
        section.items.forEach(item => {
          const status = computeItemAuditStatus(item);
          item.componentStatus = status;
          if (status === "error") issuesCount++;
          else if (status === "warning") adjustmentsCount++;
        });
      }

      const SEARCH_THRESHOLD = 10;
      const showSearch = count > SEARCH_THRESHOLD;
      const uid = `${section.type}-${Math.random().toString(36).slice(2, 8)}`;
      const searchId = `search-${uid}`;
      const gridId = `grid-${uid}`;
      const emptyId = `empty-${uid}`;

      // Chip button: clicking toggles the status filter on this accordion. When active,
      // it shows an inline X and a highlighted background. Click again (or click the X
      // area, since the whole chip is the button) to clear.
      const chipButton = (status, n, palette) => `
        <button type="button"
                data-chip-status="${status}"
                onclick="event.stopPropagation(); toggleStatusFilter('${gridId}', '${emptyId}', '${searchId}', '${status}', this)"
                title="Filtrar por ${AUDIT_LABEL[status]}"
                aria-pressed="false"
                class="status-chip px-2 py-0.5 rounded-full ${palette} text-[10px] font-bold flex items-center gap-1 cursor-pointer hover:brightness-95 transition-all">
          <span class="chip-count">${n}</span>
          <span class="chip-label">${AUDIT_LABEL[status]}</span>
          <i data-lucide="x" class="chip-x w-3 h-3 hidden"></i>
        </button>`;

      const issuesBadge = issuesCount > 0
        ? chipButton("error", issuesCount, "bg-red-50 dark:bg-red-900/30 text-red-500")
        : "";
      const adjustmentsBadge = adjustmentsCount > 0
        ? chipButton("warning", adjustmentsCount, "bg-amber-50 dark:bg-amber-900/30 text-amber-500")
        : "";
      const badges = (issuesBadge || adjustmentsBadge) ? `<div class="flex gap-1.5 flex-wrap">${issuesBadge}${adjustmentsBadge}</div>` : "";

      const searchHtml = showSearch ? `
        <div class="px-3 pb-2 pt-3 border-b border-gray-50 dark:border-dark-line">
          <div class="relative">
            <i data-lucide="search" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"></i>
            <input
              id="${searchId}"
              type="text"
              placeholder="Buscar em ${section.title}..."
              class="token-search-input w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-line rounded-lg text-[11px] text-slate-700 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-[#3d3dff]/30 focus:border-[#3d3dff] transition-all"
              oninput="filterSpecItems('${gridId}', '${emptyId}', this.value)"
            />
          </div>
        </div>
      ` : "";

      div.innerHTML = `
        <div role="button" tabindex="0" aria-expanded="false" title="Expandir/Recolher" aria-label="Expandir seção"
             onclick="toggleAccordion(this)"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleAccordion(this);}"
             class="w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors cursor-pointer select-none">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-[#3d3dff] dark:text-blue-400 shrink-0">
              <i data-lucide="${section.icon}" class="w-4 h-4"></i>
            </div>
            <div class="flex-1 min-w-0 flex items-center gap-2">
              <p class="text-[13px] font-bold text-slate-800 dark:text-white truncate">${section.title}</p>
              <p class="text-[10px] text-gray-500 dark:text-dark-muted whitespace-nowrap">${count} elementos</p>
            </div>
            <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400 transition-transform shrink-0"></i>
          </div>
          ${badges ? `<div class="mt-2 pl-11">${badges}</div>` : ""}
        </div>
        <div data-accordion-content class="accordion-content hidden border-t border-gray-50 dark:border-dark-line">
          ${searchHtml}
          <div id="${gridId}" class="p-2 grid grid-cols-2 gap-2" data-status-filter="">
            ${section.items.map(item => {
              const itemStatus = item.componentStatus || "";
              return `<div class="spec-item-wrapper col-span-2" data-name="${(item.name || '').toLowerCase().replace(/"/g, '&quot;')}" data-status="${itemStatus}">${createSpecItem(item, section.type)}</div>`;
            }).join("")}
          </div>
          <div id="${emptyId}" class="hidden py-6 text-center text-[11px] text-gray-500 dark:text-gray-400">
            <i data-lucide="search-x" class="w-6 h-6 mx-auto mb-2 text-gray-400 dark:text-gray-600"></i>
            Nenhum item encontrado para esta busca.
          </div>
        </div>
      `;
      return div;
    }

    function filterSpecItems(gridId, emptyId, query) {
      const grid = document.getElementById(gridId);
      const emptyMsg = document.getElementById(emptyId);
      if (!grid) return;

      const term = (typeof query === "string" ? query : "").toLowerCase().trim();
      const statusFilter = grid.getAttribute('data-status-filter') || "";
      const wrappers = grid.querySelectorAll('.spec-item-wrapper');
      let visible = 0;

      wrappers.forEach(wrapper => {
        const name = wrapper.getAttribute('data-name') || '';
        const status = wrapper.getAttribute('data-status') || '';
        const matchName = !term || name.includes(term);
        const matchStatus = !statusFilter || status === statusFilter;
        const show = matchName && matchStatus;
        wrapper.style.display = show ? '' : 'none';
        if (show) visible++;
      });

      if (emptyMsg) {
        const hasAnyFilter = term || statusFilter;
        emptyMsg.classList.toggle('hidden', visible > 0 || !hasAnyFilter);
      }
    }
    window.filterSpecItems = filterSpecItems;

    // Toggle a status filter for the chip clicked. If clicking the active chip,
    // clears the filter. Auto-opens the accordion when activating a filter so
    // the user can see the filtered items immediately.
    function toggleStatusFilter(gridId, emptyId, searchId, status, chipEl) {
      const grid = document.getElementById(gridId);
      if (!grid) return;

      const currentFilter = grid.getAttribute('data-status-filter') || "";
      const newFilter = currentFilter === status ? "" : status;
      grid.setAttribute('data-status-filter', newFilter);

      // Update chip states across this accordion's header
      const accordionRoot = chipEl.closest('.mb-3');
      if (accordionRoot) {
        accordionRoot.querySelectorAll('.status-chip').forEach(chip => {
          const chipStatus = chip.getAttribute('data-chip-status');
          const isActive = newFilter && chipStatus === newFilter;
          chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          chip.classList.toggle('chip-active', isActive);
          chip.classList.toggle('ring-2', isActive);
          chip.classList.toggle('ring-offset-1', isActive);
          chip.classList.toggle('dark:ring-offset-dark-surface', isActive);
          if (chipStatus === "error") chip.classList.toggle('ring-red-400', isActive);
          if (chipStatus === "warning") chip.classList.toggle('ring-amber-400', isActive);
          const xIcon = chip.querySelector('.chip-x');
          if (xIcon) xIcon.classList.toggle('hidden', !isActive);
        });
      }

      // Auto-open accordion if collapsed
      if (newFilter && accordionRoot) {
        const content = accordionRoot.querySelector('[data-accordion-content]');
        const toggleBtn = accordionRoot.querySelector('button[onclick*="toggleAccordion"]');
        if (content && content.classList.contains('hidden') && toggleBtn) {
          toggleAccordion(toggleBtn);
        }
      }

      // Reapply filter, preserving the search term
      const searchInput = searchId ? document.getElementById(searchId) : null;
      filterSpecItems(gridId, emptyId, searchInput ? searchInput.value : "");

      _refreshIcons();
    }
    window.toggleStatusFilter = toggleStatusFilter;

    function createSpecItem(item, type) {
      let preview = "";
      if (item.preview) {
        const base64 = bytesToBase64(item.preview);
        preview = `<img src="data:image/png;base64,${base64}" class="w-8 h-8 object-contain bg-gray-50 dark:bg-dark-bg rounded p-1" />`;
      } else {
        const iconName = type === "components" ? "box" : type === "icons" ? "image" : type === "typography" ? "type" : type === "frames" ? "layout" : "pen-tool";
        preview = `<div class="w-8 h-8 flex items-center justify-center bg-gray-50 dark:bg-dark-bg rounded text-gray-400"><i data-lucide="${iconName}" class="w-4 h-4"></i></div>`;
      }

      const status = item.componentStatus || (item.isDS === true ? "ok" : (item.isDS === "warning" ? "warning" : "error"));
      const dsStatus = isCurrentFrameAuditEnabled() ? (status === "ok" ?
        `<span class="flex items-center gap-1 text-[#10b981]"><i data-lucide="check-circle" class="w-2.5 h-2.5"></i>EM CONFORMIDADE</span>` :
        (status === "warning" ?
          `<span class="flex items-center gap-1 text-amber-500 font-bold"><i data-lucide="help-circle" class="w-2.5 h-2.5"></i>NECESSITA REVISÃO</span>` :
          `<span class="flex items-center gap-1 text-red-400 font-bold"><i data-lucide="alert-circle" class="w-2.5 h-2.5"></i>FORA DO PADRÃO</span>`)) : "";

      // ── Prop split: "applied" (active) vs "inactive" (false/none variants) ──
      // Variant props with boolean-false or "none" values mean the feature is OFF
      // and are not relevant to the dev. Non-variant props are already filtered
      // at extraction time (value > 0, visible, etc.) so they're always applied.
      const INACTIVE_VALUES = new Set(['false', 'none', 'off', 'no', 'nenhum', 'sem', '']);
      const allProps = item.properties || [];
      const appliedProps = allProps.filter(p => {
        if (p.type === 'variant') return !INACTIVE_VALUES.has(String(p.value).toLowerCase().trim());
        return true;
      });
      const inactiveProps = allProps.filter(p =>
        p.type === 'variant' && INACTIVE_VALUES.has(String(p.value).toLowerCase().trim())
      );
      const inactiveCount = inactiveProps.length;
      const uid = `sp-${String(item.nodeId || Math.random()).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;

      function renderActivePropsList(props) {
        if (!props || props.length === 0) return '';
        let html = `<div class="mt-2 space-y-1 border-t border-gray-100 dark:border-dark-line pt-2">`;
        props.forEach(p => {
          const pStatus = isCurrentFrameAuditEnabled() ?
            (p.isDS === true ? `<span class="text-[#10b981] shrink-0"><i data-lucide="check" class="w-3 h-3"></i></span>` :
             (p.isDS === "warning" ? `<span class="text-amber-500 shrink-0"><i data-lucide="alert-triangle" class="w-3 h-3"></i></span>` :
              `<span class="text-red-400 shrink-0"><i data-lucide="x" class="w-3 h-3"></i></span>`)) : "";

          let icon = "circle";
          if (p.type === "spacing") icon = "move-horizontal";
          else if (p.type === "typography") icon = "type";
          else if (p.type === "strokeWeight") icon = "maximize";
          else if (p.type === "radius") icon = "corner-up-left";
          else if (p.type === "layout") icon = "box";
          else if (p.type === "variant") icon = "layers";
          else if (p.type === "effect") icon = "sparkles";
          else if (p.type === "color" || p.type === "stroke") icon = "palette";

          const colorPrev = (p.type === "color" || p.type === "stroke") ?
            `<div class="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" style="background-color: ${p.value}"></div>` :
            `<i data-lucide="${icon}" class="w-3 h-3 text-gray-500 dark:text-gray-400 shrink-0"></i>`;

          const hasToken = p.name && p.name !== p.value && p.name.includes('/');
          const chainSegments = hasToken ? p.name.split('/').map(s => s.trim()).filter(Boolean) : [];
          const chainHtml = hasToken
            ? chainSegments.map((seg, i) => {
                const isLast = i === chainSegments.length - 1;
                return isLast
                  ? `<span class="font-bold text-[#3d3dff] dark:text-blue-400">${seg}</span>`
                  : `<span class="text-gray-500 dark:text-gray-400">${seg}</span><span class="text-gray-500 dark:text-gray-400 mx-0.5">›</span>`;
              }).join('')
            : '';

          const tooltipText = hasToken
            ? `Valor bruto: ${p.value}\nToken: ${p.name}`
            : p.value;

          const valueDisplay = hasToken
            ? `<span class="flex items-center gap-0.5 flex-wrap leading-tight">${chainHtml}</span>`
            : `<span class="font-bold text-slate-700 dark:text-gray-200">${p.value}</span>`;

          const clickAttr = item.nodeId
            ? `onclick="focusNode('${item.nodeId}')" title="${tooltipText}\n\nClique para focar no elemento no Figma" style="cursor:pointer"`
            : `title="${tooltipText}"`;
          html += `<div class="flex items-center justify-between gap-1 text-[9px] text-gray-600 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-dark-bg/50 px-0.5 -mx-0.5 transition-colors" ${clickAttr}>
            <div class="flex items-center gap-1.5 min-w-0">
              <div class="w-3 h-3 flex items-center justify-center shrink-0">${colorPrev}</div>
              <span class="flex items-center gap-1 flex-wrap min-w-0">
                <span class="text-gray-600 dark:text-gray-300 shrink-0">${p.label || p.type}:</span>
                ${valueDisplay}
              </span>
            </div>
            ${pStatus}
          </div>`;
        });
        html += `</div>`;
        return html;
      }

      function renderInactivePropsList(props) {
        if (!props || props.length === 0) return '';
        // Inactive props get a distinct visual treatment: dashed border, muted
        // background, slash icon and strikethrough value — clearly "off" at a glance.
        let html = `<div class="mt-1 space-y-0.5 pt-1 border-t border-dashed border-gray-200 dark:border-dark-line">
          <p class="text-[8px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-600 mb-1">Não aplicadas</p>`;
        props.forEach(p => {
          html += `<div class="flex items-center gap-1.5 text-[9px] text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-dark-bg/20 rounded px-1.5 py-0.5">
            <i data-lucide="minus-circle" class="w-2.5 h-2.5 shrink-0"></i>
            <span class="truncate line-through">${p.label || p.type}: ${p.value}</span>
          </div>`;
        });
        html += `</div>`;
        return html;
      }

      const appliedHtml = renderActivePropsList(appliedProps);

      // Expanded section shows ONLY the inactive props (applied ones stay visible above)
      const inactiveHtml = inactiveCount > 0
        ? `<div id="${uid}-inactive" class="hidden">${renderInactivePropsList(inactiveProps)}</div>`
        : '';

      const toggleLabel = `${inactiveCount} prop${inactiveCount > 1 ? 's' : ''} inativa${inactiveCount > 1 ? 's' : ''}`;
      const toggleHtml = inactiveCount > 0
        ? `<button id="${uid}-btn"
            onclick="event.stopPropagation();
              var d=document.getElementById('${uid}-inactive');
              var isHidden=d.classList.contains('hidden');
              d.classList.toggle('hidden');
              this.innerHTML = isHidden
                ? '<i data-lucide=\\'chevron-up\\' class=\\'w-2.5 h-2.5\\'></i> Ocultar inativas'
                : '<i data-lucide=\\'eye-off\\' class=\\'w-2.5 h-2.5\\'></i> ${toggleLabel}';
              _refreshIcons()"
            class="mt-1.5 flex items-center gap-1 text-[9px] text-gray-500 dark:text-gray-400 hover:text-[#3d3dff] dark:hover:text-blue-400 transition-colors font-medium">
            <i data-lucide="eye-off" class="w-2.5 h-2.5"></i>
            ${toggleLabel}
          </button>`
        : '';

      return `
        <div role="button" tabindex="0" class="col-span-2 p-2 border border-gray-100 dark:border-dark-line rounded-lg bg-gray-50/50 dark:bg-dark-bg/50 cursor-pointer hover:border-[#3d3dff] hover:shadow-sm transition-all active:scale-[0.98] group" onclick="focusNode('${item.nodeId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();focusNode('${item.nodeId}');}" title="Focar no elemento no Figma" aria-label="Focar em ${escapeHtml(item.name)} no Figma">
          <div class="flex items-center gap-2 mb-1 pointer-events-none">
            ${preview}
            <div class="flex-1 min-w-0">
              <p class="text-[10px] font-bold text-slate-700 dark:text-white truncate group-hover:text-[#3d3dff] transition-colors">${item.name}</p>
              <div class="text-[9px] uppercase tracking-wider font-medium">
                ${dsStatus}
              </div>
            </div>
            <i data-lucide="locate" class="w-3 h-3 text-gray-400 dark:text-gray-600 group-hover:text-[#3d3dff] dark:group-hover:text-blue-400 transition-colors shrink-0"></i>
          </div>
          ${appliedHtml}
          ${inactiveHtml}
          ${toggleHtml}
        </div>
      `;
    }


    function executeUnifiedSpec() {
      const g = id => document.getElementById(id);
      const chk = id => { const el = g(id); return el ? el.checked : false; };
      const opts = {
        category: g('ann-category').value,
        letter: g('spec-letter-input') ? g('spec-letter-input').value.slice(0, 8) : "A",
        link: g('spec-link-input') ? g('spec-link-input').value : "",
        note: g('ann-note') ? g('ann-note').value.slice(0, 500) : "",
        include: {
          height: chk('ann-height'),
          width: chk('ann-width'),
          minHeight: chk('ann-min-height'),
          maxHeight: chk('ann-max-height'),
          minWidth: chk('ann-min-width'),
          maxWidth: chk('ann-max-width'),
          direction: chk('ann-direction'),
          alignment: chk('ann-alignment'),
          gap: chk('ann-gap'),
          padding: chk('ann-padding'),
          radius: chk('ann-radius'),
          opacity: chk('ann-opacity'),
          fill: chk('ann-fill'),
          stroke: chk('ann-stroke'),
          strokeWidth: chk('ann-stroke-width'),
          effects: chk('ann-effects'),
          fontFamily: chk('ann-font-family'),
          fontSize: chk('ann-font-size'),
          fontWeight: chk('ann-font-weight'),
          fontStyle: chk('ann-font-style'),
          lineHeight: chk('ann-line-height'),
          letterSpacing: chk('ann-letter-spacing'),
          mainComponent: chk('ann-main-component'),
        }
      };
      parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
    }

    

    function toggleAllAnnotationProps(btn) {
      const checkboxes = document.querySelectorAll('#ann-scroll-container input[type="checkbox"][id^="ann-"]');
      const anyChecked = Array.from(checkboxes).some(c => c.checked);
      checkboxes.forEach(c => c.checked = !anyChecked);
      btn.textContent = anyChecked ? 'Marcar tudo' : 'Desmarcar tudo';
    }

    function togglePropGroup(btn) {
      const group = btn.nextElementSibling;
      if (!group) return;
      const icon = btn.querySelector('[data-lucide="chevron-down"]');
      const isOpen = !group.classList.contains('hidden');
      group.classList.toggle('hidden', isOpen);
      if (icon) icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    }


    // ── Category Colors ──────────────────────────────────────────────────
    const CATEGORY_COLORS = {
      'comportamento':  { fill: '#F8EAF3', stroke: '#93537D' },
      'regra':          { fill: '#E5F5F8', stroke: '#008CB2' },
      'info':           { fill: '#EBF1F2', stroke: '#64747A' },
      'api':            { fill: '#F5FEC1', stroke: '#6D8000' },
    };
    const _CAT_FALLBACK_PALETTE = [
      '#7C3AED','#0891B2','#059669','#D97706','#DC2626',
      '#4F46E5','#DB2777','#065F46','#92400E','#1D4ED8',
    ];

    function getCategoryColor(value) {
      if (!value) return '#2e2ee0';
      const pair = CATEGORY_COLORS[value];
      if (pair) return pair.stroke;
      const idx = annCategories.findIndex(c => c.value === value);
      return _CAT_FALLBACK_PALETTE[idx >= 0 ? idx % _CAT_FALLBACK_PALETTE.length : 0];
    }

    function getCategoryFill(value) {
      if (!value) return '#EBF4FB';
      const pair = CATEGORY_COLORS[value];
      if (pair) return pair.fill;
      const stroke = getCategoryColor(value);
      const h = stroke.replace('#', '');
      const lr = Math.round(parseInt(h.slice(0,2),16)*0.10 + 255*0.90).toString(16).padStart(2,'0');
      const lg = Math.round(parseInt(h.slice(2,4),16)*0.10 + 255*0.90).toString(16).padStart(2,'0');
      const lb = Math.round(parseInt(h.slice(4,6),16)*0.10 + 255*0.90).toString(16).padStart(2,'0');
      return `#${lr}${lg}${lb}`;
    }

    function syncSpecColorFromCategory() {
      const catEl    = document.getElementById('ann-category');
      const colorIn  = document.getElementById('spec-color-input');
      const swatch   = document.getElementById('spec-color-swatch');
      const color    = getCategoryColor(catEl ? catEl.value : '');
      if (colorIn) colorIn.value = color;
      if (swatch)  swatch.style.backgroundColor = color;
    }
    window.getCategoryColor          = getCategoryColor;
    window.getCategoryFill           = getCategoryFill;
    window.syncSpecColorFromCategory = syncSpecColorFromCategory;

    // ── Category Management ──────────────────────────────────────────────
    // 4 categorias oficiais (ver docs/Anotar Specs — Tipo de especificação):
    // Cenário de exceção não é uma delas -- é tratado como conceito próprio
    // no plugin (array spec.excecoes[]), não como valor de spec.category.
    const DEFAULT_CATEGORIES = [
      { label: "Informação extra", value: "info" },
      { label: "Comportamento", value: "comportamento" },
      { label: "Regra de Negócio", value: "regra" },
      { label: "Dados da API", value: "api" },
    ];

    // Load from localStorage or use defaults
    let annCategories = (() => {
      try {
        const saved = localStorage.getItem('handex-ann-categories-v2');
        return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES.slice();
      } catch (e) { return DEFAULT_CATEGORIES.slice(); }
    })();

    function saveCategories() {
      try { localStorage.setItem('handex-ann-categories-v2', JSON.stringify(annCategories)); } catch (e) { }
    }

    function renderCategoryDropdown() {
      const sel = document.getElementById('ann-category');
      const current = sel ? sel.value : '';
      if (sel) {
        sel.innerHTML = '<option value="">Sem categoria</option>';
        annCategories.forEach(cat => {
          const opt = document.createElement('option');
          opt.value = cat.value;
          opt.textContent = cat.label;
          if (cat.value === current) opt.selected = true;
          sel.appendChild(opt);
        });
      }
      if (typeof _csSyncPanel === 'function') _csSyncPanel('cs-ann-cat');
    }

    function renderCategoryList() {
      const list = document.getElementById('cat-list');
      list.innerHTML = '';
      if (annCategories.length === 0) {
        list.innerHTML = '<p class="text-[11px] text-gray-500 text-center py-3">Nenhuma categoria. Adicione abaixo.</p>';
        return;
      }
      annCategories.forEach((cat, idx) => {
        const color = getCategoryColor(cat.value);
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-dark-bg/30 group';
        row.innerHTML = `
          <span class="w-2.5 h-2.5 rounded-full shrink-0 mr-2" style="background-color:${color}"></span>
          <input type="text" value="${cat.label}"
            class="flex-1 text-[12px] text-slate-700 dark:text-dark-text bg-transparent outline-none focus:bg-gray-50 dark:focus:bg-dark-bg rounded px-1 py-0.5"
            onchange="renameCategory(${idx}, this.value)" />
          <button onclick="deleteCategory(${idx})" title="Remover" aria-label="Remover categoria"
            class="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>`;
        list.appendChild(row);
      });
      _refreshIcons();
    }

    function toggleCategoryManager() {
      const panel = document.getElementById('category-manager');
      const isHidden = panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !isHidden);
      if (isHidden) renderCategoryList();
    }

    function addCategory() {
      const input = document.getElementById('cat-new-input');
      const label = (input.value || '').trim();
      if (!label) return;
      const value = label.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      if (annCategories.some(c => c.value === value)) {
        input.value = '';
        return;
      }
      annCategories.push({ label, value });
      saveCategories();
      renderCategoryDropdown();
      renderCategoryList();
      input.value = '';
    }

    function deleteCategory(idx) {
      annCategories.splice(idx, 1);
      saveCategories();
      renderCategoryDropdown();
      renderCategoryList();
    }

    function renameCategory(idx, newLabel) {
      const label = newLabel.trim();
      if (!label) return;
      annCategories[idx].label = label;
      saveCategories();
      renderCategoryDropdown();
    }

    // Initialize categories on load
    document.addEventListener('DOMContentLoaded', () => {
      renderCategoryDropdown();
    });


    function exportSpecsToMd() {
      if (!createdSpecs || createdSpecs.length === 0) return;

      const dateStr = new Date().toLocaleString('pt-BR');
      let md = `# Handex \u2014 Especifica\u00e7\u00f5es de Projeto\n_Exportado em: ${dateStr}_\n\n---\n\n`;

      createdSpecs.forEach((item, idx) => {
        md += `### [${item.letter}] ${item.name}\n`;
        md += `**Tipo:** ${item.type}\n\n`;
        md += `---\n\n`;
      });

      md += `_Gerado pelo plugin HANDEX \u2014 Handoff Express_\n`;

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `handex-especificacoes-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
    // Drop-zone simulation
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (e) => {
          const count = e.target.files.length;
          document.getElementById('file-count').innerText = count > 0 ? `${count} arquivos selecionados` : 'Arraste ou clique para anexar';
        };
        input.click();
      };
    }

    function requestSpecProperties() {
      if (!validateSpecLetterInput()) return;
      parent.postMessage({ pluginMessage: { type: 'request-spec-properties' } }, '*');
    }

    function closeSpecPropertiesModal() {
      document.getElementById('spec-properties-modal').classList.add('hidden');
    }

    function _toggleSpecConnectionCurvature(drawConnection) {
      const container = document.getElementById('spec-connection-curvature-container');
      if (container) container.classList.toggle('hidden', !drawConnection);
    }
    window._toggleSpecConnectionCurvature = _toggleSpecConnectionCurvature;

    function _collectSpecPropertiesOpts() {
      const g = id => document.getElementById(id);
      const selCat = g('ann-category');

      const styleEl = document.querySelector('input[name="spec-connector-style"]:checked');
      const curvatureInput = g('spec-curvature-input');

      const opts = {
        category: selCat ? selCat.value : "",
        categoryLabel: selCat && selCat.options[selCat.selectedIndex] ? selCat.options[selCat.selectedIndex].text : "",
        letter: g('spec-letter-input') ? g('spec-letter-input').value.toUpperCase().slice(0, 8) : "A",
        color: g('spec-color-input') ? g('spec-color-input').value : "#2e2ee0",
        fillColor: getCategoryFill(selCat ? selCat.value : ""),
        link: g('spec-link-input') ? g('spec-link-input').value : "",
        note: g('ann-note') ? g('ann-note').value.slice(0, 500) : "",
        // Sempre nasce à direita do elemento -- usuário não escolhe mais o
        // lado antes de saber onde vai posicionar o card (ver
        // toggleSpecLock/unlock-spec-group em code.js, que recalculam o
        // lado real da linha a partir de onde o card fica ao ser travado).
        // Ignorado quando pinnedPosition vem do marcador de posição (ver
        // abaixo) -- nesse caso a spec já nasce exatamente ali.
        guideSide: "right",
        drawConnection: g('chk-draw-connection') ? g('chk-draw-connection').checked : true,
        connectorStyle: styleEl ? styleEl.value : 'straight',
        connectorCurvature: curvatureInput ? Number(curvatureInput.value) || 0 : 0,
        properties: []
      };

      // targetNodeId sempre presente (capturado na abertura do modal, ver
      // openSpecFormModal) -- não zera aqui: markSpecPosition ainda
      // precisa dele na etapa seguinte (Exceção, a última do fluxo).
      // pinnedPosition só existe se o usuário já marcou a posição ANTES de
      // avançar pra Propriedades, o que hoje não é possível (o botão só
      // existe na última etapa) -- mantido por robustez caso isso mude.
      if (window._pendingSpecTargetNodeId) {
        opts.targetNodeId = window._pendingSpecTargetNodeId;
      }
      if (window._pendingSpecPosition) {
        opts.pinnedPosition = window._pendingSpecPosition;
      }

      const checkboxes = document.querySelectorAll('#spec-properties-list input[type="checkbox"]:checked');
      checkboxes.forEach(chk => {
        const propKey = chk.value;
        const propData = currentScannedProps.find(p => p.key === propKey);
        if (propData) {
          opts.properties.push(propData);
        }
      });

      return opts;
    }

    // Propriedades -> Posição (etapa própria, ver spec-position-modal em
    // modals.html) -- opts fica congelado aqui; markSpecPosition/
    // finalizeSpecCreation ainda podem somar pinnedPosition depois.
    function advanceToSpecPositionStep() {
      window._pendingSpecOpts = _collectSpecPropertiesOpts();
      closeSpecPropertiesModal();
      openSpecPositionModal();
    }
    window.advanceToSpecPositionStep = advanceToSpecPositionStep;

    // Chegar nesta etapa já É a ação de marcar -- sem posição ainda
    // pendente, abre o modal (visível, ver spec-position-modal em
    // modals.html) e já dispara markSpecPosition() direto, sem exigir um
    // clique extra em "Marcar posição no canvas". Se o usuário já
    // confirmou uma posição antes (ex: voltou da etapa de Exceção), só
    // mostra o estado "confirmado" -- não recria o fantasma à toa.
    function openSpecPositionModal() {
      openModal('spec-position-modal');
      if (!window._pendingSpecPosition) {
        markSpecPosition();
      } else {
        _renderSpecPositionState('idle');
      }
    }

    function backToSpecPropertiesFromPosition() {
      closeSpecPositionModal();
      document.getElementById('spec-properties-modal').classList.remove('hidden');
      if (typeof _persistentFocus === 'function') {
        _persistentFocus(document.querySelector('#spec-properties-modal ' + FOCUSABLE_SELECTOR));
      }
    }
    window.backToSpecPropertiesFromPosition = backToSpecPropertiesFromPosition;

    function closeSpecPositionModal() {
      closeModal('spec-position-modal');
    }
    window.closeSpecPositionModal = closeSpecPositionModal;

    // Posição -> Exceção (etapa final, opcional).
    function advanceToSpecExceptionStep() {
      closeSpecPositionModal();
      window._newSpecExceptionType = null;
      const g = id => document.getElementById(id);
      document.querySelectorAll('.new-exc-type-btn').forEach(b => b.classList.remove('border-red-300', 'border-green-300', 'border-blue-300', 'border-amber-300', 'bg-red-50', 'bg-green-50', 'bg-blue-50', 'bg-amber-50'));
      if (g('new-exc-titulo')) { g('new-exc-titulo').value = ''; _updateCharCount(g('new-exc-titulo'), 80); }
      if (g('new-exc-obs')) { g('new-exc-obs').value = ''; _updateCharCount(g('new-exc-obs'), 400); }
      openModal('spec-new-exception-modal');
    }
    window.advanceToSpecExceptionStep = advanceToSpecExceptionStep;

    function backToSpecPositionFromException() {
      closeSpecNewExceptionModal();
      openSpecPositionModal();
    }
    window.backToSpecPositionFromException = backToSpecPositionFromException;

    function closeSpecNewExceptionModal() {
      closeModal('spec-new-exception-modal');
    }
    window.closeSpecNewExceptionModal = closeSpecNewExceptionModal;

    const NEW_EXC_TYPE_BORDER = { 'Erro': 'border-red-300', 'Sucesso': 'border-green-300', 'Confirmação': 'border-blue-300', 'Alerta': 'border-amber-300' };
    function selectNewSpecExceptionType(type) {
      window._newSpecExceptionType = type;
      document.querySelectorAll('.new-exc-type-btn').forEach(b => {
        b.classList.remove('border-red-300', 'border-green-300', 'border-blue-300', 'border-amber-300');
        b.classList.add('border-gray-100');
      });
      const btn = document.getElementById(`new-exc-type-${type}`);
      if (btn) {
        btn.classList.remove('border-gray-100');
        btn.classList.add(NEW_EXC_TYPE_BORDER[type] || 'border-gray-100');
      }
    }
    window.selectNewSpecExceptionType = selectNewSpecExceptionType;

    function finalizeSpecCreation() {
      const opts = window._pendingSpecOpts;
      if (!opts) { closeSpecNewExceptionModal(); return; }

      const titulo = document.getElementById('new-exc-titulo') ? document.getElementById('new-exc-titulo').value.trim().slice(0, 80) : '';
      const type = window._newSpecExceptionType;
      if (type && titulo) {
        opts.excecaoInicial = {
          tipo: type,
          titulo: titulo,
          obs: document.getElementById('new-exc-obs') ? document.getElementById('new-exc-obs').value.trim().slice(0, 400) : ''
        };
      }

      // pinnedPosition/targetNodeId podem ter sido definidos DEPOIS de
      // _collectSpecPropertiesOpts já ter congelado window._pendingSpecOpts
      // -- markSpecPosition só existe nesta última etapa (Exceção), então
      // precisa ser lido aqui, no envio real, antes de closeSpecFormModal
      // zerar esse estado.
      if (window._pendingSpecPosition) opts.pinnedPosition = window._pendingSpecPosition;
      if (window._pendingSpecTargetNodeId) opts.targetNodeId = window._pendingSpecTargetNodeId;

      closeSpecNewExceptionModal();
      closeSpecFormModal();
      parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');

      window._pendingSpecOpts = null;
      window._newSpecExceptionType = null;
    }
    window.finalizeSpecCreation = finalizeSpecCreation;

    function renderSpecsList() {
      const list = document.getElementById('specs-results');
      if (!list) return;
      list.innerHTML = '';
      
      _updateContentHint('hint-specs', !!(createdSpecs && createdSpecs.length > 0));

      const exportBtn = document.getElementById('btn-export-specs');
      const hideAllBtn = document.getElementById('btn-hide-all-specs');
      const collapseBtn = document.querySelector('#view-specifications [data-collapse-toggle]');
      const finalizeWrap = document.getElementById('btn-finalize-specs-wrap');
      const sectionTitle = document.getElementById('specs-section-title');

      if (!createdSpecs || createdSpecs.length === 0) {
        list.innerHTML = `
          <li class="empty-state-placeholder flex flex-col items-center list-none">
            <div class="relative mb-4">
              <i data-lucide="file-text" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
            </div>
            <p class="text-[12px] font-bold text-slate-500 dark:text-dark-muted text-center px-4 mb-1">Nenhuma especificação criada ainda</p>
            <p class="text-[10px] text-slate-400 dark:text-dark-muted text-center px-6">Selecione um elemento no canvas e toque em <button type="button" onclick="openSpecFormModal()" class="font-bold text-[#2e2ee0] dark:text-[#4da3e0] hover:underline">Nova spec</button></p>
          </li>
        `;
        if (exportBtn) exportBtn.classList.add('hidden');
        if (hideAllBtn) hideAllBtn.classList.add('hidden');
        if (collapseBtn) collapseBtn.classList.add('hidden');
        if (finalizeWrap) finalizeWrap.classList.add('hidden');
        if (sectionTitle) sectionTitle.classList.add('hidden');
        _refreshIcons();
        return;
      }
      if (exportBtn) exportBtn.classList.remove('hidden');
      if (hideAllBtn) hideAllBtn.classList.remove('hidden');
      if (collapseBtn) collapseBtn.classList.remove('hidden');
      if (finalizeWrap) finalizeWrap.classList.remove('hidden');
      if (sectionTitle) {
        sectionTitle.classList.remove('hidden');
        sectionTitle.textContent = `Specs Criadas (${createdSpecs.length})`;
      }

      // Agrupar especificações por letra (Tag)
      const groupedSpecs = {};
      createdSpecs.forEach((spec, idx) => {
        if (!spec) return;
        const letter = spec.letter || 'Sem Tag';
        if (!groupedSpecs[letter]) groupedSpecs[letter] = [];
        const specCopy = Object.assign({}, spec);
        specCopy.originalIndex = idx;
        groupedSpecs[letter].push(specCopy);
      });

      // Renderizar cada grupo
      Object.keys(groupedSpecs).sort().forEach(letter => {
        const specs = groupedSpecs[letter];
        const groupColor = specs[0].color || '#2e2ee0';
        
        // Contêiner do Grupo
        const groupWrapper = document.createElement('li');
        // overflow-hidden fica só no corpo (groupContent), não aqui -- este
        // wrapper contém o header com o menu "..." (position: absolute), e
        // overflow-hidden aqui cortava o menu quando o accordion estava
        // recolhido (corpo com altura mínima, pouca margem antes do corte).
        groupWrapper.className = 'mb-4 border-l-4 rounded-r-xl bg-gray-50/30 dark:bg-slate-900/20';
        groupWrapper.style.borderColor = groupColor;

        // Cabeçalho do Grupo — nome, ações e chevron na mesma linha
        const groupHeader = document.createElement('div');
        groupHeader.className = 'p-3 flex items-center gap-2 bg-gray-100/50 dark:bg-slate-800/50 rounded-tr-xl';

        const headerInfo = document.createElement('div');
        headerInfo.className = 'flex items-center gap-3 cursor-pointer flex-1 overflow-hidden min-w-0';
        
        const currentGroupName = (handoffData.tagNames && handoffData.tagNames[letter]) ? handoffData.tagNames[letter] : `Grupo Tag ${letter}`;

        headerInfo.innerHTML = `
          <div class="w-7 h-7 rounded flex items-center justify-center text-[11px] font-bold text-white shrink-0" style="background-color: ${groupColor}">
            ${letter}
          </div>
          <div class="flex flex-col overflow-hidden flex-1">
             <div class="flex items-center gap-1.5 overflow-hidden">
               <span class="text-[12px] font-bold text-slate-700 dark:text-slate-200 group-title-text truncate">${currentGroupName}</span>
               <button type="button" title="Renomear grupo" aria-label="Renomear grupo" class="edit-group-btn p-1 text-gray-500 hover:text-[#2e2ee0] transition-colors shrink-0">
                 <i data-lucide="pencil" class="w-3 h-3"></i>
               </button>
             </div>
             <span class="text-[10px] text-slate-500 dark:text-dark-muted">${specs.length} item(ns)</span>
          </div>
        `;

        // Edição de Nome do Grupo (Via Ícone de Lápis)
        const editBtn = headerInfo.querySelector('.edit-group-btn');
        const titleSpan = headerInfo.querySelector('.group-title-text');
        
        editBtn.onclick = (e) => {
          e.stopPropagation();
          const currentVal = titleSpan.innerText;
          const input = document.createElement('input');
          input.type = 'text';
          input.value = currentVal;
          input.maxLength = 24;
          input.className = 'text-[12px] font-bold text-slate-800 dark:text-white bg-white dark:bg-slate-700 border border-blue-400 rounded px-1 w-full outline-none';
          
          titleSpan.parentElement.replaceWith(input);
          input.focus();
          input.select();

          let isFinalized = false;

          const saveNewName = () => {
            if (isFinalized) return;
            isFinalized = true;
            // maxlength=24 no HTML não protege contra paste -- trunca de
            // novo aqui, mesmo padrão usado nos outros campos do plugin.
            const newVal = input.value.trim().slice(0, 24) || `Grupo Tag ${letter}`;
            if (!handoffData.tagNames) handoffData.tagNames = {};
            handoffData.tagNames[letter] = newVal;
            saveToStorage();
            renderSpecsList();
          };

          // Evitar que cliques dentro do input de renomear fechem/abram o acordeão do grupo
          input.onclick = (ev) => ev.stopPropagation();
          input.onmousedown = (ev) => ev.stopPropagation();

          input.onblur = saveNewName;
          input.onkeydown = (ev) => {
            if (ev.key === 'Enter') {
              saveNewName();
            }
            if (ev.key === 'Escape') {
              isFinalized = true; // Impede salvar ao perder o foco (blur) provocado pelo render
              renderSpecsList();
            }
          };
        };

        const groupContent = document.createElement('ul');
        groupContent.setAttribute('data-accordion-content', '');
        // Sem overflow-hidden aqui -- cada item filho (recolhido) tem um
        // menu "..." (specMenuPanel, absolute) que precisa estourar os
        // limites deste <ul> pra aparecer inteiro. overflow-hidden no pai
        // corta esse menu mesmo já tendo sido removido do item (mesmo
        // padrão de bug já corrigido no item individual, ver comentário em
        // "item.className" mais abaixo). rounded-br-xl também sai -- sem
        // clip, o canto some visualmente de qualquer forma; cada item já
        // tem rounded-xl próprio.
        groupContent.className = 'p-2 space-y-2';

        // Lógica de toggle do Grupo (Acordeão Pai)
        headerInfo.onclick = () => {
          const isHidden = groupContent.classList.contains('hidden');
          groupContent.classList.toggle('hidden');
          groupHeader.querySelector('.group-chevron').classList.toggle('rotate-180', !isHidden);
        };

        const groupActionsRow = document.createElement('div');
        groupActionsRow.className = 'flex items-center gap-2 shrink-0';

        // Ícones diretos na fileira -- eram um menu "..." (dropdown), mas
        // com só 2 ações não justificava o clique extra de abrir o menu.
        const groupLinesBtn = document.createElement('button');
        groupLinesBtn.type = 'button';
        const isLinesHidden = handoffData.specLinesVisible && handoffData.specLinesVisible[letter] === false;
        groupLinesBtn.title = isLinesHidden ? 'Exibir linhas do grupo' : 'Ocultar linhas do grupo';
        groupLinesBtn.setAttribute('aria-label', groupLinesBtn.title);
        groupLinesBtn.className = 'p-2 hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0 text-gray-500 dark:text-dark-muted';
        groupLinesBtn.innerHTML = '<i data-lucide="spline" class="w-3.5 h-3.5"></i>';

        groupLinesBtn.onclick = (e) => {
          e.stopPropagation();
          if (!handoffData.specLinesVisible) handoffData.specLinesVisible = {};
          const nowHidden = !(handoffData.specLinesVisible[letter] === false);
          handoffData.specLinesVisible[letter] = nowHidden ? false : true;
          const specIds = specs.filter(s => s.id).map(s => s.id);
          parent.postMessage({ pluginMessage: { type: 'hide-spec-lines', specIds, forceState: !nowHidden } }, '*');
          saveSpecsToStorage();
          groupLinesBtn.title = nowHidden ? 'Exibir linhas do grupo' : 'Ocultar linhas do grupo';
          groupLinesBtn.setAttribute('aria-label', groupLinesBtn.title);
        };

        const groupDeleteBtn = document.createElement('button');
        groupDeleteBtn.type = 'button';
        groupDeleteBtn.title = 'Excluir grupo completo';
        groupDeleteBtn.setAttribute('aria-label', 'Excluir grupo completo');
        groupDeleteBtn.className = 'p-2 rounded-lg text-gray-500 dark:text-dark-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0';
        groupDeleteBtn.innerHTML = '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>';
        groupDeleteBtn.onclick = (e) => {
          e.stopPropagation();
          const confirmed = window.confirm(`Excluir o grupo "${currentGroupName}" e suas ${specs.length} especificação(ões)? Essa ação não pode ser desfeita.`);
          if (!confirmed) return;
          specs.forEach(s => {
            if (s.id) {
              parent.postMessage({ pluginMessage: { type: 'delete-node', id: s.id } }, '*');
            }
            removeSpecById(s.id);
          });
          createdSpecs = createdSpecs.filter(s => !specs.some(gs => gs.id === s.id));
          saveSpecsToStorage();
          renderSpecsList();
        };

        const groupVisBtn = document.createElement('button');
        groupVisBtn.type = 'button';
        groupVisBtn.title = "Ocultar/Exibir Grupo";
        groupVisBtn.setAttribute('aria-label', "Ocultar grupo");
        groupVisBtn.className = "p-2 hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0";
        groupVisBtn.setAttribute('data-group-vis-btn', letter);

        const isGroupVisible = specs.some(s => s.visible !== false);
        groupVisBtn.innerHTML = isGroupVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
        groupVisBtn.classList.toggle('text-[#2e2ee0]', isGroupVisible);
        groupVisBtn.classList.toggle('text-gray-500', !isGroupVisible);

        groupVisBtn.onclick = (e) => {
          e.stopPropagation();
          const targetState = !specs.some(s => s.visible !== false);

          specs.forEach(s => {
            s.visible = targetState;
            if (createdSpecs[s.originalIndex]) {
              createdSpecs[s.originalIndex].visible = targetState;
            }
            if (s.id) {
              parent.postMessage({ pluginMessage: { type: 'hide-node', id: s.id, forceState: targetState } }, '*');
            }
          });
          
          saveSpecsToStorage();
          
          groupVisBtn.innerHTML = targetState ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
          groupVisBtn.classList.toggle('text-[#2e2ee0]', targetState);
          groupVisBtn.classList.toggle('text-gray-500', !targetState);

          const childBtns = groupWrapper.querySelectorAll('[data-spec-vis-btn]');
          childBtns.forEach(btnEl => {
            btnEl.innerHTML = targetState ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i>` : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
            btnEl.classList.toggle("text-[#2e2ee0]", targetState);
            btnEl.classList.toggle("text-gray-400", !targetState);
          });
          
          _refreshIcons();
          updateHideAllSpecsButtonState();
        };

        // Wrapper clicável estável (nunca recriado pelo Lucide) em volta só
        // do ícone -- <i data-lucide> vira <svg> a cada _refreshIcons(), e
        // um onclick preso direto nele morre nessa troca. Fica visualmente
        // por último (depois de menu/olho), mas clicável, chamando o mesmo
        // toggle de headerInfo.onclick.
        const groupChevronBtn = document.createElement('button');
        groupChevronBtn.type = 'button';
        groupChevronBtn.title = 'Expandir/recolher grupo';
        groupChevronBtn.setAttribute('aria-label', 'Expandir/recolher grupo');
        groupChevronBtn.className = 'p-1 shrink-0';
        groupChevronBtn.onclick = () => headerInfo.onclick();
        const groupChevron = document.createElement('i');
        groupChevron.setAttribute('data-lucide', 'chevron-down');
        groupChevron.className = 'w-4 h-4 text-gray-500 dark:text-dark-muted transition-transform group-chevron shrink-0';
        groupChevronBtn.appendChild(groupChevron);

        groupActionsRow.appendChild(groupLinesBtn);
        groupActionsRow.appendChild(groupVisBtn);
        groupActionsRow.appendChild(groupDeleteBtn);
        groupActionsRow.appendChild(groupChevronBtn);
        groupHeader.appendChild(headerInfo);
        groupHeader.appendChild(groupActionsRow);

        specs.forEach((spec) => {
          const section = document.createElement('li');
          // overflow-hidden fica só no corpo (content, abaixo), não aqui --
          // este <li> contém o header com o menu "..." (position: absolute,
          // specMenuPanel), e overflow-hidden aqui cortava o menu quando o
          // accordion do item estava recolhido.
          section.className = 'bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg shadow-sm';
          if (spec.id) {
            section.setAttribute('data-spec-id', spec.id);
          }

          const header = document.createElement("div");
          header.className = "flex items-center gap-1 p-2 bg-white dark:bg-slate-800 rounded-lg";

          const btn = document.createElement("div");
          btn.setAttribute('role', 'button');
          btn.tabIndex = 0;
          btn.title = "Expandir para ver detalhes e focar no elemento no Figma";
          btn.setAttribute('aria-label', "Expandir para ver detalhes e focar no elemento no Figma");
          btn.className = "flex-1 min-w-0 flex items-center gap-2.5 text-left rounded-lg p-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors";
          const toggleSpecContent = () => {
            const contentEl = document.getElementById('content-' + spec.id);
            if (!contentEl) return;
            const isHidden = contentEl.classList.contains('hidden');
            contentEl.classList.toggle('hidden');
            const icon = header.querySelector('[data-lucide="chevron-down"]');
            if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : '';
            // Só foca ao EXPANDIR (isHidden=true antes do toggle) -- recolher
            // não deveria mexer no canvas, e "Expandir/Recolher todos"
            // (collapseAllAccordions) nunca chama esta função, então não há
            // risco de foco em massa ao usar aquele botão.
            if (spec.id && isHidden) focusNode(spec.id);
          };
          btn.onclick = toggleSpecContent;
          btn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSpecContent(); } };

          // Tag de categoria (spec.category/categoryLabel) fica só na linha
          // de baixo, como chip -- antes duplicava a mesma informação ao
          // lado do título (spec.type é sempre igual a categoryLabel, ver
          // backend em create-unified-spec) e de novo embaixo em texto
          // plano.
          const _ccSpec = spec.category ? _getCatColor(spec.category) : null;
          btn.innerHTML = `
            <div class="flex flex-col overflow-hidden min-w-0 text-left gap-0.5">
              <span class="text-[12px] font-bold text-slate-800 dark:text-white truncate" title="${spec.name}">${spec.name}</span>
              ${spec.category && _ccSpec ? `<span class="shrink-0 self-start text-[9px] font-bold px-1.5 py-0.5 rounded-full border" style="background-color:${_ccSpec.fill};border-color:${_ccSpec.stroke};color:${_ccSpec.stroke};">${spec.categoryLabel || spec.category}</span>` : ''}
            </div>
          `;

          const actions = document.createElement("div");
          actions.className = "flex items-center gap-2 shrink-0";

          const visBtn = document.createElement("button");
          visBtn.type = "button";
          visBtn.title = "Ocultar/Exibir no canvas";
          visBtn.setAttribute('aria-label', "Ocultar");
          visBtn.className = "p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-600 transition-colors shrink-0";
          visBtn.setAttribute('data-spec-vis-btn', '');

          if (spec.visible === undefined) {
            spec.visible = true;
          }
          const isVisible = spec.visible !== false;
          visBtn.innerHTML = isVisible ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i>` : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
          visBtn.classList.toggle("text-[#2e2ee0]", isVisible);
          visBtn.classList.toggle("text-gray-400", !isVisible);

          visBtn.onclick = (e) => {
            e.stopPropagation();
            // Lê sempre da fonte (não da cópia estática do closure)
            const currentVis = createdSpecs[spec.originalIndex]?.visible !== false;
            const nowVisible = !currentVis;
            if (createdSpecs[spec.originalIndex]) {
              createdSpecs[spec.originalIndex].visible = nowVisible;
            }

            visBtn.innerHTML = nowVisible ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i>` : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
            visBtn.classList.toggle("text-[#2e2ee0]", nowVisible);
            visBtn.classList.toggle("text-gray-400", !nowVisible);

            if (spec.id) {
              parent.postMessage({ pluginMessage: { type: 'hide-node', id: spec.id, forceState: nowVisible } }, '*');
            }
            saveSpecsToStorage();
            _refreshIcons();

            updateGroupVisButtonState(letter, groupWrapper);
            updateHideAllSpecsButtonState();
          };

          // Menu "..." (overflow) do item — Travar/Destravar e Editar
          // estilo da linha, ambas configuração pontual (afetam
          // apresentação/estado, não conteúdo) usadas com pouca frequência.
          // Excluir fica FORA do menu, como ícone direto: é ação frequente
          // num fluxo de documentação (specs viram obsoletas e são
          // descartadas o tempo todo), e escondê-la não reduziria risco
          // real -- a única proteção em ambos os casos é o window.confirm()
          // nativo, sem guard extra. Mesmo padrão do card de grupo acima
          // (groupActionsRow), que também trata exclusão como ação direta.
          const specMenuWrap = document.createElement('div');
          specMenuWrap.className = 'relative shrink-0';
          const specMenuBtn = document.createElement('button');
          specMenuBtn.type = 'button';
          specMenuBtn.title = 'Mais ações';
          specMenuBtn.setAttribute('aria-label', 'Mais ações da especificação');
          specMenuBtn.className = 'p-2 rounded-lg text-gray-500 dark:text-dark-muted hover:bg-blue-50 dark:hover:bg-slate-600 transition-colors shrink-0';
          specMenuBtn.innerHTML = '<i data-lucide="more-horizontal" class="w-3.5 h-3.5"></i>';
          const specMenuPanel = document.createElement('div');
          specMenuPanel.className = 'hidden absolute right-0 top-full mt-1 z-20 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl shadow-lg py-1 min-w-[200px] spec-overflow-menu-panel';

          const lockBtn = document.createElement("button");
          lockBtn.type = "button";
          lockBtn.className = "w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold hover:bg-slate-50 dark:hover:bg-dark-line/20 transition-colors text-left";
          lockBtn.setAttribute('data-spec-lock-btn', '');

          const isUnlocked = spec.locked === false;
          const lockLabel = isUnlocked ? "Travar especificação" : "Destravar especificação";
          lockBtn.classList.toggle("text-amber-500", isUnlocked);
          lockBtn.classList.toggle("text-slate-600", !isUnlocked);
          lockBtn.classList.toggle("dark:text-dark-muted", !isUnlocked);
          lockBtn.innerHTML = `<i data-lucide="${isUnlocked ? 'lock-open' : 'lock'}" class="w-3.5 h-3.5 shrink-0"></i><span>${lockLabel}</span>`;

          lockBtn.onclick = (e) => {
            e.stopPropagation();
            toggleSpecLock(spec.originalIndex);
            specMenuPanel.classList.add('hidden');
          };

          const editLineBtn = document.createElement("button");
          editLineBtn.type = "button";
          editLineBtn.className = "w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-slate-600 dark:text-dark-muted hover:bg-slate-50 dark:hover:bg-dark-line/20 transition-colors text-left";
          editLineBtn.innerHTML = '<i data-lucide="pencil-ruler" class="w-3.5 h-3.5 shrink-0"></i><span>Editar estilo da linha</span>';
          if (!spec.id || !spec.targetNodeId) {
            editLineBtn.disabled = true;
            editLineBtn.classList.add('opacity-50', 'cursor-not-allowed');
            editLineBtn.title = "Linha não editável — especificação criada antes deste recurso existir";
          } else {
            editLineBtn.onclick = (e) => {
              e.stopPropagation();
              specMenuPanel.classList.add('hidden');
              openEditSpecConnectorModal(spec.originalIndex);
            };
          }

          specMenuPanel.appendChild(lockBtn);
          specMenuPanel.appendChild(editLineBtn);
          specMenuBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.spec-overflow-menu-panel').forEach(p => { if (p !== specMenuPanel) p.classList.add('hidden'); });
            const wasHidden = specMenuPanel.classList.contains('hidden');
            specMenuPanel.classList.toggle('hidden');
            // Abrir o menu com o card ainda recolhido deixava o dropdown
            // flutuando sobre um card "vazio" -- expande junto (nunca
            // recolhe: fechar o menu não deveria fechar o card).
            if (wasHidden && document.getElementById('content-' + spec.id)?.classList.contains('hidden')) {
              toggleSpecContent();
            }
          };
          specMenuWrap.appendChild(specMenuBtn);
          specMenuWrap.appendChild(specMenuPanel);

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.title = "Excluir Especificação";
          delBtn.setAttribute("aria-label", "Excluir especificação");
          delBtn.className = "p-2 rounded-lg text-gray-500 dark:text-dark-muted hover:text-red-500 transition-colors";
          delBtn.innerHTML = '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>';
          delBtn.onclick = (e) => {
            e.stopPropagation();
            const confirmed = window.confirm('Excluir esta especificação? Essa ação não pode ser desfeita.');
            if (!confirmed) return;
            if (spec.id) {
              parent.postMessage({ pluginMessage: { type: 'delete-node', id: spec.id } }, '*');
            }
            createdSpecs.splice(spec.originalIndex, 1);
            removeSpecById(spec.id);
            saveSpecsToStorage();
            renderSpecsList();
          };

          actions.appendChild(visBtn);
          actions.appendChild(delBtn);
          actions.appendChild(specMenuWrap);

          // Último ícone da fileira de ações (depois de olho/lixeira/menu),
          // não colado ao título -- wrapper clicável próprio (não solto
          // como <i> puro) porque o Lucide recria <i data-lucide> como
          // <svg> a cada _refreshIcons(), descartando onclick preso direto
          // nele. Chama o mesmo toggle de btn.onclick.
          const specChevronBtn = document.createElement('button');
          specChevronBtn.type = 'button';
          specChevronBtn.title = 'Expandir/recolher';
          specChevronBtn.setAttribute('aria-label', 'Expandir/recolher especificação');
          specChevronBtn.className = 'p-2 rounded-lg text-gray-500 dark:text-dark-muted hover:bg-blue-50 dark:hover:bg-slate-600 transition-colors shrink-0';
          specChevronBtn.onclick = (e) => { e.stopPropagation(); toggleSpecContent(); };
          const specChevron = document.createElement('i');
          specChevron.setAttribute('data-lucide', 'chevron-down');
          specChevron.className = 'w-3.5 h-3.5 text-gray-500 dark:text-dark-muted transition-transform shrink-0';
          specChevronBtn.appendChild(specChevron);
          actions.appendChild(specChevronBtn);

          header.appendChild(btn);
          header.appendChild(actions);
          section.appendChild(header);

          const content = document.createElement("div");
          content.id = "content-" + spec.id;
          content.className = "hidden p-3 border-t border-gray-50 dark:border-dark-line bg-gray-50/30 dark:bg-slate-900/50 space-y-2 rounded-b-lg overflow-hidden";
          
          if (spec.note) {
            const noteRow = document.createElement('div');
            noteRow.className = 'flex items-start gap-1.5 text-[10px] text-slate-600 dark:text-dark-text p-2 bg-white dark:bg-dark-bg rounded border border-gray-100 dark:border-dark-line italic cursor-pointer hover:border-[#2e2ee0]/30 transition-colors';
            noteRow.title = 'Clique para editar a nota';
            noteRow.innerHTML = `<i data-lucide="sticky-note" class="w-3 h-3 text-slate-400 shrink-0 mt-0.5"></i><span class="flex-1">${escapeHtml(spec.note)}</span>`;
            noteRow.onclick = (e) => { e.stopPropagation(); openSpecNoteModal(spec.originalIndex); };
            content.appendChild(noteRow);
          }

          if (spec.properties && spec.properties.length > 0) {
            spec.properties.forEach(p => {
              const detEl = document.createElement("div");
              detEl.className = "flex justify-between text-[10px] bg-white dark:bg-dark-bg p-1.5 rounded border border-gray-100 dark:border-dark-line";
              const valStr = p.token ? `<span class="text-[8px] text-[#3d3dff] dark:text-blue-400 font-medium mr-1 px-1 bg-blue-50 dark:bg-blue-900/20 rounded-sm border border-blue-100 dark:border-blue-800">${escapeHtml(p.token)}</span>${escapeHtml(p.value)}` : escapeHtml(p.value);
              const displayVal = p.token || p.value;
              const valStr2 = p.token
                ? `<span class="text-[9px] text-[#3d3dff] dark:text-blue-400 font-medium px-1 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-800">${escapeHtml(p.token)}</span>`
                : `<span class="font-mono">${escapeHtml(p.value)}</span>`;
              detEl.innerHTML = `<span class="text-slate-500">${escapeHtml(p.label)}</span><span class="font-bold text-slate-700 dark:text-white flex items-center">${valStr2}</span>`;
              content.appendChild(detEl);
            });
          }

          // ── Ações: Cenário de Exceção + Nota ─────────────────────────────
          // Ampliados a pedido do usuário -- eram pequenos/discretos demais
          // (9px, padding mínimo) e a ação de nota pós-criação nem existia.
          // Mesmo par de botões, lado a lado, seguindo o padrão rounded-2xl
          // do resto do plugin.
          const actionsRow = document.createElement('div');
          actionsRow.className = 'flex items-center gap-2 pt-1';
          actionsRow.innerHTML = `
            <button type="button" onclick="event.stopPropagation(); openGlobalSpecException(${spec.originalIndex})"
              class="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-orange-800 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-2xl hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">
              <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> Cenário de Exceção${(spec.excecoes || []).length > 0 ? ` (${(spec.excecoes || []).length})` : ''}
            </button>
            <button type="button" onclick="event.stopPropagation(); openSpecNoteModal(${spec.originalIndex})"
              class="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-[#2e2ee0] dark:text-[#4da3e0] bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-2xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
              <i data-lucide="sticky-note" class="w-3.5 h-3.5"></i> ${spec.note ? 'Editar Nota' : 'Incluir Nota'}
            </button>
          `;
          content.appendChild(actionsRow);

          const specExcs = spec.excecoes || [];
          if (specExcs.length > 0) {
            const excList = document.createElement('div');
            excList.id = 'global-exc-list-' + spec.originalIndex;
            excList.className = 'space-y-1 pt-1';
            excList.innerHTML = specExcs.map((exc, ei) => _renderExcItem(exc, `deleteGlobalSpecException(${spec.originalIndex}, ${ei})`)).join('');
            content.appendChild(excList);
          }

          section.appendChild(content);
          groupContent.appendChild(section);
        });

        groupWrapper.appendChild(groupHeader);
        groupWrapper.appendChild(groupContent);
        list.appendChild(groupWrapper);
      });

      _refreshIcons();

      // Expand spec sinalizada (nova spec ou novo cenário adicionado)
      const targetId = window._expandSpecIdAfterRender;
      if (targetId) {
        window._expandSpecIdAfterRender = null;
        setTimeout(() => {
          const contentEl = document.getElementById('content-' + targetId);
          if (contentEl && contentEl.classList.contains('hidden')) {
            contentEl.classList.remove('hidden');
            const chevron = contentEl.closest('.border')?.querySelector('[data-lucide="chevron-down"]');
            if (chevron) chevron.style.transform = 'rotate(180deg)';
          }
          if (contentEl) contentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      } else {
        const currentCount = createdSpecs.length;
        if (typeof lastSpecsCount !== 'undefined' && currentCount > lastSpecsCount) {
          const lastSpec = createdSpecs[createdSpecs.length - 1];
          if (lastSpec && lastSpec.id) {
            setTimeout(() => {
              const contentEl = document.getElementById('content-' + lastSpec.id);
              if (contentEl && contentEl.classList.contains('hidden')) {
                contentEl.classList.remove('hidden');
                const chevron = contentEl.closest('.border')?.querySelector('[data-lucide="chevron-down"]');
                if (chevron) chevron.style.transform = 'rotate(180deg)';
              }
              autoScrollToNewItem('specs-scroll-container');
            }, 50);
          }
        }
        lastSpecsCount = createdSpecs.length;
      }
      updateHideAllSpecsButtonState();
    }
    let lastSpecsCount = 0;


    function hideNode(id) {
      parent.postMessage({ pluginMessage: { type: 'hide-node', id } }, '*');
    }

    function deleteNode(id, idx, type = 'spec') {
      parent.postMessage({ pluginMessage: { type: 'delete-node', id } }, '*');
      // Limpar qualquer highlight ativo para evitar que fique órfão
      parent.postMessage({ pluginMessage: { type: 'highlight-node', highlight: false } }, '*');
      
      if (type === 'flow') {
        if (handoffData.createdFlows) {
          handoffData.createdFlows.splice(idx, 1);
          saveToStorage();
          renderFlowsList();
        }
      } else {
        const removedSpec = createdSpecs[idx];
        createdSpecs.splice(idx, 1);
        if (removedSpec) removeSpecById(removedSpec.id);
        saveSpecsToStorage();
        renderSpecsList();
      }
    }



    // Mini-mapa de ancoragem do modal de fluxo — nodes vêm do backend via
    // 'flow-selection-bounds' (ver messages.js), já ordenados pela ordem
    // real de clique quando disponível, com fallback espacial
    // (_resolveChainOrder em code.js), tanto por pedido explícito
    // (get-flow-selection-bounds ao abrir o modal) quanto ao vivo, a cada
    // mudança de seleção no canvas enquanto o modal está aberto. Com N>2
    // nodes vira uma cadeia representada como grade lógica (posição relativa
    // real -- acima/abaixo/esquerda/direita -- mas não proporcional em
    // pixels, ver _computeFlowChainLayout).
    let _flowAnchorNodes = [];

    // Lado de ancoragem escolhido clicando numa borda de QUALQUER card no
    // mini-mapa -- chave é o índice do card (origem daquele segmento da
    // cadeia), valor é 'top'/'bottom'/'left'/'right'; ausência de chave =
    // automático pra aquele card. Cada card decide independentemente por
    // onde a seta SAI dele (A→B usa o lado de A, B→C usa o lado de B, etc),
    // permitindo por ex. A na direita, B no topo, C embaixo na mesma cadeia
    // (ver _setFlowAnchorSide/confirmFlowConnection). Substitui os antigos
    // radios input[name="flow-side"], que só cobriam um lado único pra
    // cadeia inteira.
    let _flowAnchorSideByIdx = {};

    const FLOW_CHAIN_LETTERS = 'ABCDEFGHIJKL';

    // Direção relativa dominante entre dois nodes reais do canvas, comparando
    // os centros dos bounding boxes -- usada tanto pra montar a grade lógica
    // (passo abaixo) quanto pra restringir bordas clicáveis (allowedSides em
    // _renderFlowAnchorPreview). Diferença maior em X vira horizontal
    // (right/left), maior em Y vira vertical (down/up); em caso de segmentos
    // "diagonais" (ex: B abaixo E à esquerda de A ao mesmo tempo) só o eixo
    // dominante é representado na grade -- é uma simplificação deliberada
    // (ver decisão de UX no comentário de _computeFlowChainLayout).
    function _flowRelativeDirection(fromNode, toNode) {
      const fromCx = fromNode.x + fromNode.width / 2;
      const fromCy = fromNode.y + fromNode.height / 2;
      const toCx = toNode.x + toNode.width / 2;
      const toCy = toNode.y + toNode.height / 2;
      const dx = toCx - fromCx;
      const dy = toCy - fromCy;
      if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
      return dy >= 0 ? 'down' : 'up';
    }

    const FLOW_DIR_OPPOSITE = { right: 'left', left: 'right', down: 'up', up: 'down' };
    const FLOW_DIR_TO_SIDE = { right: 'right', left: 'left', down: 'bottom', up: 'top' };

    // Grade lógica: cada card ocupa uma célula (col, row) derivada da direção
    // relativa real (canvas) do card anterior pro próximo -- NÃO é
    // proporcional às coordenadas/distâncias reais, só preserva a topologia
    // (quem fica acima/abaixo/esquerda/direita de quem). Isso permite cadeias
    // não-lineares no mini-mapa (ex: A-B lado a lado, C abaixo de A, D abaixo
    // de B) em vez do rail horizontal fixo de antes. Quando todos os
    // segmentos são 'right' o resultado é idêntico ao rail antigo (mesma
    // linha, sem regressão pro caso simples).
    //
    // Limitação conhecida e aceita: não há detecção de colisão entre células
    // -- se a cadeia "voltar" sobre si mesma (ex: A→B→C onde C cai na mesma
    // direção relativa de volta pra A), dois cards podem ocupar a mesma
    // célula e se sobrepor no desenho. Cadeias de handoff seguem
    // majoritariamente fluxo progressivo (raramente revisitam a mesma região
    // do canvas), então esse caso é raro; se aparecer na prática, resolver
    // então em vez de adicionar complexidade de layout antecipada.
    function _computeFlowChainLayout(nodes) {
      const n = nodes.length;
      const boxSize = n <= 5 ? 56 : Math.max(36, Math.floor(400 / (n * 1.4)));
      const gap = Math.max(20, boxSize * 0.5);
      const cell = boxSize + gap;

      const cells = [{ col: 0, row: 0 }];
      for (let i = 1; i < n; i++) {
        const dir = _flowRelativeDirection(nodes[i - 1], nodes[i]);
        const prev = cells[i - 1];
        const delta = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[dir];
        cells.push({ col: prev.col + delta[0], row: prev.row + delta[1] });
      }

      const cols = cells.map(c => c.col);
      const rows = cells.map(c => c.row);
      const minCol = Math.min(...cols), maxCol = Math.max(...cols);
      const minRow = Math.min(...rows), maxRow = Math.max(...rows);

      const PAD = gap;
      const rects = cells.map(c => ({
        x: PAD + (c.col - minCol) * cell,
        y: PAD + (c.row - minRow) * cell,
        w: boxSize,
        h: boxSize
      }));

      const viewW = Math.max(400, PAD * 2 + (maxCol - minCol) * cell + boxSize);
      const viewH = Math.max(110, PAD * 2 + (maxRow - minRow) * cell + boxSize);
      return { rects, viewW, viewH };
    }

    function _flowRectEdgePoints(r) {
      return {
        top:    { x: r.x + r.w / 2, y: r.y,            side: 'top' },
        bottom: { x: r.x + r.w / 2, y: r.y + r.h,       side: 'bottom' },
        left:   { x: r.x,           y: r.y + r.h / 2,   side: 'left' },
        right:  { x: r.x + r.w,     y: r.y + r.h / 2,   side: 'right' }
      };
    }

    // Espelha a lógica de dobras do backend (_buildFlowConnection em
    // code.js) pro preview do mini-mapa mostrar o formato real do conector
    // ANTES de confirmar -- 1 dobra (L) quando saída/entrada são eixos
    // perpendiculares, 2 dobras (Z/U) quando são paralelos (mesma direção
    // ou opostos), usando o mesmo offset mínimo de 24px "por fora" dos dois
    // pontos. Só entra em jogo quando o estilo "Angular" está selecionado.
    // Espelha _orthogonalElbowPoints (code.js) -- mesmo algoritmo de
    // roteamento ortogonal usado na hora de desenhar a linha real no
    // canvas, pro preview do mini-mapa não mostrar um traçado diferente do
    // resultado final. Ver comentário completo em code.js: avança um
    // trecho fixo na direção do lado de cada ponto (garante saída/entrada
    // sempre retas), depois conecta os pontos avançados com 0, 1 ou 2
    // dobras conforme a posição relativa real.
    function _computeElbowPoints(from, to) {
      if (!from.side || !to.side) return [];
      const OFFSET = 24;
      const dirOf = (side) => ({
        top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 },
        left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
      })[side];
      const dirA = dirOf(from.side), dirB = dirOf(to.side);
      const aPrime = { x: from.x + dirA.x * OFFSET, y: from.y + dirA.y * OFFSET };
      const bPrime = { x: to.x + dirB.x * OFFSET, y: to.y + dirB.y * OFFSET };

      const points = [aPrime];
      const aVertical = dirA.x === 0;
      const bVertical = dirB.x === 0;

      if (Math.abs(aPrime.x - bPrime.x) < 0.01 || Math.abs(aPrime.y - bPrime.y) < 0.01) {
        // Já alinhados -- sem dobra entre aPrime/bPrime.
      } else if (aVertical !== bVertical) {
        const corner = aVertical ? { x: bPrime.x, y: aPrime.y } : { x: aPrime.x, y: bPrime.y };
        points.push(corner);
      } else if (aVertical) {
        const midY = dirA.y > 0 ? Math.max(aPrime.y, bPrime.y) : Math.min(aPrime.y, bPrime.y);
        points.push({ x: aPrime.x, y: midY }, { x: bPrime.x, y: midY });
      } else {
        const midX = dirA.x > 0 ? Math.max(aPrime.x, bPrime.x) : Math.min(aPrime.x, bPrime.x);
        points.push({ x: midX, y: aPrime.y }, { x: midX, y: bPrime.y });
      }
      points.push(bPrime);
      return points;
    }

    function _flowNearestPoint(pA, pointsB) {
      let best = null, bestDist = Infinity;
      Object.values(pointsB).forEach(p => {
        const d = Math.hypot(p.x - pA.x, p.y - pA.y);
        if (d < bestDist) { bestDist = d; best = p; }
      });
      return best;
    }

    // Sugere Reta ou Angular a partir da posição relativa dos dois PRIMEIROS
    // elementos da seleção -- usado tanto no modal de fluxo quanto no de
    // spec (ver _suggestConnectorStyleFromBounds abaixo, mesma lógica com
    // bounds já resolvidos em vez de nodes com x/y/width/height). Regra:
    // compara o desvio no eixo PERPENDICULAR à direção dominante contra a
    // distância total nesse eixo -- se os elementos estão bem alinhados
    // (desvio pequeno), uma reta já fica limpa; se estão desalinhados/em
    // diagonal, a reta cruzaria num ângulo confuso e o Angular (quinas de
    // 90°) organiza melhor. Limiar de 20% escolhido por ser permissivo o
    // bastante pra pequenos desalinhamentos (ex: cards quase alinhados mas
    // não perfeitamente) ainda sugerirem reta.
    function _suggestConnectorStyleFromBounds(boundsA, boundsB) {
      if (!boundsA || !boundsB) return 'straight';
      const cAx = boundsA.x + boundsA.width / 2, cAy = boundsA.y + boundsA.height / 2;
      const cBx = boundsB.x + boundsB.width / 2, cBy = boundsB.y + boundsB.height / 2;
      const dx = Math.abs(cBx - cAx), dy = Math.abs(cBy - cAy);
      const primary = Math.max(dx, dy), perpendicular = Math.min(dx, dy);
      if (primary === 0) return 'straight';
      return (perpendicular / primary) > 0.2 ? 'elbow' : 'straight';
    }

    // true assim que o usuário troca o estilo manualmente (radio onchange)
    // -- a sugestão automática só se aplica enquanto ele não mexeu, pra não
    // sobrescrever uma escolha explícita a cada mudança de seleção no
    // canvas. Resetada ao abrir o modal do zero (ver openFlowFormModal).
    let _flowConnectorStyleManuallySet = false;

    function _applySuggestedConnectorStyle(nodes) {
      if (_flowConnectorStyleManuallySet || !nodes || nodes.length < 2) return;
      const suggested = _suggestConnectorStyleFromBounds(nodes[0], nodes[1]);
      const radio = document.querySelector(`input[name="flow-connector-style"][value="${suggested}"]`);
      if (radio && !radio.checked) { radio.checked = true; _onFlowConnectorStyleChangeIfExists(); }
    }
    function _onFlowConnectorStyleChangeIfExists() {
      // Sem handler dedicado hoje além de re-renderizar o mini-mapa (ver
      // radio onchange="_renderFlowAnchorPreview()" em modals.html) -- só
      // reaproveita o mesmo re-render pra refletir o estilo sugerido na
      // linha do mini-mapa imediatamente.
      if (typeof _renderFlowAnchorPreview === 'function') _renderFlowAnchorPreview();
    }

    // Chamada tanto ao chegar 'flow-selection-bounds' quanto ao clicar numa
    // borda do card A no mini-mapa (ver _setFlowAnchorSide).
    function updateFlowAnchorPreview(nodes) {
      _flowAnchorNodes = nodes || [];
      _applySuggestedConnectorStyle(_flowAnchorNodes);
      _renderFlowAnchorPreview();
      if (typeof _updateFlowConfirmButtonLabel === 'function') _updateFlowConfirmButtonLabel();
      if (typeof _updateFlowDecisionAvailability === 'function') _updateFlowDecisionAvailability();
    }
    window.updateFlowAnchorPreview = updateFlowAnchorPreview;

    // Ordem sempre a que veio do backend (_resolveChainOrder: ordem real de
    // clique, com fallback espacial esquerda→direita) -- sem botão de
    // inverter: se sair errado, o designer reseleciona no canvas na ordem
    // desejada (fluxo natural do Figma).
    function _orderedFlowAnchorNodes() {
      return _flowAnchorNodes;
    }

    function _renderFlowAnchorPreview() {
      const modalEl = document.getElementById('flow-form-modal');
      if (!modalEl || modalEl.classList.contains('hidden')) return;
      const svg = document.getElementById('flow-anchor-svg');
      const emptyState = document.getElementById('flow-anchor-empty');
      const orderRow = document.getElementById('flow-chain-order-row');
      const orderText = document.getElementById('flow-chain-order-text');
      if (!svg || !emptyState) return;

      const nodes = _orderedFlowAnchorNodes();
      if (nodes.length < 2) {
        svg.classList.add('hidden');
        svg.innerHTML = '';
        emptyState.classList.remove('hidden');
        if (orderRow) orderRow.classList.add('hidden');
        _renderFlowAnchorAutoToggle();
        return;
      }

      emptyState.classList.add('hidden');
      svg.classList.remove('hidden');

      const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
      const { rects, viewW, viewH } = _computeFlowChainLayout(nodes);
      svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`);

      // Setas esquemáticas entre caixas consecutivas — reforça a leitura de
      // "cadeia" sem precisar de uma linha real calculada por par. Agora que
      // a grade lógica pode ter segmentos verticais/horizontais em qualquer
      // combinação (não mais só uma fila em linha reta), a seta liga os
      // CENTROS dos dois retângulos -- não presume mais mesma linha Y.
      const arrowsHtml = rects.slice(0, -1).map((r, i) => {
        const next = rects[i + 1];
        const x1 = r.x + r.w / 2, y1 = r.y + r.h / 2;
        const x2 = next.x + next.w / 2, y2 = next.y + next.h / 2;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#cbd5e1" stroke-width="1.5" marker-end="url(#flow-chain-arrowhead)" />`;
      }).join('');

      const boxesHtml = rects.map((r, i) => {
        const isFirst = i === 0;
        const letter = FLOW_CHAIN_LETTERS[i] || '?';
        const name = escapeXml((nodes[i].name || letter).trim());
        const fill = isFirst ? 'rgba(61,61,255,0.12)' : 'rgba(148,163,184,0.15)';
        const stroke = isFirst ? '#3d3dff' : '#94a3b8';
        const textFill = isFirst ? '#2e2ee0' : '#64748b';
        return `
          <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.5"><title>${name}</title></rect>
          <text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="${textFill}">${letter}</text>
        `;
      }).join('');

      // Cada card (exceto o último, que nunca é origem de segmento) expõe
      // pontos clicáveis de ancoragem -- escolha independente por card (ex:
      // A na direita, B no topo, C embaixo), em vez de um lado único pra
      // cadeia inteira. O lado escolhido em cada card decide de onde a seta
      // SAI daquele card (ver flowSidesByIndex em confirmFlowConnection).
      //
      // Restrição geométrica (grade lógica): a saída de um card em direção
      // ao próximo não pode ser pelo lado diretamente OPOSTO à direção real
      // do segmento (calculada em _flowRelativeDirection) -- ex: se o próximo
      // card está à direita, sair pela esquerda faria a linha contornar todo
      // o card de forma anti-natural. Decisão de UX: bloqueamos só o lado
      // OPOSTO, não restringimos a uma única borda "correta" -- as duas
      // bordas perpendiculares (top/bottom quando a direção é horizontal, ou
      // left/right quando é vertical) continuam disponíveis como opções
      // válidas de estilo (ex: sair por cima mesmo indo pra direita, pra dar
      // uma curva mais aberta), já que elas não geram uma linha contornando
      // o próprio card ou o vizinho -- só a oposta faz isso. Isso evita
      // over-engineering (não força uma escolha "binária" com 1 única opção
      // por segmento) mantendo a leitura geometricamente coerente.
      //
      // Restrição adicional (já existia, mantida): um card do MEIO recebe a
      // conexão anterior por um lado (a entrada dele) e envia a próxima por
      // outro (a saída) -- sair pelo MESMO lado por onde entrou continua
      // bloqueado (a linha se sobreporia saindo e voltando pelo mesmo
      // ponto), mesmo que geometricamente aquele lado não seja o oposto da
      // nova direção. O primeiro card (A) não tem entrada (é o ponto de
      // partida real da jornada), então só a restrição geométrica se aplica
      // a ele. A entrada de cada card precisa ser resolvida numa passada
      // antes de desenhar os pontos, já que "de onde ele entra" depende do
      // lado de SAÍDA escolhido no card anterior (ou do automático, se não
      // houver escolha manual lá).
      const isAngularStyle = (document.querySelector('input[name="flow-connector-style"]:checked') || {}).value === 'elbow';
      const ALL_SIDES = ['top', 'bottom', 'left', 'right'];

      // Direção geométrica real de cada segmento consecutivo da cadeia
      // (nodes[i] → nodes[i+1]), calculada sobre as coordenadas reais do
      // canvas -- independe de onde o card acabou posicionado na grade
      // lógica do mini-mapa.
      const segmentDirections = nodes.slice(0, -1).map((n, i) => _flowRelativeDirection(n, nodes[i + 1]));

      // Passada 1: resolve o ponto de saída de cada card e o ponto de
      // entrada correspondente no próximo, na ordem da cadeia -- mesmo
      // cálculo que já existia, só separado do desenho pra poder consultar
      // "por onde este card entra" ao decidir quais bordas de SAÍDA mostrar.
      const segments = rects.slice(0, -1).map((r, i) => {
        const pts = _flowRectEdgePoints(r);
        const chosenSide = _flowAnchorSideByIdx[i];
        const activePoint = (chosenSide && pts[chosenSide]) ? pts[chosenSide] : null;
        if (!activePoint) return { pts, activePoint: null, target: null };
        const pointsNext = _flowRectEdgePoints(rects[i + 1]);
        const isLastSegment = i === rects.length - 2;
        const nextChosenSide = isLastSegment ? _flowAnchorSideByIdx.end : null;
        const target = (nextChosenSide && pointsNext[nextChosenSide]) ? pointsNext[nextChosenSide] : _flowNearestPoint(activePoint, pointsNext);
        return { pts, activePoint, target };
      });

      let pointsHtml = '';
      let linesHtml = '';
      segments.forEach((seg, i) => {
        // Lado de entrada deste card: o `side` do ponto de destino resolvido
        // no segmento anterior (i-1 → i). undefined pro primeiro card (sem
        // entrada) e sempre que o segmento anterior ainda não tem saída
        // escolhida (nada a bloquear ainda).
        const incomingSide = i > 0 ? (segments[i - 1].target ? segments[i - 1].target.side : undefined) : undefined;
        const opposingSide = FLOW_DIR_TO_SIDE[FLOW_DIR_OPPOSITE[segmentDirections[i]]];
        const allowedSides = ALL_SIDES.filter(s => s !== opposingSide && s !== incomingSide);
        let chosenSide = _flowAnchorSideByIdx[i];
        // Se reescolher o lado de um card anterior mudou a entrada deste
        // card e ela passou a coincidir com a saída já escolhida aqui,
        // aquela escolha ficou inválida (repetiria o mesmo ponto de
        // entrada/saída) -- descarta e volta esse card pro automático,
        // tanto no estado (próxima renderização já nasce limpa) quanto
        // neste render (não desenha como ativo nem calcula a linha).
        if (chosenSide && !allowedSides.includes(chosenSide)) {
          delete _flowAnchorSideByIdx[i];
          chosenSide = undefined;
          seg.activePoint = null;
        }
        pointsHtml += allowedSides.map(s => {
          const p = seg.pts[s];
          const isActive = chosenSide === s;
          const rad = isActive ? 8 : 6;
          return `<circle cx="${p.x}" cy="${p.y}" r="${rad}" fill="${isActive ? '#3d3dff' : '#ffffff'}" stroke="#3d3dff" stroke-width="${isActive ? 2 : 1.5}" style="cursor:pointer" onclick="_setFlowAnchorSide(${i}, '${s}')" />`;
        }).join('');
        if (seg.activePoint && seg.target) {
          if (isAngularStyle) {
            const elbow = _computeElbowPoints(seg.activePoint, seg.target);
            const path = [seg.activePoint, ...elbow, seg.target].map(p => `${p.x} ${p.y}`).join(' L ');
            linesHtml += `<path d="M ${path}" fill="none" stroke="#3d3dff" stroke-width="1.5" stroke-dasharray="4 3" />`;
          } else {
            linesHtml += `<line x1="${seg.activePoint.x}" y1="${seg.activePoint.y}" x2="${seg.target.x}" y2="${seg.target.y}" stroke="#3d3dff" stroke-width="1.5" stroke-dasharray="4 3" />`;
          }
        }
      });

      // Último card da cadeia: nunca é origem de segmento, mas expõe bordas
      // clicáveis pra escolher onde a conexão CHEGA nele (ponto de entrada
      // do último segmento) -- chave especial 'end' em _flowAnchorSideByIdx,
      // sem colidir com os índices numéricos de saída. A regra de "não pode
      // repetir o lado por onde entrou" não se aplica aqui (ele só RECEBE,
      // nunca envia) -- mas a restrição geométrica (bloquear o lado oposto
      // à direção real do último segmento) continua fazendo sentido: entrar
      // pelo lado oposto ao penúltimo card também exigiria a linha
      // contornar o próprio card de forma anti-natural.
      {
        const lastRect = rects[rects.length - 1];
        const lastPts = _flowRectEdgePoints(lastRect);
        const chosenEndSide = _flowAnchorSideByIdx.end;
        const lastDir = segmentDirections[segmentDirections.length - 1];
        const endOpposingSide = FLOW_DIR_TO_SIDE[lastDir];
        const endAllowedSides = ALL_SIDES.filter(s => s !== endOpposingSide);
        pointsHtml += endAllowedSides.map(s => {
          const p = lastPts[s];
          const isActive = chosenEndSide === s;
          const rad = isActive ? 8 : 6;
          return `<circle cx="${p.x}" cy="${p.y}" r="${rad}" fill="${isActive ? '#3d3dff' : '#ffffff'}" stroke="#3d3dff" stroke-width="${isActive ? 2 : 1.5}" style="cursor:pointer" onclick="_setFlowAnchorSide('end', '${s}')" />`;
        }).join('');
      }

      svg.innerHTML = `
        <defs>
          <marker id="flow-chain-arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#cbd5e1" />
          </marker>
        </defs>
        ${arrowsHtml}
        ${boxesHtml}
        ${linesHtml}
        ${pointsHtml}
      `;

      if (orderRow && orderText) {
        if (nodes.length > 2) {
          orderRow.classList.remove('hidden');
          orderText.textContent = nodes.map((n, i) => `${FLOW_CHAIN_LETTERS[i]} · ${(n.name || '').trim() || FLOW_CHAIN_LETTERS[i]}`).join(' → ');
        } else {
          orderRow.classList.add('hidden');
        }
      }

      _renderFlowAnchorAutoToggle();
    }
    window._renderFlowAnchorPreview = _renderFlowAnchorPreview;

    // Reflete _flowAnchorSideByIdx no toggle "Auto" ao lado do label --
    // track azul preenchido + bolinha à direita quando nenhum card tem lado
    // manual escolhido, cinza + bolinha à esquerda quando ao menos um tem.
    function _renderFlowAnchorAutoToggle() {
      const track = document.getElementById('flow-anchor-auto-track');
      const knob = document.getElementById('flow-anchor-auto-knob');
      const btn = document.getElementById('flow-anchor-auto-btn');
      if (!track || !knob) return;
      const isAuto = Object.keys(_flowAnchorSideByIdx).length === 0;
      track.classList.toggle('bg-[#3d3dff]', isAuto);
      track.classList.toggle('bg-gray-300', !isAuto);
      track.classList.toggle('dark:bg-slate-600', !isAuto);
      knob.style.transform = isAuto ? 'translateX(0.625rem)' : 'translateX(0)';
      if (btn) btn.classList.toggle('text-[#3d3dff]', isAuto);
      if (btn) btn.classList.toggle('text-slate-400', !isAuto);
    }

    // Clicar de novo no mesmo lado já ativo pra um card desclica aquele card
    // (volta pro automático só nele) -- os demais cards mantêm sua própria
    // escolha, independente. idxOrAuto é um índice numérico (saída daquele
    // card), a chave especial 'end' (entrada no último card da cadeia), ou
    // 'auto' (chamado pelo toggle do header, que limpa TODAS as escolhas
    // manuais de uma vez).
    function _setFlowAnchorSide(idxOrAuto, side) {
      if (idxOrAuto === 'auto') {
        _flowAnchorSideByIdx = {};
      } else if (_flowAnchorSideByIdx[idxOrAuto] === side) {
        delete _flowAnchorSideByIdx[idxOrAuto];
      } else {
        _flowAnchorSideByIdx[idxOrAuto] = side;
      }
      _renderFlowAnchorPreview();
    }
    window._setFlowAnchorSide = _setFlowAnchorSide;

    let currentFlowType = null;

    function selectFlowType(type) {
      currentFlowType = type;

      // Reset all cards (both main screen and modal) using inline styles for reliability
      document.querySelectorAll('.flow-type-card, .flow-type-card-modal').forEach(el => {
        el.style.borderColor = '';
        el.style.backgroundColor = '';
        const icon = el.querySelector('i[data-lucide]');
        if (icon) icon.style.color = '';
        const diamond = el.querySelector('.rotate-45');
        if (diamond) diamond.style.borderColor = '';
      });

      // Highlight selected card
      const activeCard = document.getElementById(`form-flow-${type}`) || document.getElementById(`flow-${type}`);
      if (activeCard) {
        activeCard.style.borderColor = '#3d3dff';
        activeCard.style.backgroundColor = 'rgba(61, 61, 255, 0.08)';
        const icon = activeCard.querySelector('i[data-lucide]');
        if (icon) icon.style.color = '#3d3dff';
        const diamond = activeCard.querySelector('.rotate-45');
        if (diamond) diamond.style.borderColor = '#3d3dff';
      }

      const chipContainer = document.getElementById('flow-chip-container');
      if (chipContainer) {
        const hasChip = ['line_solid', 'line_dashed', 'diamond', 'diamond_dashed'].includes(type);
        chipContainer.classList.toggle('hidden', !hasChip);
      }
      const chipTextInput = document.getElementById('flow-chip-text');
      if (chipTextInput) _updateCharCount(chipTextInput, 20);

      // Estilo de conector só faz sentido em linha pura -- diamond/evento
      // têm forma própria com semântica fixa, moldar a linha até eles
      // confundiria a leitura do fluxograma (ver _buildFlowConnection em code.js).
      const styleContainer = document.getElementById('flow-connector-style-container');
      if (styleContainer) {
        const hasStyle = ['line_solid', 'line_dashed'].includes(type);
        styleContainer.classList.toggle('hidden', !hasStyle);
      }

      // Enable confirm button
      const btn = document.getElementById('btn-confirm-flow');
      if (btn) {
        btn.disabled = false;
        btn.style.backgroundColor = '#3d3dff';
        btn.style.cursor = 'pointer';
        btn.classList.remove('bg-gray-300', 'cursor-not-allowed');
      }
      _updateFlowConfirmButtonLabel();

      // Auto-scroll to bottom of modal
      setTimeout(() => {
        const modalBody = document.querySelector('#flow-form-modal .overflow-y-auto');
        if (modalBody) modalBody.scrollTo({ top: modalBody.scrollHeight, behavior: 'smooth' });
      }, 150);
    }
    window.selectFlowType = selectFlowType;

    // Cadeia (N>2) é sempre 1 lado de ancoragem aplicado a todas as N-1
    // conexões — Decisão tem resposta específica por conexão (ex: "Sim"
    // não faz sentido repetido em 3 setas), então fica restrita a
    // exatamente 2 elementos selecionados; Sequência/Mensagem funcionam
    // em cadeia normalmente.
    function _updateFlowDecisionAvailability() {
      const isChain = _orderedFlowAnchorNodes().length > 2;
      ['diamond', 'diamond_dashed'].forEach(type => {
        const card = document.getElementById(`form-flow-${type}`) || document.getElementById(`flow-${type}`);
        if (!card) return;
        card.classList.toggle('opacity-40', isChain);
        if (card.tagName === 'BUTTON') card.disabled = isChain;
        card.title = isChain ? 'Decisão não é suportada em cadeia com mais de 2 elementos. Para ramificar a partir de um card já conectado, feche este modal, selecione esse card + o novo elemento do caminho alternativo, e conecte só esses dois com Decisão.' : '';
      });
      if (isChain && (currentFlowType === 'diamond' || currentFlowType === 'diamond_dashed')) {
        currentFlowType = null;
        const btn = document.getElementById('btn-confirm-flow');
        if (btn) {
          btn.disabled = true;
          btn.classList.add('bg-gray-300', 'cursor-not-allowed');
        }
      }
    }
    window._updateFlowDecisionAvailability = _updateFlowDecisionAvailability;

    function _updateFlowConfirmButtonLabel() {
      const btn = document.getElementById('btn-confirm-flow');
      if (!btn) return;
      const n = _orderedFlowAnchorNodes().length;
      const label = btn.querySelector('span') || btn;
      label.textContent = n > 2 ? `Conectar ${n} Telas` : 'Conectar Agora';
    }
    window._updateFlowConfirmButtonLabel = _updateFlowConfirmButtonLabel;
      
    function openFlowFormModal() {
      openModal('flow-form-modal');
      currentFlowType = null;

      // Limpa o mini-mapa de ancoragem de uma renderização anterior até a
      // resposta de get-flow-selection-bounds chegar (evita lixo visual).
      _flowAnchorNodes = [];
      _flowAnchorSideByIdx = {};
      _flowConnectorStyleManuallySet = false;
      _renderFlowAnchorPreview();
      const journeyNameInput = document.getElementById('flow-name-input');
      if (journeyNameInput) {
        journeyNameInput.value = '';
        _updateCharCount(journeyNameInput, 70);
        // openModal() foca o primeiro elemento focável do DOM (o botão "X"
        // de fechar, que vem antes no HTML) -- no Figma desktop, o painel
        // do plugin roda num iframe, e o primeiro clique do usuário em
        // qualquer lugar às vezes só "acorda" o foco da janela do iframe
        // sem repassar o evento ao elemento clicado, dando a impressão de
        // que o campo está travado/desabilitado até um segundo clique.
        // Focar aqui o campo mais provável de uso (nome da jornada) reduz
        // a chance do usuário precisar de um clique extra pra digitar.
        setTimeout(() => journeyNameInput.focus(), 0);
      }
      window._pendingJourneyName = '';
      const autoMarkInput = document.getElementById('flow-auto-mark-endpoints');
      if (autoMarkInput) autoMarkInput.checked = false;
      parent.postMessage({ pluginMessage: { type: 'get-flow-selection-bounds' } }, '*');
      // Liga o listener de selectionchange no backend só enquanto este modal
      // está aberto — desligado em closeFlowFormModal().
      parent.postMessage({ pluginMessage: { type: 'track-flow-anchor-preview', active: true } }, '*');

      // Reset all type card visual feedback
      document.querySelectorAll('.flow-type-card, .flow-type-card-modal').forEach(el => {
        el.style.borderColor = '';
        el.style.backgroundColor = '';
        const icon = el.querySelector('i[data-lucide]');
        if (icon) icon.style.color = '';
        const diamond = el.querySelector('.rotate-45');
        if (diamond) diamond.style.borderColor = '';
      });

      const chipContainer = document.getElementById('flow-chip-container');
      if (chipContainer) chipContainer.classList.add('hidden');

      const styleContainer = document.getElementById('flow-connector-style-container');
      if (styleContainer) styleContainer.classList.add('hidden');
      const straightRadio = document.querySelector('input[name="flow-connector-style"][value="straight"]');
      if (straightRadio) straightRadio.checked = true;

      const decContainer = document.getElementById('flow-decision-container');
      if (decContainer) decContainer.classList.add('hidden');

      const btn = document.getElementById('btn-confirm-flow');
      if (btn) {
        btn.disabled = true;
        btn.style.backgroundColor = '';
        btn.style.cursor = '';
        btn.classList.add('bg-gray-300', 'cursor-not-allowed');
        btn.classList.remove('bg-[#3d3dff]', 'hover:bg-blue-700');
      }
    }


    function confirmFlowConnection() {
      const type = currentFlowType;
      const textInput = document.getElementById('flow-chip-text');
      // maxlength=20 no HTML só bloqueia digitação normal -- colar texto
      // (Ctrl+V) ou preencher via JS ignora o atributo, então o limite real
      // precisa ser garantido aqui antes de salvar. Sem isso, um paste
      // grande vira o nome do node no canvas sem limite nenhum.
      const text = textInput ? textInput.value.slice(0, 20) : '';

      // O campo do modal virou "Nome da Jornada" (ver Mudança 2) -- não é
      // mais o flow.name de uma conexão isolada. Guardado em
      // window._pendingJourneyName pra os handlers de flow-created/
      // flow-marker-moved (messages.js) aplicarem em journeyName de cada
      // conexão criada nesta operação, deixando flow.name (rótulo do grupo
      // no canvas e do item na lista) com um nome descritivo por tipo.
      const journeyNameInput = document.getElementById('flow-name-input');
      const journeyName = journeyNameInput ? journeyNameInput.value.trim().slice(0, 70) : '';
      window._pendingJourneyName = journeyName;

      const flowName = FLOW_TYPE_DEFAULT_NAMES[type] || `Conexão ${handoffData.nextFlowNumber || 1}`;

      // Lado por card (índice = origem do segmento na cadeia, ver
      // _flowAnchorSideByIdx) -- ausência de índice = automático só naquele
      // segmento. flowSide (singular) é mantido só como retrocompatibilidade
      // pro caso de 1 evento isolado (Início/Fim antigo, sem par B) e pro
      // backend que ainda lê msg.flowSide como fallback quando
      // flowSidesByIndex não cobre o índice. flowEndSide é o lado de
      // ENTRADA no último card da cadeia (chave 'end' em
      // _flowAnchorSideByIdx) -- só se aplica ao último segmento.
      const flowSidesByIndex = _orderedFlowAnchorNodes().map((_, i) => _flowAnchorSideByIdx[i] || 'auto');
      const flowEndSide = _flowAnchorSideByIdx.end || 'auto';

      const styleInput = document.querySelector('input[name="flow-connector-style"]:checked');
      const connectorStyle = styleInput ? styleInput.value : 'straight';

      const curvatureInput = document.getElementById('flow-curvature-input');
      const curvature = curvatureInput ? Number(curvatureInput.value) || 0 : 0;

      const autoMarkInput = document.getElementById('flow-auto-mark-endpoints');
      const autoMarkEndpoints = autoMarkInput ? autoMarkInput.checked : false;

      parent.postMessage({
        pluginMessage: {
          type: 'create-flow-connection',
          flowType: type,
          decisionText: text,
          flowName: flowName,
          flowSide: flowSidesByIndex[0] || 'auto',
          flowSidesByIndex: flowSidesByIndex,
          flowEndSide: flowEndSide,
          connectorStyle: connectorStyle,
          curvature: curvature,
          nextFlowNumber: handoffData.nextFlowNumber || 1,
          flowId: String(Date.now()),
          autoMarkEndpoints: autoMarkEndpoints
        }
      }, '*');
      closeModal('flow-form-modal');
    }

    function confirmDecisionConnection() {
      const textInput = document.getElementById('decision-text-input');
      const text = textInput ? textInput.value.trim() : '';
      closeModal('decision-modal');
      if (text) showToast(`Decisão registrada: "${text}"`, 'success');
    }
    window.confirmDecisionConnection = confirmDecisionConnection;

    function switchSpecTab(tabId) {
      currentSpecTab = tabId;
      renderSpecsList();
      updateFABVisibility();
    }

    function renderFlowsList() {
      const containers = [
        document.getElementById('flows-results'),
        document.getElementById('flows-results-home')
      ].filter(Boolean);
      if (!containers.length) return;

      const finalizeWrap = document.getElementById('btn-finalize-flows-wrap');
      const resyncBtn = document.getElementById('btn-resync-flows');
      const collapseBtn = document.querySelector('#view-flows [data-collapse-toggle]');
      const sectionTitle = document.getElementById('flows-section-title');

      if (!handoffData.createdFlows || handoffData.createdFlows.length === 0) {
        const emptyHtml = `
          <li class="empty-state-placeholder flex flex-col items-center list-none">
            <div class="relative mb-4">
              <i data-lucide="git-branch" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
            </div>
            <p class="text-[12px] font-bold text-slate-500 dark:text-dark-muted text-center px-4 mb-1">Nenhum fluxo criado ainda</p>
            <p class="text-[10px] text-slate-400 dark:text-dark-muted text-center px-6">Selecione 2 elementos no canvas e toque em <button type="button" onclick="openFlowFormModal()" class="font-bold text-[#2e2ee0] dark:text-[#4da3e0] hover:underline">Conectar Frames</button></p>
          </li>
        `;
        containers.forEach(c => c.innerHTML = emptyHtml);
        if (finalizeWrap) finalizeWrap.classList.add('hidden');
        if (resyncBtn) resyncBtn.classList.add('hidden');
        if (collapseBtn) collapseBtn.classList.add('hidden');
        if (sectionTitle) sectionTitle.classList.add('hidden');
        _updateContentHint('hint-flows', false);
        _refreshIcons();
        return;
      }
      if (finalizeWrap) finalizeWrap.classList.remove('hidden');
      if (resyncBtn) resyncBtn.classList.remove('hidden');
      _updateContentHint('hint-flows', true);

      const FLOW_TYPE_LABELS = {
        'line_solid': 'Linha Sólida',
        'line_dashed': 'Linha Tracejada',
        'diamond': 'Ponto de Decisão',
        'diamond_dashed': 'Decisão Tracejada',
        'gateway_parallel': 'Gateway Paralelo',
        'event_start': 'Início de Fluxo',
        'event_end': 'Fim de Fluxo'
      };

      // idx sempre se refere à posição no array PLANO handoffData.createdFlows
      // -- openEditFlowModal/deleteNode dependem desse índice, o
      // agrupamento visual em jornadas não pode perder essa referência.
      const flatIndexOf = (flow) => handoffData.createdFlows.indexOf(flow);

      const journeys = computeFlowJourneys(handoffData.createdFlows);
      if (sectionTitle) {
        sectionTitle.classList.remove('hidden');
        sectionTitle.textContent = `Fluxos Desenhados (${journeys.length})`;
      }

      const html = journeys.map(journey => {
        const itemsHtml = journey.conexoes.map(flow => {
          const idx = flatIndexOf(flow);
          const isVisible = flow.visible !== false;
          const typeLabel = FLOW_TYPE_LABELS[flow.type] || flow.type.replace(/_/g, ' ').toUpperCase();
          const isEndpoint = flow.type === 'event_start' || flow.type === 'event_end';
          const defaultName = flow.type === 'diamond' || flow.type === 'diamond_dashed' ? 'Ponto de Decisão' : (flow.type === 'gateway_parallel' ? 'Fork/Paralelo' : (flow.type === 'event_start' ? 'Início' : (flow.type === 'event_end' ? 'Fim' : 'Conexão de Fluxo')));
          return `
          <li role="button" tabindex="0" class="group relative bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-slate-800 transition-all cursor-pointer px-3.5 py-3.5"
               onclick="focusNode('${flow.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();focusNode('${flow.id}');}" aria-label="Focar na conexão ${escapeHtml(flow.name || defaultName)} no Figma">
            <div class="flex items-center gap-3 w-full">
              <div class="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-800/50">
                <i data-lucide="${flow.type.includes('diamond') ? 'help-circle' : (flow.type === 'gateway_parallel' ? 'git-fork' : (flow.type.includes('event') ? 'circle' : 'arrow-right'))}" class="w-4 h-4 text-[#3d3dff] dark:text-blue-400"></i>
              </div>

              <div class="flex-1 overflow-hidden">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 flex-1 min-w-0">
                    <span class="w-full text-[12px] font-bold text-slate-800 dark:text-white truncate" ${isEndpoint ? 'title="Início e Fim de jornada não podem ser renomeados"' : ''}>${escapeHtml(flow.name || defaultName)}</span>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    ${!isEndpoint ? `
                    <button onclick="event.stopPropagation(); openEditFlowModal(${idx})" title="Editar nome, tipo e estilo" aria-label="Editar conexão"
                      class="w-7 h-7 rounded-xl flex items-center justify-center ${isVisible ? 'text-[#3d3dff]' : 'text-gray-400'} hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all">
                      <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>` : ''}
                    <button onclick="event.stopPropagation(); toggleFlowVisibility('${flow.id}', ${idx})"
                      class="w-7 h-7 rounded-xl flex items-center justify-center ${isVisible ? 'text-[#3d3dff]' : 'text-gray-400'} hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                      title="${isVisible ? 'Ocultar fluxo' : 'Exibir fluxo'}" aria-label="Alterar visibilidade">
                      <i data-lucide="${isVisible ? 'eye' : 'eye-off'}" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deleteNode('${flow.id}', ${idx}, 'flow')" title="Excluir" aria-label="Excluir fluxo"
                      class="w-7 h-7 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                </div>

                <div class="mt-1.5 flex items-center gap-2">
                  <span class="text-[8px] text-gray-500 dark:text-dark-muted font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-900/50 px-1.5 py-0.5 rounded border border-gray-100 dark:border-dark-line">
                    ${typeLabel}
                  </span>
                </div>
              </div>
            </div>
          </li>
        `;
        }).join('');

        // Grupo de 1 conexão só: fica exatamente como uma conexão solta,
        // sem moldura/header de card — evita ruído visual pra um "grupo"
        // trivial (não há ação de jornada que faça sentido reduzida a N=1).
        if (journey.conexoes.length === 1) {
          return `<ul class="rounded-2xl border border-gray-100 dark:border-dark-line hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md transition-all overflow-hidden active:scale-[0.98]">${itemsHtml}</ul>`;
        }

        const journeyKey = journey.conexoes[0].id;
        const allVisible = journey.conexoes.every(f => f.visible !== false);
        const journeyNameEsc = journey.isUnnamed ? '' : escapeHtml(journey.nome);

        return `
        <li class="border border-gray-100 dark:border-dark-line rounded-2xl shadow-sm bg-gray-50/30 dark:bg-slate-900/20">
          <div class="p-3 flex items-center gap-2 bg-gray-100/50 dark:bg-slate-800/50 rounded-t-2xl">
            <div class="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-800/50">
              <i data-lucide="git-branch" class="w-4 h-4 text-[#3d3dff] dark:text-blue-400"></i>
            </div>
            <div role="button" tabindex="0" class="flex-1 min-w-0 flex items-center gap-1.5 cursor-pointer" onclick="toggleFlowJourneyAccordion(this)" onkeydown="if((event.key==='Enter'||event.key===' ')&&event.target===event.currentTarget){event.preventDefault();toggleFlowJourneyAccordion(this);}" aria-label="Expandir/recolher jornada ${journey.isUnnamed ? 'sem nome' : escapeHtml(journey.nome)}">
              <input type="text"
                value="${journeyNameEsc}"
                placeholder="Jornada sem nome"
                maxlength="70"
                class="journey-name-input flex-1 min-w-0 text-[13px] font-bold text-slate-800 dark:text-white rounded truncate bg-transparent placeholder:text-slate-400 dark:placeholder:text-dark-muted placeholder:italic"
                onchange="renameJourney('${journeyKey}', this.value)"
                onkeydown="if(event.key==='Enter') this.blur()"
                onclick="event.stopPropagation()" />
              <span class="shrink-0 text-[10px] text-slate-400 dark:text-dark-muted font-bold">${journey.conexoes.length} conexões</span>
            </div>
            <div class="relative shrink-0">
              <button type="button" onclick="event.stopPropagation(); toggleFlowJourneyMenu(this)" title="Mais ações da jornada" aria-label="Mais ações da jornada"
                class="p-2 hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition-colors text-gray-500 dark:text-dark-muted">
                <i data-lucide="more-horizontal" class="w-4 h-4"></i>
              </button>
              <div class="hidden absolute right-0 top-full mt-1 z-20 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl shadow-lg py-1 min-w-[190px] journey-menu-panel">
                <button type="button" onclick="event.stopPropagation(); focusJourneyNameInput(this)" class="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-slate-600 dark:text-dark-muted hover:bg-slate-50 dark:hover:bg-dark-line/20 transition-colors text-left">
                  <i data-lucide="pencil" class="w-3.5 h-3.5 shrink-0"></i><span>Renomear jornada</span>
                </button>
                <button type="button" onclick="event.stopPropagation(); toggleJourneyVisibility('${journeyKey}')" class="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-slate-600 dark:text-dark-muted hover:bg-slate-50 dark:hover:bg-dark-line/20 transition-colors text-left">
                  <i data-lucide="${allVisible ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5 shrink-0"></i><span>${allVisible ? 'Ocultar jornada' : 'Exibir jornada'}</span>
                </button>
                <button type="button" onclick="event.stopPropagation(); deleteJourney('${journeyKey}')" class="w-full flex items-center gap-2 px-3 py-2 mt-1 pt-2 border-t border-gray-100 dark:border-dark-line text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5 shrink-0"></i><span>Excluir jornada completa</span>
                </button>
              </div>
            </div>
            <button type="button" class="p-1 shrink-0" title="Expandir/recolher jornada" aria-label="Expandir/recolher jornada" onclick="toggleFlowJourneyAccordion(this)">
              <i data-lucide="chevron-down" class="journey-chevron w-4 h-4 text-gray-500 dark:text-dark-muted transition-transform shrink-0"></i>
            </button>
          </div>
          <ul data-accordion-content class="divide-y divide-gray-50 dark:divide-dark-line/50 border-l-2 border-dashed border-[#3d3dff]/40 ml-5 rounded-b-2xl overflow-hidden">${itemsHtml}</ul>
        </li>
      `;
      }).join('');

      containers.forEach(c => c.innerHTML = html);
      // "Expandir/recolher todos" só faz sentido havendo ao menos 1 jornada
      // com accordion de verdade (2+ conexões) -- jornada de 1 conexão
      // renderiza sem moldura/chevron, nada pra recolher.
      if (collapseBtn) collapseBtn.classList.toggle('hidden', !journeys.some(j => j.conexoes.length > 1));
      _refreshIcons();
    }

    function toggleFlowJourneyAccordion(el) {
      const card = el.closest('li');
      const body = card && card.querySelector('ul');
      const chevron = card && card.querySelector('.journey-chevron');
      if (!body || !chevron) return;
      body.classList.toggle('hidden');
      chevron.classList.toggle('rotate-180');
    }
    window.toggleFlowJourneyAccordion = toggleFlowJourneyAccordion;

    function toggleFlowJourneyMenu(btn) {
      const panel = btn.nextElementSibling;
      if (!panel) return;
      document.querySelectorAll('.journey-menu-panel').forEach(p => { if (p !== panel) p.classList.add('hidden'); });
      panel.classList.toggle('hidden');
    }
    window.toggleFlowJourneyMenu = toggleFlowJourneyMenu;

    document.addEventListener('click', (e) => {
      if (e.target.closest('.journey-menu-panel') || e.target.closest('[onclick*="toggleFlowJourneyMenu"]')) return;
      document.querySelectorAll('.journey-menu-panel').forEach(p => p.classList.add('hidden'));
    });

    function focusJourneyNameInput(menuItemEl) {
      const card = menuItemEl.closest('li');
      const input = card && card.querySelector('.journey-name-input');
      document.querySelectorAll('.journey-menu-panel').forEach(p => p.classList.add('hidden'));
      if (input) { input.focus(); input.select(); }
    }
    window.focusJourneyNameInput = focusJourneyNameInput;

    // journeyKey é o sourceId da primeira conexão do grupo no momento do
    // render -- suficiente pra reidentificar o grupo (computeFlowJourneys
    // é determinístico), nunca persistido como id de jornada.
    function _journeyMembersByKey(journeyKey) {
      const journeys = computeFlowJourneys(handoffData.createdFlows);
      const journey = journeys.find(j => j.conexoes[0] && j.conexoes[0].id === journeyKey);
      return journey ? journey.conexoes : [];
    }

    function renameJourney(journeyKey, newName) {
      // maxlength=70 no HTML não bloqueia paste -- trunca de novo aqui.
      const trimmed = (newName || '').trim().slice(0, 70);
      const members = _journeyMembersByKey(journeyKey);
      members.forEach(f => { f.journeyName = trimmed || null; });
      saveToStorage();
      renderFlowsList();
    }
    window.renameJourney = renameJourney;

    function toggleJourneyVisibility(journeyKey) {
      const members = _journeyMembersByKey(journeyKey);
      if (!members.length) return;
      const allVisible = members.every(f => f.visible !== false);
      const targetState = !allVisible;
      members.forEach(f => {
        f.visible = targetState;
        if (f.id) parent.postMessage({ pluginMessage: { type: 'hide-node', id: f.id, forceState: targetState } }, '*');
      });
      saveToStorage();
      renderFlowsList();
    }
    window.toggleJourneyVisibility = toggleJourneyVisibility;

    // Exclusão de jornada é destrutiva e irreversível (remove todas as
    // conexões do grupo do canvas) -- confirmação em modal, diferente do
    // "clique duas vezes" usado no delete de conexão individual, já que
    // chegar aqui já exige abrir o menu "···" primeiro (fricção equivalente).
    function deleteJourney(journeyKey) {
      const members = _journeyMembersByKey(journeyKey);
      if (!members.length) return;
      const namedMember = members.find(f => f.journeyName && f.journeyName.trim());
      const label = namedMember ? `"${namedMember.journeyName.trim()}"` : 'sem nome';
      const n = members.length;
      const confirmed = window.confirm(
        `Excluir a jornada ${label} e ${n === 1 ? 'sua conexão' : `suas ${n} conexões`}? Todas as setas, decisões e marcadores desse fluxo serão removidos do canvas. Essa ação não pode ser desfeita.`
      );
      if (!confirmed) return;
      members.forEach(f => {
        if (f.id) parent.postMessage({ pluginMessage: { type: 'delete-node', id: f.id } }, '*');
      });
      const memberIds = new Set(members.map(f => f.flowUid || f.id));
      handoffData.createdFlows = handoffData.createdFlows.filter(f => !memberIds.has(f.flowUid || f.id));
      saveToStorage();
      renderFlowsList();
      showToast(`Jornada excluída — ${n === 1 ? '1 conexão removida' : `${n} conexões removidas`}.`);
    }
    window.deleteJourney = deleteJourney;

    function resyncAllFlows() {
      const flows = handoffData.createdFlows || [];
      if (flows.length === 0) return;
      parent.postMessage({ pluginMessage: { type: 'resync-all-flows', flows: flows } }, '*');
    }
    window.resyncAllFlows = resyncAllFlows;

    function createLegend() {
      parent.postMessage({ pluginMessage: { type: 'create-legend' } }, '*');
    }

    // --- CONTROLE DE SCROLL (CONSOLIDADO) ---

    // Tipos que podem ser trocados entre si no modal de edição -- exclui
    // event_start/event_end (marcadores de Início/Fim, sem targetId e com
    // fluxo de criação totalmente diferente, não fazem sentido aqui) e
    // gateway_parallel (não exposto na criação normal). Uma conexão editada
    // é sempre um par sourceId+targetId, nunca uma cadeia de 3+, então a
    // restrição de "Decisão exige exatamente 2 elementos" já vale por
    // construção -- pode trocar livremente entre os 4.
    const EDITABLE_FLOW_TYPES = ['line_solid', 'line_dashed', 'diamond', 'diamond_dashed'];
    let _editingFlowType = null;

    // line_solid/line_dashed ficam de fora de propósito: na criação
    // (confirmFlowConnection), o fallback é `Conexão N` (nextFlowNumber),
    // mais informativo numa lista com várias linhas do mesmo tipo do que um
    // rótulo genérico repetido "Sequência"/"Sequência"/"Sequência". Na
    // edição (confirmEditFlow), esses dois tipos são tratados à parte com
    // EDIT_FLOW_TYPE_FALLBACK_NAMES, que só entra em jogo quando o usuário
    // TROCA de tipo (ex: de Decisão pra Sequência) e precisa de um nome
    // novo que não seja mais "Ponto de Decisão".
    const FLOW_TYPE_DEFAULT_NAMES = {
      diamond: 'Ponto de Decisão',
      diamond_dashed: 'Decisão Tracejada',
      gateway_parallel: 'Fork/Paralelo',
      event_start: 'Início',
      event_end: 'Fim'
    };

    // Mesmo padrão de estilo inline de selectFlowType (specifications.js) --
    // não depende de classe CSS condicional (ex: has-[:checked] exige radio,
    // group-[.active] não compila neste setup do Tailwind v3).
    function _selectEditFlowType(type) {
      _editingFlowType = type;
      EDITABLE_FLOW_TYPES.forEach(t => {
        const card = document.getElementById(`edit-flow-type-${t}`);
        if (!card) return;
        card.style.borderColor = '';
        const icon = card.querySelector('i[data-lucide]');
        if (icon) icon.style.color = '';
        const diamond = card.querySelector('.rotate-45');
        if (diamond) diamond.style.borderColor = '';
      });
      const activeCard = document.getElementById(`edit-flow-type-${type}`);
      if (activeCard) {
        activeCard.style.borderColor = '#3d3dff';
        const icon = activeCard.querySelector('i[data-lucide]');
        if (icon) icon.style.color = '#3d3dff';
        const diamond = activeCard.querySelector('.rotate-45');
        if (diamond) diamond.style.borderColor = '#3d3dff';
      }
    }
    window._selectEditFlowType = _selectEditFlowType;

    function openEditFlowModal(idx) {
      const flow = handoffData.createdFlows[idx];
      if (!flow || !flow.sourceId) {
        showToast('Este fluxo não pode ser editado — foi criado antes deste recurso existir.', 'error');
        return;
      }
      if (!flow.targetId || !EDITABLE_FLOW_TYPES.includes(flow.type)) {
        showToast('Marcadores de Início/Fim não têm tipo editável — apague e recrie se precisar mudar.', 'error');
        return;
      }
      // Único nome de variável compartilhado com messages.js (flow-created)
      // -- nomes divergentes aqui já causaram confusão em revisão; manter
      // um só evita que um refator futuro quebre o fluxo de edição em
      // silêncio (sintoma seria "editar duplica em vez de substituir").
      window._editingFlowIndex = idx;
      _selectEditFlowType(flow.type);
      const nameInput = document.getElementById('edit-flow-name-input');
      if (nameInput) {
        nameInput.value = flow.name || '';
        _updateCharCount(nameInput, 20);
      }
      const textInput = document.getElementById('edit-flow-chip-text');
      if (textInput) {
        textInput.value = flow.decisionText || '';
        _updateCharCount(textInput, 20);
      }
      const style = flow.connectorStyle || 'straight';
      const styleRadio = document.querySelector(`input[name="edit-flow-connector-style"][value="${style}"]`);
      if (styleRadio) styleRadio.checked = true;
      const saveBtn = document.getElementById('edit-flow-save-btn');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Salvar'; }
      openModal('edit-flow-modal');
      _refreshIcons();
    }
    window.openEditFlowModal = openEditFlowModal;

    function closeEditFlowModal() {
      window._editingFlowIndex = null;
      closeModal('edit-flow-modal');
    }
    window.closeEditFlowModal = closeEditFlowModal;

    function confirmEditFlow() {
      const idx = window._editingFlowIndex;
      if (typeof idx !== 'number') return;
      const flow = handoffData.createdFlows[idx];
      if (!flow) return;

      // Guard contra clique duplo: sem isso, um segundo clique antes da
      // resposta do primeiro chegar reenviaria o mesmo oldGroupId (já
      // removido pelo backend na primeira chamada), deixando o grupo criado
      // pela primeira edição órfão no canvas (ver achado de QA).
      const saveBtn = document.getElementById('edit-flow-save-btn');
      if (saveBtn) {
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Salvando...';
        _refreshIcons();
      }

      const nameInput = document.getElementById('edit-flow-name-input');
      const textInput = document.getElementById('edit-flow-chip-text');
      const styleInput = document.querySelector('input[name="edit-flow-connector-style"]:checked');
      const curvatureInput = document.getElementById('edit-flow-curvature-input');
      // Mesmo motivo do confirmFlowConnection: maxlength do HTML não
      // protege contra paste/preenchimento via JS, trunca de novo aqui.
      const typedName = nameInput ? nameInput.value.slice(0, 20).trim() : '';
      const decisionText = textInput ? textInput.value.slice(0, 20) : '';
      const connectorStyle = styleInput ? styleInput.value : 'straight';
      const curvature = curvatureInput ? Number(curvatureInput.value) || 0 : 0;

      // Nome: prioriza o que o usuário digitou no campo. Se deixou vazio E
      // o tipo mudou (ex: Sequência -> Decisão), cai no nome padrão do tipo
      // novo, pra não deixar um fluxo tipo "Sequência" com nome "Ponto de
      // Decisão" sobrando de antes da troca (ou vice-versa).
      const EDIT_FLOW_TYPE_FALLBACK_NAMES = Object.assign({ line_solid: 'Sequência', line_dashed: 'Mensagem' }, FLOW_TYPE_DEFAULT_NAMES);
      const newType = _editingFlowType || flow.type;
      const flowName = typedName || (newType === flow.type && flow.name) || EDIT_FLOW_TYPE_FALLBACK_NAMES[newType] || flow.name || '';

      parent.postMessage({
        pluginMessage: {
          type: 'edit-flow-connection',
          flowType: newType,
          flowName: flowName,
          sourceId: flow.sourceId,
          targetId: flow.targetId || null,
          decisionText: decisionText,
          flowSide: flow.flowSide || 'auto',
          connectorStyle: connectorStyle,
          curvature: curvature,
          nextFlowNumber: handoffData.nextFlowNumber || 1,
          flowId: flow.flowUid || String(Date.now()),
          oldGroupId: flow.id
        }
      }, '*');
      closeModal('edit-flow-modal');
    }
    window.confirmEditFlow = confirmEditFlow;

    function toggleFlowVisibility(id, idx) {
      const flow = handoffData.createdFlows[idx];
      flow.visible = flow.visible === false ? true : false;
      
      parent.postMessage({ 
        pluginMessage: { 
          type: flow.visible ? 'show-node' : 'hide-node', 
          id 
        } 
      }, '*');
      
      saveToStorage();
      renderFlowsList();
    }

function toggleLinkInput(show) {
      const container = document.getElementById('spec-link-container');
      container.classList.toggle('hidden', !show);
      if (!show) document.getElementById('spec-link-input').value = '';
      _refreshIcons();
    }

    function openSpecFormModal(frameId) {
      if (frameId) activeFrameId = frameId;
      // Modo criação: limpa campos e reseta estado
      document.getElementById('spec-form-modal').dataset.editIdx = '';
      // Captura o elemento vinculado JÁ na abertura do modal (não no envio
      // final) -- assim, mesmo que a seleção do canvas mude depois (ex: ao
      // marcar a posição, ver markSpecPosition), a referência ao elemento
      // documentado nunca se perde. Preservado se já havia um pendente de
      // uma marcação de posição anterior no mesmo modal (reabertura).
      if (!window._pendingSpecTargetNodeId) {
        parent.postMessage({ pluginMessage: { type: 'get-selection-id-for-spec' } }, '*');
      }
      document.getElementById('spec-letter-input').value = typeof _suggestNextSpecTag === 'function' ? _suggestNextSpecTag(activeFrameId) : 'A';
      document.getElementById('spec-color-input').value = '#2e2ee0';
      if (typeof validateSpecLetterInput === 'function') validateSpecLetterInput();
      document.getElementById('ann-category').value = '';
      if (typeof _csSyncLabel === 'function') _csSyncLabel('cs-ann-cat');
      if (typeof syncSpecColorFromCategory === 'function') syncSpecColorFromCategory();
      document.getElementById('spec-link-input').value = '';
      document.getElementById('ann-note').value = '';
      _updateCharCount(document.getElementById('ann-note'), 500);
      
      // Reset link checkbox
      document.getElementById('chk-has-link').checked = false;
      toggleLinkInput(false);

      const drawConnChk = document.getElementById('chk-draw-connection');
      if (drawConnChk) drawConnChk.checked = true;
      const straightStyleRadio = document.querySelector('input[name="spec-connector-style"][value="straight"]');
      if (straightStyleRadio) straightStyleRadio.checked = true;
      _toggleSpecConnectionCurvature(true);

      const modalTitle = document.querySelector('#spec-form-modal h3');
      if (modalTitle) {
        modalTitle.innerHTML = '<i data-lucide="plus-circle" class="w-4 h-4 text-[#2e2ee0]"></i> Criar Especificação/Nota';
      }
      const confirmBtn = document.getElementById('btn-spec-form-confirm');
      if (confirmBtn) {
        confirmBtn.textContent = 'Ir para Propriedades';
        confirmBtn.onclick = requestSpecProperties;
      }
      document.getElementById('spec-form-modal').classList.remove('hidden');
      updateFABVisibility(true);
      _refreshIcons();
      // Figma Desktop às vezes demora alguns segundos pra ceder foco de
      // teclado à janela do plugin -- insiste em focar o campo de Tag
      // (primeiro campo real do formulário) até o foco realmente "pegar",
      // em vez de exigir um clique manual do usuário que pode não
      // funcionar se cair dentro dessa janela de atraso (ver
      // _persistentFocus em core.js).
      if (typeof _persistentFocus === 'function') {
        _persistentFocus(document.getElementById('spec-letter-input'));
      }
    }

    function closeSpecFormModal() {
      document.getElementById('spec-form-modal').classList.add('hidden');
      document.getElementById('spec-form-modal').dataset.editIdx = '';
      updateFABVisibility(false);
      // Fechar sem salvar (Cancelar/X) não deve deixar elemento/posição
      // "presos" pra próxima spec criada -- openSpecPositionModal recalcula
      // o texto do botão a partir disso na próxima vez que essa etapa abrir.
      window._pendingSpecPosition = null;
      window._pendingSpecTargetNodeId = null;
    }

    // Chamada pelo handler de resposta (messages.js) com o id do elemento
    // selecionado no momento em que o modal de criação abriu -- fixa a
    // referência ANTES de qualquer marcação de posição trocar a seleção.
    function _onSelectionIdForSpec(targetNodeId) {
      window._pendingSpecTargetNodeId = targetNodeId || null;
      if (!targetNodeId) {
        _onNodeNameForSpec(null);
        return;
      }
      parent.postMessage({ pluginMessage: { type: 'get-node-name', nodeId: targetNodeId } }, '*');
    }
    window._onSelectionIdForSpec = _onSelectionIdForSpec;

    function _onNodeNameForSpec(name) {
      // Mesmo indicador existe em três modais (spec-form-modal,
      // spec-position-modal e spec-new-exception-modal) -- atualiza os
      // três, já que o elemento vinculado é o mesmo do início ao fim do
      // fluxo.
      const label = name || 'nenhum elemento selecionado';
      ['spec-form-target-name', 'spec-position-target-name', 'spec-exc-target-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = label;
      });
    }
    window._onNodeNameForSpec = _onNodeNameForSpec;

    // ── Marcar posição no canvas (card fantasma) ────────────────────────
    // A Plugin API não expõe clique bruto no canvas (nem em área vazia) --
    // só reage a mudanças de estado observáveis (seleção, documento). Este
    // fluxo aproxima a intenção "apontar onde quero o card" criando um
    // FANTASMA no tamanho estimado do card final (não um marcador
    // genérico) -- dá noção de onde ele vai caber. Vive numa etapa PRÓPRIA
    // do fluxo (spec-position-modal, entre Propriedades e Exceção, ver
    // modals.html). O modal do Handex é uma janela flutuante (não ocupa a
    // tela toda) -- fica ABERTO o tempo todo durante o arraste, só troca
    // de estado interno (dragging/confirmed), o canvas ao fundo continua
    // acessível pro usuário mover o card livremente.
    let _pendingGhostId = null;

    // Alterna os 2 cards de estado (dragging/confirmed) e os 4 botões do
    // rodapé (Voltar+Avançar quando parado, Usar esta posição+Pular
    // enquanto arrastando) -- ver spec-position-modal em modals.html.
    function _renderSpecPositionState(state) {
      const draggingEl = document.getElementById('spec-position-dragging-state');
      const confirmedEl = document.getElementById('spec-position-confirmed-state');
      const backBtn = document.getElementById('spec-position-back-btn');
      const advanceBtn = document.getElementById('spec-position-advance-btn');
      const confirmBtn = document.getElementById('spec-position-confirm-btn');
      const skipBtn = document.getElementById('spec-position-skip-btn');
      const isDragging = state === 'dragging';
      if (draggingEl) draggingEl.classList.toggle('hidden', !isDragging);
      if (confirmedEl) confirmedEl.classList.toggle('hidden', isDragging);
      if (backBtn) backBtn.classList.toggle('hidden', isDragging);
      if (advanceBtn) advanceBtn.classList.toggle('hidden', isDragging);
      if (confirmBtn) confirmBtn.classList.toggle('hidden', !isDragging);
      if (skipBtn) skipBtn.classList.toggle('hidden', !isDragging);
    }

    function markSpecPosition() {
      if (!window._pendingSpecTargetNodeId) {
        showToast('Selecione um elemento no canvas antes de marcar a posição.', 'error');
        return;
      }
      const g = id => document.getElementById(id);
      const selCat = g('ann-category');
      const noteVal = g('ann-note') ? g('ann-note').value : '';
      parent.postMessage({
        pluginMessage: {
          type: 'create-position-ghost',
          targetNodeId: window._pendingSpecTargetNodeId,
          color: g('spec-color-input') ? g('spec-color-input').value : '#2e2ee0',
          // Só sinalizadores de presença (pra estimar a altura do
          // fantasma no backend) -- sem enviar o conteúdo em si.
          hasCategory: !!(selCat && selCat.value),
          hasNote: !!noteVal.trim()
        }
      }, '*');
      _renderSpecPositionState('dragging');
    }
    window.markSpecPosition = markSpecPosition;

    function _onPositionGhostCreated(ghostId) {
      _pendingGhostId = ghostId;
    }
    window._onPositionGhostCreated = _onPositionGhostCreated;

    function confirmSpecPosition() {
      if (!_pendingGhostId) return;
      parent.postMessage({ pluginMessage: { type: 'read-position-ghost', ghostId: _pendingGhostId } }, '*');
    }
    window.confirmSpecPosition = confirmSpecPosition;

    // "Pular" -- chegar nesta etapa já cria o fantasma automaticamente
    // (ver openSpecPositionModal), então desistir de marcar precisa de uma
    // saída explícita que NÃO tente marcar de novo (senão criaria outro
    // fantasma em loop). Remove o fantasma órfão e segue pra Exceção sem
    // posição pendente -- a spec nasce solta, como se a etapa nunca
    // tivesse existido.
    function skipSpecPosition() {
      if (_pendingGhostId) {
        parent.postMessage({ pluginMessage: { type: 'cancel-position-ghost', ghostId: _pendingGhostId } }, '*');
      }
      _pendingGhostId = null;
      advanceToSpecExceptionStep();
    }
    window.skipSpecPosition = skipSpecPosition;

    // Resposta de read-position-ghost: posição lida, fantasma já removido
    // pelo backend. Confirmar a posição no canvas JÁ É a decisão desta
    // etapa -- avança direto pra Exceção em vez de voltar ao estado
    // "confirmado" pedindo mais um "Avançar" redundante (parecer de UX: a
    // confirmação no canvas é a confirmação da etapa). Só volta a mostrar
    // o estado "confirmado" se o usuário retornar a esta etapa
    // deliberadamente (Voltar vindo de Exceção, ver openSpecPositionModal).
    function _onPositionGhostRead(position) {
      _pendingGhostId = null;
      if (!position) {
        showToast('Não foi possível ler a posição marcada — tente novamente.', 'error');
        _renderSpecPositionState('idle');
        return;
      }
      window._pendingSpecPosition = position;
      advanceToSpecExceptionStep();
    }
    window._onPositionGhostRead = _onPositionGhostRead;

    function toggleAllSpecProperties(checked) {
      const list = document.getElementById('spec-properties-list');
      if (list) {
        const checkboxes = list.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
          cb.checked = checked;
        });
      }
    }

