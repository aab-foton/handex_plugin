// ============================================================
// specifications.js — modal "Criar Especificação" + render + flows
//
// Inclui:
//   - scanFrame + render dos cards de specs (renderSpecs, createAccordionSection, createSpecItem)
//   - filtros e busca (filterSpecItems, toggleStatusFilter)
//   - botões de visibilidade (updateHideAllSpecsButtonState, updateGroupVisButtonState, toggleAllSpecsVisibility)
//   - modal de criação (openSpecFormModal, closeSpecFormModal, requestSpecProperties, confirmSpecProperties)
//   - categorias customizadas (saveCategories, renderCategoryDropdown, renderCategoryList, toggleCategoryManager, addCategory, deleteCategory, renameCategory)
//   - render no plugin (renderSpecsList)
//   - exportação (exportSpecsToMd)
//   - fluxos (selectFlowType, openFlowFormModal, confirmFlowConnection, switchSpecTab, renderFlowsList, renameFlow, toggleFlowVisibility, createLegend)
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
        const cls  = it.status === 'error' ? 'text-red-400' : 'text-amber-500';
        const clickable = it.nodeId
          ? `onclick="focusNode('${it.nodeId}')" title="Localizar no canvas" class="flex items-center gap-1.5 min-w-0 w-full cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 rounded px-1 py-0.5 transition-colors group"`
          : `class="flex items-center gap-1.5 min-w-0 w-full px-1 py-0.5"`;
        return `<li ${clickable}>
          <i data-lucide="${icon}" class="w-3 h-3 ${cls} shrink-0"></i>
          <span class="text-[10px] text-slate-400 dark:text-dark-muted shrink-0">${it.label}</span>
          <span class="text-[10px] font-medium text-slate-700 dark:text-white truncate flex-1">${it.name}</span>
          ${it.nodeId ? `<i data-lucide="locate" class="w-3 h-3 text-slate-300 dark:text-slate-600 group-hover:text-red-400 shrink-0 transition-colors"></i>` : ''}
        </li>`;
      }).join('');

      return `<div class="px-3 py-2.5 bg-red-50 dark:bg-red-900/15 rounded-xl border border-red-100 dark:border-red-800/30 space-y-1.5">
        <div class="flex items-center gap-1.5">
          <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-red-500 shrink-0"></i>
          <p class="text-[11px] font-bold text-red-600 dark:text-red-400">Itens para revisar:</p>
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
    function renderFrameCard(frame) {
      const list = document.getElementById('list-frames');
      if (!list) return;

      const emptyState = document.getElementById('frames-empty-state');
      if (emptyState) emptyState.classList.add('hidden');

      const fid = frame.id;
      const card = document.createElement('div');
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
          <i data-lucide="chevron-right" id="sub-chev-${key}" class="w-3.5 h-3.5 text-gray-300 transition-transform shrink-0"></i>
        </button>`;

      // Subtítulo dinâmico baseado no estado de conformidade DSC
      let _subCls, _subLabel;
      if (frame.isNewComponent) {
        _subCls = 'text-[10px] text-violet-500 font-medium'; _subLabel = 'Novo Componente';
      } else if (!frame.audit || !frame.audit.checkDone) {
        _subCls = 'text-[10px] text-slate-400 font-medium'; _subLabel = 'Pendente';
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
        <div id="frame-header-${fid}"
          class="flex items-center gap-2 px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors select-none"
          onclick="toggleFrameAccordion('${fid}')"
          onmouseenter="sendHighlight('${frame.figmaId}')"
          onmouseleave="clearHighlight()">
          <button type="button"
            onclick="event.stopPropagation(); focusNode('${frame.figmaId}')"
            title="Localizar no canvas"
            class="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-[#0070af] hover:bg-blue-100 transition-colors shrink-0">
            <i data-lucide="locate" class="w-3.5 h-3.5"></i>
          </button>
          <div class="flex-1 min-w-0">
            <p class="text-[12px] font-bold text-slate-800 dark:text-white truncate">${frame.nome}</p>
            <p id="frame-subtitle-${fid}" class="${_subCls}">${_subLabel}</p>
          </div>
          <button type="button"
            onclick="event.stopPropagation(); removeFrame('${fid}')"
            title="Remover frame"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
          <i data-lucide="chevron-down" id="frame-chevron-${fid}" class="w-4 h-4 text-gray-300 transition-transform shrink-0"></i>
        </div>

        <!-- Corpo -->
        <div id="frame-body-${fid}" class="hidden border-t border-gray-50 dark:border-dark-line">

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
            <textarea id="new-component-obs-text-${fid}"
              onchange="updateNewComponentObs('${fid}', this.value)"
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
                <i data-lucide="loader-2" class="w-3 h-3 text-[#0070af] animate-spin"></i>
              </span>
              <i data-lucide="chevron-right" id="sub-chev-tokens-${fid}" class="w-3.5 h-3.5 text-gray-300 transition-transform shrink-0"></i>
            </button>
            <div id="sub-body-tokens-${fid}" class="hidden bg-gray-50/30 dark:bg-dark-bg/20">
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
                <div class="w-9 h-5 bg-gray-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0070af]"></div>
              </label>
            </div>

            <!-- Re-escanear (visível só quando checkDone) -->
            <div id="rescan-row-${fid}" class="${frame.audit && frame.audit.checkDone ? '' : 'hidden'} flex items-center justify-between py-1 border-t border-gray-50 dark:border-dark-line pt-2">
              <div>
                <p class="text-[11px] font-medium text-slate-600 dark:text-dark-muted">Atualizar escaneamento</p>
                <p class="text-[10px] text-slate-400 dark:text-dark-muted leading-snug">Re-escaneia o frame após ajustes</p>
              </div>
              <button onclick="scanFrame('${fid}')"
                class="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0070af]/8 hover:bg-[#0070af]/15 border border-[#0070af]/20 rounded-lg text-[#0070af] dark:text-blue-400 text-[10px] font-bold transition-colors shrink-0">
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
                <p class="text-[11px] text-violet-700 dark:text-violet-300 leading-snug">Componente novo — desvios são esperados. Registre as divergências nas observações acima.</p>
              </div>`}
              <div id="conformance-alert-${fid}">${_buildConformanceAlertHTML(frame)}</div>
              <textarea id="audit-obs-${fid}" rows="2"
                placeholder="Descreva os desvios encontrados ou o motivo da não conformidade com o DSC..."
                oninput="setFrameAuditObs('${fid}', this.value)"
                class="${(() => { const _hasUnl = typeof _computeFrameHasUnlinked === 'function' ? _computeFrameHasUnlinked(frame) : false; const _show = frame.audit && frame.audit.checkDone && (frame.isNewComponent || !frame.audit.semDesvios || _hasUnl); return _show ? '' : 'hidden'; })()} w-full bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-line rounded-xl px-3 py-2 text-[11px] text-slate-700 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 resize-none focus:ring-2 focus:ring-[#0070af]/20 outline-none transition-all">${frame.audit && frame.audit.observacoes ? frame.audit.observacoes : ''}</textarea>
            </div>
          </div>

        </div>
      `;

      list.appendChild(card);

      // Sync subtitle initial state
      _updateFrameAuditSubtitle(fid);

      _refreshIcons();

      if (frame.specs) { renderSpecs(frame.specs, fid); showFrameSection(fid, 'tokens'); }

      toggleFrameAccordion(fid);
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
    window.updateSpecTitle = updateSpecTitle;
    window.toggleSpecVisibility = toggleSpecVisibility;
    window.toggleSpecObs = toggleSpecObs;
    window.updateSpecObs = updateSpecObs;
    window.deleteSpecFromFrame = deleteSpecFromFrame;

    // ── Cores por categoria de spec ─────────────────────────────────
    const _CAT_COLORS = {
      'info':          { bg: 'bg-slate-100 dark:bg-slate-700',      text: 'text-slate-600 dark:text-slate-400',      border: 'border-slate-200 dark:border-slate-600'      },
      'comportamento': { bg: 'bg-pink-50 dark:bg-pink-900/30',      text: 'text-pink-600 dark:text-pink-400',        border: 'border-pink-200 dark:border-pink-800/40'      },
      'regra':         { bg: 'bg-blue-50 dark:bg-blue-900/30',      text: 'text-blue-600 dark:text-blue-400',        border: 'border-blue-200 dark:border-blue-800/40'      },
      'api':           { bg: 'bg-lime-50 dark:bg-lime-900/20',      text: 'text-lime-700 dark:text-lime-400',        border: 'border-lime-200 dark:border-lime-800/40'      },
      'layout':        { bg: 'bg-indigo-50 dark:bg-indigo-900/20',  text: 'text-indigo-600 dark:text-indigo-400',    border: 'border-indigo-200 dark:border-indigo-800/40'  },
      'componente':    { bg: 'bg-rose-50 dark:bg-rose-900/20',      text: 'text-rose-600 dark:text-rose-400',        border: 'border-rose-200 dark:border-rose-800/40'      },
      'interacao':     { bg: 'bg-emerald-50 dark:bg-emerald-900/20',text: 'text-emerald-700 dark:text-emerald-400',  border: 'border-emerald-200 dark:border-emerald-800/40'},
      'tipografia':    { bg: 'bg-yellow-50 dark:bg-yellow-900/20',  text: 'text-yellow-700 dark:text-yellow-500',    border: 'border-yellow-200 dark:border-yellow-800/40'  },
      'cor':           { bg: 'bg-teal-50 dark:bg-teal-900/20',      text: 'text-teal-600 dark:text-teal-400',        border: 'border-teal-200 dark:border-teal-800/40'      },
      'acessibilidade':{ bg: 'bg-purple-50 dark:bg-purple-900/20',  text: 'text-purple-600 dark:text-purple-400',    border: 'border-purple-200 dark:border-purple-800/40'  },
      'conteudo':      { bg: 'bg-cyan-50 dark:bg-cyan-900/20',      text: 'text-cyan-700 dark:text-cyan-400',        border: 'border-cyan-200 dark:border-cyan-800/40'      },
    };
    function _getCatColor(value) {
      return _CAT_COLORS[value] || { bg: 'bg-gray-50 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', border: 'border-gray-200 dark:border-slate-700' };
    }

    // ── Cores por tipo de exceção ─────────────────────────────────────
    const _excColors = {
      'Erro':        { bg: 'bg-red-50 dark:bg-red-900/20',    border: 'border-red-100 dark:border-red-900/30',    text: 'text-red-600 dark:text-red-400',    dot: 'bg-red-500' },
      'Alerta':      { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-900/30', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
      'Sucesso':     { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-100 dark:border-green-900/30', text: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' },
      'Confirmação': { bg: 'bg-blue-50 dark:bg-blue-900/20',   border: 'border-blue-100 dark:border-blue-900/30',   text: 'text-blue-600 dark:text-blue-400',   dot: 'bg-blue-500' },
    };
    function _excColor(tipo) {
      return _excColors[tipo] || { bg: 'bg-slate-50 dark:bg-slate-800/30', border: 'border-slate-100 dark:border-dark-line', text: 'text-slate-500', dot: 'bg-slate-400' };
    }
    function _renderExcItem(exc, onDelete) {
      const c = _excColor(exc.tipo);
      return `<div class="flex flex-col gap-1 px-2 py-1.5 ${c.bg} border ${c.border} rounded-lg">
        <div class="flex items-center gap-1.5">
          <span class="text-[9px] font-bold ${c.text} uppercase shrink-0 px-1.5 py-0.5 rounded-md ${c.bg} border ${c.border}">${exc.tipo || ''}</span>
          <span class="flex-1 min-w-0 text-[10px] text-slate-600 dark:text-dark-text leading-snug truncate">${exc.titulo || ''}</span>
          ${onDelete ? `<button type="button" onclick="event.stopPropagation(); ${onDelete}"
            class="w-4 h-4 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors shrink-0">
            <i data-lucide="x" class="w-3 h-3"></i></button>` : ''}
        </div>
        ${exc.obs ? `<p class="text-[9px] text-slate-500 dark:text-dark-muted leading-snug pl-1 italic">${exc.obs}</p>` : ''}
      </div>`;
    }

    // ── Render da lista de specs criadas por frame ─────────────────────
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
        const color = specs[0].color || '#005ca9';
        const groupEl = document.createElement('div');
        groupEl.className = 'mb-3';

        const groupNames = frame.specGroupNames || {};
        const groupVisible = frame.specGroupVisible || {};
        const isGroupHidden = groupVisible[letter] === false;
        const groupName = groupNames[letter] || '';

        // Group header with editable name and visibility toggle
        const groupHeader = document.createElement('div');
        groupHeader.className = 'flex items-center gap-1.5 px-1 mb-1.5';
        groupHeader.innerHTML = `
          <div class="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-extrabold text-white shrink-0" style="background-color:${color}">${letter}</div>
          <input type="text" value="${groupName.replace(/"/g, '&quot;')}"
            placeholder="Nomear grupo..."
            title="Nome do grupo"
            class="flex-1 min-w-0 text-[10px] font-bold text-slate-500 dark:text-slate-500 bg-transparent border border-transparent focus:border-[#0070af]/30 focus:ring-1 focus:ring-[#0070af]/20 rounded px-1 py-0.5 outline-none placeholder:text-gray-300 transition-all"
            onchange="updateSpecGroupName('${frameId}', '${letter}', this.value)"
            onclick="event.stopPropagation()" />
          <span class="text-[10px] text-slate-500 dark:text-slate-500 shrink-0">${specs.length} esp.</span>
          <button type="button" title="${isGroupHidden ? 'Exibir grupo' : 'Ocultar grupo'}"
            onclick="event.stopPropagation(); toggleSpecGroupVisibility('${frameId}', '${letter}')"
            class="w-5 h-5 flex items-center justify-center ${isGroupHidden ? 'text-gray-300' : 'text-slate-500'} hover:text-[#0070af] transition-colors shrink-0">
            <i data-lucide="${isGroupHidden ? 'eye-off' : 'eye'}" class="w-3 h-3"></i>
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
              <span class="inline-flex items-center px-2 py-0.5 rounded-full border ${_ccPill.border} text-[10px] font-bold ${_ccPill.text} ${_ccPill.bg}">${spec.categoryLabel || spec.category}</span>
            </div>` : '';

          // Build properties rows HTML
          const propsHtml = props.length > 0 ? `
            <div class="mb-3">
              <p class="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Propriedades</p>
              ${hasRawTokenWarning ? `
              <div class="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/30">
                <i data-lucide="alert-triangle" class="w-3 h-3 text-amber-500 shrink-0"></i>
                <p class="text-[10px] text-amber-700 dark:text-amber-400 leading-snug flex-1">Valores sem token. Use o <strong>Check Design</strong> para escanear tokens deste elemento.</p>
              </div>` : ''}
              <div class="space-y-1">
                ${props.map(p => `
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] text-slate-500 shrink-0">${p.label || p.key}</span>
                    <span class="text-[10px] font-semibold ${tokenKeys.has(p.key) && !p.token ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-white'} text-right font-mono">${p.token || p.value}</span>
                  </div>`).join('')}
              </div>
            </div>` : '';

          // Build exceptions HTML
          const excHtml = (spec.excecoes || []).map((exc, ei) =>
            _renderExcItem(exc, `deleteSpecException('${frameId}', ${spec._idx}, ${ei})`)
          ).join('');

          const item = document.createElement('div');
          item.className = `relative bg-white dark:bg-dark-surface rounded-xl border ${isHidden ? 'border-gray-100 opacity-50' : 'border-gray-100 dark:border-dark-line'} overflow-hidden transition-all`;

          item.innerHTML = `
            <div class="absolute -left-[18px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-dark-surface" style="background-color:${color}"></div>
            <div class="flex items-center px-2 py-1.5 gap-1.5 cursor-pointer select-none" onclick="toggleSpecDetails('${detailsId}')">
              <div class="w-4 h-4 rounded flex items-center justify-center text-[8px] font-extrabold text-white shrink-0" style="background-color:${color}">${letter}</div>
              <div class="flex-1 min-w-0">
                <input type="text" value="${(spec.name || '').replace(/"/g, '&quot;')}"
                  title="Clique para editar o título"
                  class="w-full text-[11px] font-semibold text-slate-700 dark:text-white bg-transparent border border-transparent focus:border-[#0070af]/30 focus:ring-1 focus:ring-[#0070af]/20 rounded px-1 py-0 outline-none cursor-text transition-all"
                  onchange="updateSpecTitle('${frameId}', ${spec._idx}, this.value)"
                  onclick="event.stopPropagation()" />
                ${spec.category ? `<span class="inline-flex mt-0.5 px-1.5 py-0.5 rounded-full border ${_ccPill.border} text-[9px] font-bold ${_ccPill.text} ${_ccPill.bg}">${spec.categoryLabel || spec.category}</span>` : `<p class="text-[9px] text-slate-300 dark:text-slate-600 px-1 leading-none">Sem categoria</p>`}
              </div>
              ${hasRawTokenWarning ? `<span title="Valores sem token — use Check Design" class="w-4 h-4 flex items-center justify-center text-amber-400 shrink-0"><i data-lucide="alert-triangle" class="w-3 h-3"></i></span>` : ''}
              <span id="exc-badge-${frameId}-${specIdx}" class="px-1 py-0.5 rounded bg-orange-50 text-[9px] font-bold text-orange-500 shrink-0 ${excCount > 0 ? '' : 'hidden'}">${excCount} exc</span>
              <button type="button" title="Localizar no canvas"
                onclick="event.stopPropagation(); focusNode('${spec.id}')"
                class="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-[#0070af] transition-colors shrink-0">
                <i data-lucide="locate" class="w-3 h-3"></i>
              </button>
              <button type="button" title="${isHidden ? 'Mostrar' : 'Ocultar'} no canvas"
                onclick="event.stopPropagation(); toggleSpecVisibility('${frameId}', ${spec._idx})"
                class="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-[#0070af] transition-colors shrink-0">
                <i data-lucide="${isHidden ? 'eye-off' : 'eye'}" class="w-3 h-3"></i>
              </button>
              <i data-lucide="chevron-down" id="chev-${detailsId}" class="w-3.5 h-3.5 text-gray-300 transition-transform shrink-0"></i>
              <button type="button" title="Excluir especificação"
                onclick="event.stopPropagation(); deleteSpecFromFrame('${frameId}', ${spec._idx}, '${spec.id}')"
                class="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors shrink-0">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </div>
            <!-- Details panel (expandable) -->
            <div id="${detailsId}" class="hidden px-3 pb-3 pt-2 border-t border-gray-50 dark:border-dark-line">
              ${categoryPill}
              ${propsHtml}
              <!-- Observations -->
              <div class="mb-3">
                <textarea placeholder="Observações sobre esta spec..."
                  class="w-full text-[11px] text-slate-600 dark:text-slate-300 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-line rounded-lg px-2 py-1.5 resize-none outline-none placeholder:text-gray-300 focus:border-[#0070af]/30 transition-all"
                  rows="2"
                  onchange="updateSpecObs('${frameId}', ${spec._idx}, this.value)">${spec.obs || ''}</textarea>
              </div>
              <!-- Cenários de Exceção -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <p class="text-[9px] font-bold text-orange-500 uppercase tracking-wider">Cenários de Exceção</p>
                  <div class="flex items-center gap-1.5">
                    ${(spec.excecoes || []).length > 0 ? `
                    <button type="button" onclick="event.stopPropagation(); refreshSpecCardOnCanvas('${frameId}', ${spec._idx})"
                      title="Atualiza o card no Figma com os cenários mapeados"
                      class="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-dark-line rounded-md hover:bg-slate-100 transition-colors">
                      <i data-lucide="refresh-cw" class="w-2.5 h-2.5"></i> Atualizar card
                    </button>` : ''}
                    <button type="button" onclick="event.stopPropagation(); openSpecException('${frameId}', ${spec._idx})"
                      class="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-md hover:bg-orange-100 transition-colors">
                      <i data-lucide="plus" class="w-2.5 h-2.5"></i> Cenário
                    </button>
                  </div>
                </div>
                <div id="${excListId}" class="space-y-1">
                  ${excHtml || '<p class="text-[10px] text-slate-300 dark:text-slate-600 italic">Nenhum cenário registrado</p>'}
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
          : '<p class="text-[10px] text-slate-300 dark:text-slate-600 italic">Nenhum cenário registrado</p>';
        const hdr = excListEl.previousElementSibling;
        if (hdr) {
          const p = hdr.querySelector('p');
          if (p) p.textContent = 'Cenários de Exceção' + (excs.length > 0 ? ' (' + excs.length + ')' : '');
        }
        _refreshIcons();
      }
    }
    window.deleteGlobalSpecException = deleteGlobalSpecException;

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
          : '<p class="text-[10px] text-slate-300 dark:text-slate-600 italic">Nenhum cenário registrado</p>';
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

    // Global stores already defined at top: lastMeasurements, createdSpecs



    function updateHideAllSpecsButtonState() {
      const btn = document.getElementById('btn-hide-all-specs');
      if (!btn) return;
      
      const specs = createdSpecs || [];
      if (specs.length === 0) return;
      
      const allHidden = specs.every(s => s.visible === false);
      _specsHidden = allHidden;
      
      btn.innerHTML = allHidden
        ? '<i data-lucide="eye" class="w-3.5 h-3.5"></i> Mostrar tudo'
        : '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i> Ocultar tudo';
      _refreshIcons();
    }

    function updateGroupVisButtonState(letter, groupWrapper) {
      const groupVisBtn = groupWrapper.querySelector('[data-group-vis-btn]');
      if (!groupVisBtn) return;
      
      const specs = createdSpecs.filter(s => (s.letter || 'Sem Tag') === letter);
      const isGroupVisible = specs.some(s => s.visible !== false);
      
      groupVisBtn.innerHTML = isGroupVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
      groupVisBtn.classList.toggle('text-[#005ca9]', isGroupVisible);
      groupVisBtn.classList.toggle('text-gray-400', !isGroupVisible);
      
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
          gBtn.classList.toggle('text-[#005ca9]', targetState);
          gBtn.classList.toggle('text-gray-400', !targetState);
        });
        
        const specBtns = container.querySelectorAll('[data-spec-vis-btn]');
        specBtns.forEach(sBtn => {
          sBtn.innerHTML = targetState ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i>` : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
          sBtn.classList.toggle("text-[#005ca9]", targetState);
          sBtn.classList.toggle("text-gray-300", !targetState);
        });
      }
      
      const btn = document.getElementById('btn-hide-all-specs');
      if (btn) {
        btn.innerHTML = _specsHidden
          ? '<i data-lucide="eye" class="w-3.5 h-3.5"></i> Mostrar tudo'
          : '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i> Ocultar tudo';
      }
      
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
            <i data-lucide="search" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none"></i>
            <input
              id="${searchId}"
              type="text"
              placeholder="Buscar em ${section.title}..."
              class="token-search-input w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-line rounded-lg text-[11px] text-slate-700 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-[#0070af]/30 focus:border-[#0070af] transition-all"
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
            <div class="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-[#0070af] dark:text-blue-400 shrink-0">
              <i data-lucide="${section.icon}" class="w-4 h-4"></i>
            </div>
            <div class="flex-1 min-w-0 flex items-center gap-2">
              <p class="text-[13px] font-bold text-slate-800 dark:text-white truncate">${section.title}</p>
              <p class="text-[10px] text-gray-400 whitespace-nowrap">${count} elementos</p>
            </div>
            <i data-lucide="chevron-down" class="w-4 h-4 text-gray-300 transition-transform shrink-0"></i>
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
          <div id="${emptyId}" class="hidden py-6 text-center text-[11px] text-gray-400 dark:text-gray-500">
            <i data-lucide="search-x" class="w-6 h-6 mx-auto mb-2 text-gray-300 dark:text-gray-600"></i>
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
        preview = `<div class="w-8 h-8 flex items-center justify-center bg-gray-50 dark:bg-dark-bg rounded text-gray-300"><i data-lucide="${iconName}" class="w-4 h-4"></i></div>`;
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
            `<i data-lucide="${icon}" class="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0"></i>`;

          const hasToken = p.name && p.name !== p.value && p.name.includes('/');
          const chainSegments = hasToken ? p.name.split('/').map(s => s.trim()).filter(Boolean) : [];
          const chainHtml = hasToken
            ? chainSegments.map((seg, i) => {
                const isLast = i === chainSegments.length - 1;
                return isLast
                  ? `<span class="font-bold text-[#0070af] dark:text-blue-400">${seg}</span>`
                  : `<span class="text-gray-500 dark:text-gray-400">${seg}</span><span class="text-gray-400 dark:text-gray-500 mx-0.5">›</span>`;
              }).join('')
            : '';

          const tooltipText = hasToken
            ? `Valor bruto: ${p.value}\nToken: ${p.name}`
            : p.value;

          const valueDisplay = hasToken
            ? `<span class="flex items-center gap-0.5 flex-wrap leading-tight">${chainHtml}</span>`
            : `<span class="font-bold text-slate-700 dark:text-gray-200">${p.value}</span>`;

          html += `<div class="flex items-center justify-between gap-1 text-[9px] text-gray-600 dark:text-gray-400" title="${tooltipText}">
            <div class="flex items-center gap-1.5 min-w-0">
              <div class="w-3 h-3 flex items-center justify-center shrink-0">${colorPrev}</div>
              <span class="flex items-center gap-1 flex-wrap min-w-0">
                <span class="text-gray-500 dark:text-gray-400 shrink-0">${p.label || p.type}:</span>
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
          <p class="text-[8px] font-bold uppercase tracking-wider text-gray-300 dark:text-gray-600 mb-1">Não aplicadas</p>`;
        props.forEach(p => {
          html += `<div class="flex items-center gap-1.5 text-[9px] text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-dark-bg/20 rounded px-1.5 py-0.5">
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
            class="mt-1.5 flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500 hover:text-[#0070af] dark:hover:text-blue-400 transition-colors font-medium">
            <i data-lucide="eye-off" class="w-2.5 h-2.5"></i>
            ${toggleLabel}
          </button>`
        : '';

      return `
        <div class="col-span-2 p-2 border border-gray-100 dark:border-dark-line rounded-lg bg-gray-50/50 dark:bg-dark-bg/50 cursor-pointer hover:border-[#0070af] hover:shadow-sm transition-all active:scale-[0.98] group" onclick="focusNode('${item.nodeId}')" title="Clicar para localizar no board">
          <div class="flex items-center gap-2 mb-1 pointer-events-none">
            ${preview}
            <div class="flex-1 min-w-0">
              <p class="text-[10px] font-bold text-slate-700 dark:text-white truncate group-hover:text-[#0070af] transition-colors">${item.name}</p>
              <div class="text-[9px] uppercase tracking-wider font-medium">
                ${dsStatus}
              </div>
            </div>
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
        letter: g('spec-letter-input') ? g('spec-letter-input').value : "A",
        link: g('spec-link-input') ? g('spec-link-input').value : "",
        note: g('ann-note') ? g('ann-note').value : "",
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
      'comportamento':  '#9333EA',
      'regra':          '#0D9488',
      'info':           '#16A34A',
      'api':            '#CA8A04',
      'layout':         '#2563EB',
      'componente':     '#4F46E5',
      'interacao':      '#DB2777',
      'tipografia':     '#D97706',
      'cor':            '#DC2626',
      'acessibilidade': '#0891B2',
      'conteudo':       '#EA580C',
    };
    const _CAT_FALLBACK_PALETTE = [
      '#7C3AED','#0891B2','#059669','#D97706','#DC2626',
      '#4F46E5','#DB2777','#065F46','#92400E','#1D4ED8',
    ];

    function getCategoryColor(value) {
      if (!value) return '#005ca9';
      if (CATEGORY_COLORS[value]) return CATEGORY_COLORS[value];
      // Para categorias customizadas: cor baseada no índice da lista
      const idx = annCategories.findIndex(c => c.value === value);
      return _CAT_FALLBACK_PALETTE[idx >= 0 ? idx % _CAT_FALLBACK_PALETTE.length : 0];
    }

    function syncSpecColorFromCategory() {
      const catEl    = document.getElementById('ann-category');
      const colorIn  = document.getElementById('spec-color-input');
      const swatch   = document.getElementById('spec-color-swatch');
      const color    = getCategoryColor(catEl ? catEl.value : '');
      if (colorIn) colorIn.value = color;
      if (swatch)  swatch.style.backgroundColor = color;
    }
    window.getCategoryColor        = getCategoryColor;
    window.syncSpecColorFromCategory = syncSpecColorFromCategory;

    // ── Category Management ──────────────────────────────────────────────
    const DEFAULT_CATEGORIES = [
      { label: "Informação extra", value: "info" },
      { label: "Comportamento", value: "comportamento" },
      { label: "Regra de Negócio", value: "regra" },
      { label: "Dados da API", value: "api" },
      { label: "Layout", value: "layout" },
      { label: "Componente", value: "componente" },
      { label: "Interação", value: "interacao" },
      { label: "Tipografia", value: "tipografia" },
      { label: "Cor", value: "cor" },
      { label: "Acessibilidade", value: "acessibilidade" },
      { label: "Conteúdo", value: "conteudo" },
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
        list.innerHTML = '<p class="text-[11px] text-gray-400 text-center py-3">Nenhuma categoria. Adicione abaixo.</p>';
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
            class="ml-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
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
      parent.postMessage({ pluginMessage: { type: 'request-spec-properties' } }, '*');
    }

    function closeSpecPropertiesModal() {
      document.getElementById('spec-properties-modal').classList.add('hidden');
    }

    function confirmSpecProperties() {
      closeSpecPropertiesModal();
      closeSpecFormModal();
      
      const g = id => document.getElementById(id);
      const selCat = g('ann-category');
      
      const guideSideEl = document.querySelector('input[name="guide-side"]:checked');
      
      const opts = {
        category: selCat ? selCat.value : "",
        categoryLabel: selCat && selCat.options[selCat.selectedIndex] ? selCat.options[selCat.selectedIndex].text : "",
        letter: g('spec-letter-input') ? g('spec-letter-input').value.toUpperCase() : "A",
        color: g('spec-color-input') ? g('spec-color-input').value : "#005ca9",
        link: g('spec-link-input') ? g('spec-link-input').value : "",
        note: g('ann-note') ? g('ann-note').value : "",
        guideSide: guideSideEl ? guideSideEl.value : "right",
        properties: []
      };

      // Collect selected properties
      const checkboxes = document.querySelectorAll('#spec-properties-list input[type="checkbox"]:checked');
      checkboxes.forEach(chk => {
        const propKey = chk.value;
        const propData = currentScannedProps.find(p => p.key === propKey);
        if (propData) {
          opts.properties.push(propData);
        }
      });

      parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
    }

    function renderSpecsList() {
      const list = document.getElementById('specs-results');
      if (!list) return;
      list.innerHTML = '';
      
      const hint = document.getElementById('hint-specs');
      if (hint) {
        if (createdSpecs && createdSpecs.length > 0) hint.classList.add('hidden');
        else hint.classList.remove('hidden');
      }

      const exportBtn = document.getElementById('btn-export-specs');
      const hideAllBtn = document.getElementById('btn-hide-all-specs');
      
      if (!createdSpecs || createdSpecs.length === 0) {
        list.innerHTML = `
          <div class="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500">
            <div class="relative mb-4">
              <i data-lucide="file-text" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
            </div>
            <p class="text-[12px] font-bold text-slate-500 dark:text-slate-500 text-center px-4 mb-1">Nenhuma especificação criada ainda</p>
            <p class="text-[10px] text-slate-300 dark:text-slate-600 text-center px-6">Selecione um elemento no canvas e toque no botão <strong>+</strong></p>
          </div>
        `;
        if (exportBtn) exportBtn.classList.add('hidden');
        if (hideAllBtn) hideAllBtn.classList.add('hidden');
        _refreshIcons();
        return;
      }
      if (exportBtn) exportBtn.classList.remove('hidden');
      if (hideAllBtn) hideAllBtn.classList.remove('hidden');

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
        const groupColor = specs[0].color || '#005ca9';
        
        // Contêiner do Grupo
        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'mb-4 border-l-4 rounded-r-xl overflow-hidden bg-gray-50/30 dark:bg-slate-900/20';
        groupWrapper.style.borderColor = groupColor;

        // Cabeçalho do Grupo
        const groupHeader = document.createElement('div');
        groupHeader.className = 'p-3 flex items-center justify-between bg-gray-100/50 dark:bg-slate-800/50';
        
        const headerInfo = document.createElement('div');
        headerInfo.className = 'flex items-center gap-3 cursor-pointer flex-1 overflow-hidden';
        
        const currentGroupName = (handoffData.tagNames && handoffData.tagNames[letter]) ? handoffData.tagNames[letter] : `Grupo Tag ${letter}`;

        headerInfo.innerHTML = `
          <div class="w-7 h-7 rounded flex items-center justify-center text-[11px] font-bold text-white shrink-0" style="background-color: ${groupColor}">
            ${letter}
          </div>
          <div class="flex flex-col overflow-hidden flex-1">
             <div class="flex items-center gap-1.5 overflow-hidden">
               <span class="text-[12px] font-bold text-slate-700 dark:text-slate-200 group-title-text truncate">${currentGroupName}</span>
               <button type="button" title="Renomear grupo" aria-label="Renomear grupo" class="edit-group-btn p-1 text-gray-400 hover:text-[#005ca9] transition-colors shrink-0">
                 <i data-lucide="pencil" class="w-3 h-3"></i>
               </button>
             </div>
             <span class="text-[10px] text-slate-500">${specs.length} item(ns)</span>
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
          input.className = 'text-[12px] font-bold text-slate-800 dark:text-white bg-white dark:bg-slate-700 border border-blue-400 rounded px-1 w-full outline-none';
          
          titleSpan.parentElement.replaceWith(input);
          input.focus();
          input.select();

          let isFinalized = false;

          const saveNewName = () => {
            if (isFinalized) return;
            isFinalized = true;
            const newVal = input.value.trim() || `Grupo Tag ${letter}`;
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

        const groupContent = document.createElement('div');
        groupContent.className = 'p-2 space-y-2';

        // Lógica de toggle do Grupo (Acordeão Pai)
        headerInfo.onclick = () => {
          const isHidden = groupContent.classList.contains('hidden');
          groupContent.classList.toggle('hidden');
          groupHeader.querySelector('.group-chevron').classList.toggle('rotate-180', !isHidden);
        };

        const groupActions = document.createElement('div');
        groupActions.className = 'flex items-center gap-1';

        const groupVisBtn = document.createElement('button');
        groupVisBtn.type = 'button';
        groupVisBtn.title = "Ocultar/Exibir Grupo";
        groupVisBtn.ariaLabel = "Ocultar grupo";
        groupVisBtn.className = "p-2 hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0";
        groupVisBtn.setAttribute('data-group-vis-btn', letter);

        const isGroupVisible = specs.some(s => s.visible !== false);
        groupVisBtn.innerHTML = isGroupVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
        groupVisBtn.classList.toggle('text-[#005ca9]', isGroupVisible);
        groupVisBtn.classList.toggle('text-gray-400', !isGroupVisible);

        groupVisBtn.onclick = (e) => {
          e.stopPropagation();
          const targetState = !specs.some(s => s.visible !== false);
          
          specs.forEach(s => {
            if (createdSpecs[s.originalIndex]) {
              createdSpecs[s.originalIndex].visible = targetState;
            }
            if (s.id) {
              parent.postMessage({ pluginMessage: { type: 'hide-node', id: s.id, forceState: targetState } }, '*');
            }
          });
          
          saveSpecsToStorage();
          
          groupVisBtn.innerHTML = targetState ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
          groupVisBtn.classList.toggle('text-[#005ca9]', targetState);
          groupVisBtn.classList.toggle('text-gray-400', !targetState);
          
          const childBtns = groupWrapper.querySelectorAll('[data-spec-vis-btn]');
          childBtns.forEach(btnEl => {
            btnEl.innerHTML = targetState ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i>` : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
            btnEl.classList.toggle("text-[#005ca9]", targetState);
            btnEl.classList.toggle("text-gray-300", !targetState);
          });
          
          _refreshIcons();
          updateHideAllSpecsButtonState();
        };

        const groupChevron = document.createElement('i');
        groupChevron.setAttribute('data-lucide', 'chevron-down');
        groupChevron.className = 'w-4 h-4 text-gray-400 transition-transform group-chevron';

        groupActions.appendChild(groupVisBtn);
        groupActions.appendChild(groupChevron);
        groupHeader.appendChild(headerInfo);
        groupHeader.appendChild(groupActions);

        specs.forEach((spec) => {
          const section = document.createElement('div');
          section.className = 'bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg shadow-sm overflow-hidden';
          if (spec.id) {
            section.setAttribute('data-spec-id', spec.id);
          }

          const header = document.createElement("div");
          header.className = "flex items-center justify-between bg-white dark:bg-slate-800";
          
          const btn = document.createElement("button");
          btn.type = "button";
          btn.title = "Expandir/Recolher";
          btn.ariaLabel = "Expandir";
          btn.className = "flex-1 flex items-center justify-between text-left p-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors";
          btn.onclick = () => {
            const contentEl = document.getElementById('content-' + spec.id);
            if (!contentEl) return;
            const isHidden = contentEl.classList.contains('hidden');
            contentEl.classList.toggle('hidden');
            const icon = btn.querySelector('[data-lucide="chevron-down"]');
            if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : '';
            if (spec.id) focusNode(spec.id);
          };
          
          const _ccSpec = spec.category ? _getCatColor(spec.category) : null;
          btn.innerHTML = `
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <div class="flex flex-col overflow-hidden min-w-0 text-left gap-0.5">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[12px] font-bold text-slate-800 dark:text-white truncate" title="${spec.name}">${spec.name}</span>
                  ${spec.category && _ccSpec ? `<span class="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${_ccSpec.border} ${_ccSpec.bg} ${_ccSpec.text}">${spec.categoryLabel || spec.category}</span>` : ''}
                </div>
                <span class="text-[10px] text-slate-500 truncate">${spec.type || ''}</span>
              </div>
            </div>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0"></i>
          `;

          const actions = document.createElement("div");
          actions.className = "flex items-center border-l border-gray-100 dark:border-dark-line";

          const visBtn = document.createElement("button");
          visBtn.type = "button";
          visBtn.title = "Ocultar/Exibir no canvas";
          visBtn.ariaLabel = "Ocultar";
          visBtn.className = "p-2.5 hover:bg-blue-50 dark:hover:bg-slate-600 transition-colors shrink-0";
          visBtn.setAttribute('data-spec-vis-btn', '');

          if (spec.visible === undefined) {
            spec.visible = true;
          }
          const isVisible = spec.visible !== false;
          visBtn.innerHTML = isVisible ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i>` : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
          visBtn.classList.toggle("text-[#005ca9]", isVisible);
          visBtn.classList.toggle("text-gray-300", !isVisible);

          visBtn.onclick = (e) => {
            e.stopPropagation();
            // Lê sempre da fonte (não da cópia estática do closure)
            const currentVis = createdSpecs[spec.originalIndex]?.visible !== false;
            const nowVisible = !currentVis;
            if (createdSpecs[spec.originalIndex]) {
              createdSpecs[spec.originalIndex].visible = nowVisible;
            }

            visBtn.innerHTML = nowVisible ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i>` : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
            visBtn.classList.toggle("text-[#005ca9]", nowVisible);
            visBtn.classList.toggle("text-gray-300", !nowVisible);

            if (spec.id) {
              parent.postMessage({ pluginMessage: { type: 'hide-node', id: spec.id, forceState: nowVisible } }, '*');
            }
            saveSpecsToStorage();
            _refreshIcons();

            updateGroupVisButtonState(letter, groupWrapper);
            updateHideAllSpecsButtonState();
          };

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.title = "Excluir Especificação";
          delBtn.ariaLabel = "Excluir";
          delBtn.className = "p-2.5 text-gray-400 hover:text-red-500 transition-colors";
          delBtn.innerHTML = '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>';
          delBtn.onclick = (e) => { 
            e.stopPropagation(); 
            if (spec.id) {
              parent.postMessage({ pluginMessage: { type: 'delete-node', id: spec.id } }, '*');
            }
            createdSpecs.splice(spec.originalIndex, 1);
            saveToStorage();
            renderSpecsList();
          }; 

          actions.appendChild(visBtn);
          actions.appendChild(delBtn);
          header.appendChild(btn);
          header.appendChild(actions);
          section.appendChild(header);

          const content = document.createElement("div");
          content.id = "content-" + spec.id;
          content.className = "hidden p-3 border-t border-gray-50 dark:border-dark-line bg-gray-50/30 dark:bg-slate-900/50 space-y-2";
          
          if (spec.note) {
            content.innerHTML += `<div class="text-[10px] text-slate-600 dark:text-dark-text p-2 bg-white dark:bg-dark-bg rounded border border-gray-100 dark:border-dark-line italic">${spec.note}</div>`;
          }

          if (spec.properties && spec.properties.length > 0) {
            spec.properties.forEach(p => {
              const detEl = document.createElement("div");
              detEl.className = "flex justify-between text-[10px] bg-white dark:bg-dark-bg p-1.5 rounded border border-gray-100 dark:border-dark-line";
              const valStr = p.token ? `<span class="text-[8px] text-[#0070af] dark:text-blue-400 font-medium mr-1 px-1 bg-blue-50 dark:bg-blue-900/20 rounded-sm border border-blue-100 dark:border-blue-800">${p.token}</span>${p.value}` : p.value;
              const displayVal = p.token || p.value;
              const valStr2 = p.token
                ? `<span class="text-[9px] text-[#0070af] dark:text-blue-400 font-medium px-1 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-800">${p.token}</span>`
                : `<span class="font-mono">${p.value}</span>`;
              detEl.innerHTML = `<span class="text-slate-500">${p.label}</span><span class="font-bold text-slate-700 dark:text-white flex items-center">${valStr2}</span>`;
              content.appendChild(detEl);
            });
          }

          // ── Cenários de Exceção ──────────────────────────────────────────
          const excSection = document.createElement('div');
          excSection.className = 'pt-1';
          const specExcs = spec.excecoes || [];
          const excListId = 'global-exc-list-' + spec.originalIndex;
          excSection.innerHTML = `
            <div class="flex items-center justify-between mb-1">
              <p class="text-[9px] font-bold text-orange-500 uppercase tracking-wider">Cenários de Exceção ${specExcs.length > 0 ? '(' + specExcs.length + ')' : ''}</p>
              <button type="button" onclick="event.stopPropagation(); openGlobalSpecException(${spec.originalIndex})"
                class="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-md hover:bg-orange-100 transition-colors">
                <i data-lucide="plus" class="w-2.5 h-2.5"></i> Cenário
              </button>
            </div>
            <div id="${excListId}" class="space-y-1">
              ${specExcs.length === 0
                ? '<p class="text-[10px] text-slate-300 dark:text-slate-600 italic">Nenhum cenário registrado</p>'
                : specExcs.map((exc, ei) => _renderExcItem(exc, `deleteGlobalSpecException(${spec.originalIndex}, ${ei})`)).join('')
              }
            </div>
          `;
          content.appendChild(excSection);

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
        createdSpecs.splice(idx, 1);
        saveSpecsToStorage();
        renderSpecsList();
      }
    }



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
        activeCard.style.borderColor = '#0070af';
        activeCard.style.backgroundColor = 'rgba(0, 112, 175, 0.08)';
        const icon = activeCard.querySelector('i[data-lucide]');
        if (icon) icon.style.color = '#0070af';
        const diamond = activeCard.querySelector('.rotate-45');
        if (diamond) diamond.style.borderColor = '#0070af';
      }

      const chipContainer = document.getElementById('flow-chip-container');
      if (chipContainer) {
        const hasChip = ['line_solid', 'line_dashed', 'diamond', 'diamond_dashed'].includes(type);
        chipContainer.classList.toggle('hidden', !hasChip);
      }

      // Enable confirm button
      const btn = document.getElementById('btn-confirm-flow');
      if (btn) {
        btn.disabled = false;
        btn.style.backgroundColor = '#0070af';
        btn.style.cursor = 'pointer';
        btn.classList.remove('bg-gray-300', 'cursor-not-allowed');
      }

      // Auto-scroll to bottom of modal
      setTimeout(() => {
        const modalBody = document.querySelector('#flow-form-modal .overflow-y-auto');
        if (modalBody) modalBody.scrollTo({ top: modalBody.scrollHeight, behavior: 'smooth' });
      }, 150);
    }
    window.selectFlowType = selectFlowType;
      
    function openFlowFormModal() {
      openModal('flow-form-modal');
      currentFlowType = null;

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

      const decContainer = document.getElementById('flow-decision-container');
      if (decContainer) decContainer.classList.add('hidden');

      const btn = document.getElementById('btn-confirm-flow');
      if (btn) {
        btn.disabled = true;
        btn.style.backgroundColor = '';
        btn.style.cursor = '';
        btn.classList.add('bg-gray-300', 'cursor-not-allowed');
        btn.classList.remove('bg-[#0070af]', 'hover:bg-blue-700');
      }
    }


    function confirmFlowConnection() {
      const type = currentFlowType;
      const textInput = document.getElementById('flow-chip-text');
      const text = textInput ? textInput.value : '';
      const flowName = document.getElementById('flow-name-input') ? document.getElementById('flow-name-input').value : `Linha ${handoffData.nextFlowNumber || 1}`;
      
      const sideInput = document.querySelector('input[name="flow-side"]:checked');
      const flowSide = sideInput ? sideInput.value : 'auto';

      parent.postMessage({ 
        pluginMessage: { 
          type: 'create-flow-connection', 
          flowType: type,
          decisionText: text,
          flowName: flowName,
          flowSide: flowSide,
          nextFlowNumber: handoffData.nextFlowNumber || 1
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

      if (!handoffData.createdFlows || handoffData.createdFlows.length === 0) {
        const emptyHtml = `
          <div class="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500">
            <div class="relative mb-4">
              <i data-lucide="share-2" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
            </div>
            <p class="text-[12px] font-bold text-slate-500 dark:text-slate-500 text-center px-4 mb-1">Nenhum fluxo criado ainda</p>
            <p class="text-[10px] text-slate-300 dark:text-slate-600 text-center px-6">Selecione 2 elementos no canvas e toque no botão <strong>+</strong></p>
          </div>
        `;
        containers.forEach(c => c.innerHTML = emptyHtml);
        _refreshIcons();
        return;
      }

      const html = handoffData.createdFlows.map((flow, idx) => {
        const isVisible = flow.visible !== false;
        
        const typeLabels = {
          'line_solid': 'Linha Sólida',
          'line_dashed': 'Linha Tracejada',
          'diamond': 'Ponto de Decisão',
          'diamond_dashed': 'Decisão Tracejada',
          'gateway_parallel': 'Gateway Paralelo',
          'event_start': 'Início de Fluxo',
          'event_end': 'Fim de Fluxo'
        };
        const typeLabel = typeLabels[flow.type] || flow.type.replace(/_/g, ' ').toUpperCase();

        const defaultName = flow.type === 'diamond' || flow.type === 'diamond_dashed' ? 'Ponto de Decisão' : (flow.type === 'gateway_parallel' ? 'Fork/Paralelo' : (flow.type === 'event_start' ? 'Início' : (flow.type === 'event_end' ? 'Fim' : 'Conexão de Fluxo')));
        
        return `
        <div class="group relative bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-2xl p-4 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md transition-all cursor-pointer active:scale-[0.98]" 
             onclick="focusNode('${flow.id}')">
          <div class="flex items-center gap-4 w-full">
            <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-800/50">
              <i data-lucide="${flow.type.includes('diamond') ? 'help-circle' : (flow.type === 'gateway_parallel' ? 'git-fork' : (flow.type.includes('event') ? 'circle' : 'arrow-right'))}" class="w-5 h-5 text-[#0070af] dark:text-blue-400"></i>
            </div>
            
            <div class="flex-1 overflow-hidden">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 flex-1 min-w-0">
                  <input type="text"
                    value="${flow.name || defaultName}"
                    class="flex-1 bg-transparent border-none p-0 text-[13px] font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0070af]/20 rounded px-1 -ml-1 transition-all truncate"
                    onchange="renameFlow(${idx}, this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"
                    onclick="event.stopPropagation()"
                    placeholder="Nome da conexão..." />
                </div>
                
                <div class="flex items-center gap-1 shrink-0">
                  <button onclick="event.stopPropagation(); toggleFlowVisibility('${flow.id}', ${idx})" 
                    class="w-7 h-7 rounded-lg flex items-center justify-center ${isVisible ? 'text-[#0070af]' : 'text-gray-300'} hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                    title="${isVisible ? 'Ocultar fluxo' : 'Exibir fluxo'}" aria-label="Alterar visibilidade">
                    <i data-lucide="${isVisible ? 'eye' : 'eye-off'}" class="w-3.5 h-3.5"></i>
                  </button>
                  <button onclick="event.stopPropagation(); deleteNode('${flow.id}', ${idx}, 'flow')" title="Excluir" aria-label="Excluir fluxo"
                    class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
              
              <div class="mt-1 flex items-center gap-2">
                <span class="text-[8px] text-gray-400 dark:text-dark-muted font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-900/50 px-1.5 py-0.5 rounded border border-gray-100 dark:border-dark-line">
                  ${typeLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
      `; }).join('');

      containers.forEach(c => c.innerHTML = html);
      _refreshIcons();
    }



    function createLegend() {
      parent.postMessage({ pluginMessage: { type: 'create-legend' } }, '*');
    }

    // --- CONTROLE DE SCROLL (CONSOLIDADO) ---

    function renameFlow(idx, newName) {
      if (newName !== null && newName.trim() !== '') {
        const flow = handoffData.createdFlows[idx];
        flow.name = newName.trim();
        saveToStorage();
        
        parent.postMessage({ 
          pluginMessage: { 
            type: 'rename-node', 
            id: flow.id, 
            name: flow.name 
          } 
        }, '*');
      }
    }

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
      document.getElementById('spec-letter-input').value = 'A';
      document.getElementById('spec-color-input').value = '#005ca9';
      document.getElementById('ann-category').value = '';
      if (typeof _csSyncLabel === 'function') _csSyncLabel('cs-ann-cat');
      if (typeof syncSpecColorFromCategory === 'function') syncSpecColorFromCategory();
      document.getElementById('spec-link-input').value = '';
      document.getElementById('ann-note').value = '';
      
      // Reset link checkbox
      document.getElementById('chk-has-link').checked = false;
      toggleLinkInput(false);

      // Reset guide side to right
      const rightRadio = document.querySelector('input[name="guide-side"][value="right"]');
      if (rightRadio) rightRadio.checked = true;

      const modalTitle = document.querySelector('#spec-form-modal h3');
      if (modalTitle) {
        modalTitle.innerHTML = '<i data-lucide="plus-circle" class="w-4 h-4 text-[#005ca9]"></i> Criar Especificação/Nota';
      }
      const confirmBtn = document.getElementById('btn-spec-form-confirm');
      if (confirmBtn) {
        confirmBtn.textContent = 'Avançar para Propriedades';
        confirmBtn.onclick = requestSpecProperties;
      }
      document.getElementById('spec-form-modal').classList.remove('hidden');
      updateFABVisibility(true);
      _refreshIcons();
    }

    function closeSpecFormModal() {
      document.getElementById('spec-form-modal').classList.add('hidden');
      document.getElementById('spec-form-modal').dataset.editIdx = '';
      updateFABVisibility(false);
    }

    function toggleAllSpecProperties(checked) {
      const list = document.getElementById('spec-properties-list');
      if (list) {
        const checkboxes = list.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
          cb.checked = checked;
        });
      }
    }

