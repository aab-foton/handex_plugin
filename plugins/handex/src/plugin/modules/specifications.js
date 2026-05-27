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

    function scanFrame(categories = null, selectedLibSlugs = null) {
      const refs = handoffData.step2.auditReferences || [];

      // Persiste libs selecionadas para uso no bundle filtering
      if (selectedLibSlugs !== null) {
        handoffData.step2.selectedLibSlugs = selectedLibSlugs;
      }
      const libSlugs = handoffData.step2.selectedLibSlugs || null;

      const btn = document.getElementById("btn-scan");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Escaneando...';
      }
      if (window.lucide) lucide.createIcons();

      parent.postMessage({
        pluginMessage: {
          type: "scan-frame",
          isAudit: handoffData.step2.isAuditEnabled,
          referenceTokens: refs.length > 0 ? refs : null,
          selectedLibSlugs: libSlugs,
          categories: categories
        }
      }, "*");
    }


    function renderSpecs(data) {
      const container = document.getElementById("scan-results");
      if (!container) return;
      container.innerHTML = "";

      const sections = [
        { title: "Componentes", items: data.components, type: "components", icon: "box" },
        { title: "Ícones", items: data.icons, type: "icons", icon: "image" },
        { title: "Tipografia", items: data.typography, type: "typography", icon: "type" },
        { title: "Frames e Layouts", items: data.frames, type: "frames", icon: "layout" },
        { title: "Vetores", items: data.vectors, type: "vectors", icon: "pen-tool" }
      ];

      sections.forEach(section => {
        if (section.items && section.items.length > 0) {
          container.appendChild(createAccordionSection(section));
        }
      });
      try { lucide.createIcons(); } catch(e) {}
    }

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
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function updateGroupVisButtonState(letter, groupWrapper) {
      const groupVisBtn = groupWrapper.querySelector('[data-group-vis-btn]');
      if (!groupVisBtn) return;
      
      const specs = createdSpecs.filter(s => (s.letter || 'Sem Tag') === letter);
      const isGroupVisible = specs.some(s => s.visible !== false);
      
      groupVisBtn.innerHTML = isGroupVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
      groupVisBtn.classList.toggle('text-[#005ca9]', isGroupVisible);
      groupVisBtn.classList.toggle('text-gray-400', !isGroupVisible);
      
      if (typeof lucide !== 'undefined') lucide.createIcons();
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
      
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }


    function createAccordionSection(section) {
      const div = document.createElement("div");
      div.className = "mb-3 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl overflow-hidden shadow-sm";

      const count = section.items.length;

      let issuesCount = 0;
      let adjustmentsCount = 0;

      if (handoffData.step2.isAuditEnabled) {
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

      if (typeof lucide !== 'undefined') lucide.createIcons();
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
      const dsStatus = handoffData.step2.isAuditEnabled ? (status === "ok" ?
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
          const pStatus = handoffData.step2.isAuditEnabled ?
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
              if(window.lucide) lucide.createIcons();"
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


    // ── Category Management ──────────────────────────────────────────────
    const DEFAULT_CATEGORIES = [
      { label: "Cenário de exceção", value: "cenario" },
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
      const current = sel.value;
      sel.innerHTML = '<option value="">Sem categoria</option>';
      annCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.value;
        opt.textContent = cat.label;
        if (cat.value === current) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    function renderCategoryList() {
      const list = document.getElementById('cat-list');
      list.innerHTML = '';
      if (annCategories.length === 0) {
        list.innerHTML = '<p class="text-[11px] text-gray-400 text-center py-3">Nenhuma categoria. Adicione abaixo.</p>';
        return;
      }
      annCategories.forEach((cat, idx) => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-dark-bg/30 group';
        row.innerHTML = `
          <input type="text" value="${cat.label}"
            class="flex-1 text-[12px] text-slate-700 dark:text-dark-text bg-transparent outline-none focus:bg-gray-50 dark:focus:bg-dark-bg rounded px-1 py-0.5"
            onchange="renameCategory(${idx}, this.value)" />
          <button onclick="deleteCategory(${idx})" title="Remover" aria-label="Remover categoria"
            class="ml-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>`;
        list.appendChild(row);
      });
      if (typeof lucide !== 'undefined') lucide.createIcons();
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

    let lastModalBeforeHelp = null;

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
            <p class="text-[12px] font-bold text-slate-400 dark:text-slate-500 text-center px-4 mb-1">Nenhuma especificação criada ainda</p>
            <p class="text-[10px] text-slate-300 dark:text-slate-600 text-center px-6">Selecione um elemento no canvas e toque no botão <strong>+</strong></p>
          </div>
        `;
        if (exportBtn) exportBtn.classList.add('hidden');
        if (hideAllBtn) hideAllBtn.classList.add('hidden');
        if (window.lucide) lucide.createIcons();
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
          
          if (typeof lucide !== 'undefined') lucide.createIcons();
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
          btn.onclick = () => toggleAccordion(btn, spec.id, spec.letter, spec.color);
          
          btn.innerHTML = `
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <div class="flex flex-col overflow-hidden min-w-0 text-left">
                <span class="text-[12px] font-bold text-slate-800 dark:text-white truncate" title="${spec.name}">${spec.name}</span>
                <span class="text-[10px] text-slate-500 truncate">${spec.type}</span>
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
            const nowVisible = !(spec.visible !== false);
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
            if (typeof lucide !== 'undefined') lucide.createIcons();
            
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
              detEl.innerHTML = `<span class="text-slate-500">${p.label}</span><span class="font-bold text-slate-700 dark:text-white flex items-center">${valStr}</span>`;
              content.appendChild(detEl);
            });
          }

          section.appendChild(content);
          groupContent.appendChild(section);
        });

        groupWrapper.appendChild(groupHeader);
        groupWrapper.appendChild(groupContent);
        list.appendChild(groupWrapper);
      });

      if (typeof lucide !== 'undefined') lucide.createIcons();
      const currentCount = createdSpecs.length;
      if (typeof lastSpecsCount !== 'undefined' && currentCount > lastSpecsCount) {
        autoScrollToNewItem('specs-scroll-container');
      }
      lastSpecsCount = currentCount;
      updateHideAllSpecsButtonState();
    }
    let lastSpecsCount = 0;


    // Call once to render any persisted specs on load
    document.addEventListener("DOMContentLoaded", () => {
      renderSpecsList();
    });

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
      // UI visual feedback (Main Screen)
      document.querySelectorAll('.flow-type-card').forEach(el => {
        el.classList.remove('border-[#0070af]', 'bg-blue-50/30', 'dark:bg-blue-900/10');
        el.classList.add('border-gray-100', 'dark:border-dark-line');
      });
      const activeMain = document.getElementById(`flow-${type}`);
      if (activeMain) {
        activeMain.classList.remove('border-gray-100', 'dark:border-dark-line');
        activeMain.classList.add('border-[#0070af]', 'bg-blue-50/30', 'dark:bg-blue-900/10');
      }

      // UI visual feedback (Modal)
      document.querySelectorAll('.flow-type-card-modal').forEach(el => {
        el.classList.remove('border-[#0070af]', 'bg-blue-50/30', 'dark:bg-blue-900/10');
        el.classList.add('border-gray-100', 'dark:border-dark-line');
        const icon = el.querySelector('i');
        if (icon) icon.classList.replace('text-[#0070af]', 'text-slate-400');
        const diamond = el.querySelector('.rotate-45');
        if (diamond) diamond.classList.replace('border-[#0070af]', 'border-slate-300');
      });

      const activeModal = document.getElementById(`form-flow-${type}`);
            if (activeModal) {
        activeModal.classList.remove('border-gray-100', 'dark:border-dark-line');
        activeModal.classList.add('border-[#0070af]', 'bg-blue-50/30', 'dark:bg-blue-900/10');
      }

      const chipContainer = document.getElementById('flow-chip-container');
      if (chipContainer) {
        const hasChip = ['line_solid', 'line_dashed', 'diamond', 'diamond_dashed'].includes(type);
        chipContainer.classList.toggle('hidden', !hasChip);
      }
      
      // Habilitar botão
      const btn = document.getElementById('btn-confirm-flow');
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('bg-gray-300', 'cursor-not-allowed');
        btn.classList.add('bg-[#0070af]', 'hover:bg-blue-700', 'shadow-blue-500/20');
      }

      // Auto-scroll para o final do modal (Lado da Conexão e Chip)
      setTimeout(() => {
        const modalBody = document.querySelector('#flow-form-modal .overflow-y-auto');
        if (modalBody) {
          modalBody.scrollTo({
            top: modalBody.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 150);
    }
      
    function openFlowFormModal() {
      openModal('flow-form-modal');
      currentFlowType = null;
      
      // Reset visual feedback
      document.querySelectorAll('.flow-type-card-modal').forEach(el => {
        el.classList.remove('border-[#0070af]', 'bg-blue-50/30', 'dark:bg-blue-900/10');
        el.classList.add('border-gray-100', 'dark:border-dark-line');
        const icon = el.querySelector('i');
        if (icon) icon.classList.replace('text-[#0070af]', 'text-slate-400');
        const diamond = el.querySelector('.rotate-45');
        if (diamond) diamond.classList.replace('border-[#0070af]', 'border-slate-300');
      });

      const decContainer = document.getElementById('flow-decision-container');
      if (decContainer) decContainer.classList.add('hidden');

      const btn = document.getElementById('btn-confirm-flow');
      if (btn) {
        btn.disabled = true;
        btn.classList.add('bg-gray-300', 'cursor-not-allowed');
        btn.classList.remove('bg-[#0070af]', 'hover:bg-blue-700', 'shadow-blue-500/20');
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

    function switchSpecTab(tabId) {
      currentSpecTab = tabId;
      const form = document.getElementById('specs-form');
      const flow = document.getElementById('specs-flow');
      const tabForm = document.getElementById('tab-specs-form');
      const tabFlow = document.getElementById('tab-specs-flow');
      
      const activeClasses = ['bg-white', 'dark:bg-dark-surface', 'text-[#0070af]', 'dark:text-blue-400', 'shadow-sm'];
      const inactiveClasses = ['text-gray-500', 'hover:text-gray-800', 'dark:hover:text-gray-200'];

      if (!tabForm || !tabFlow) return;

      if (tabId === 'specs-form') {
        if (form) form.classList.remove('hidden');
        if (flow) flow.classList.add('hidden');
        
        activeClasses.forEach(c => tabForm.classList.add(c));
        inactiveClasses.forEach(c => tabForm.classList.remove(c));
        activeClasses.forEach(c => tabFlow.classList.remove(c));
        inactiveClasses.forEach(c => tabFlow.classList.add(c));
        
        renderSpecsList();
      } else {
        if (form) form.classList.add('hidden');
        if (flow) flow.classList.remove('hidden');
        
        activeClasses.forEach(c => tabForm.classList.remove(c));
        inactiveClasses.forEach(c => tabForm.classList.add(c));
        activeClasses.forEach(c => tabFlow.classList.add(c));
        inactiveClasses.forEach(c => tabFlow.classList.remove(c));
        
        renderFlowsList();
      }

      updateFABVisibility();
    }

    function renderFlowsList() {
      const container = document.getElementById('flows-results');
      if (!container) return;

      if (!handoffData.createdFlows || handoffData.createdFlows.length === 0) {
        container.innerHTML = `
          <div class="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500">
            <div class="relative mb-4">
              <i data-lucide="share-2" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
            </div>
            <p class="text-[12px] font-bold text-slate-400 dark:text-slate-500 text-center px-4 mb-1">Nenhum fluxo criado ainda</p>
            <p class="text-[10px] text-slate-300 dark:text-slate-600 text-center px-6">Selecione 2 elementos no canvas e toque no botão <strong>+</strong></p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = handoffData.createdFlows.map((flow, idx) => {
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
                  <button onclick="event.stopPropagation(); this.previousElementSibling.focus()" title="Renomear" aria-label="Renomear fluxo" class="p-1 text-slate-300 hover:text-[#0070af] transition-colors" title="Editar nome">
                    <i data-lucide="edit-3" class="w-3 h-3"></i>
                  </button>
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
      
      if (window.lucide) lucide.createIcons();
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
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function openSpecFormModal() {
      // Modo criação: limpa campos e reseta estado
      document.getElementById('spec-form-modal').dataset.editIdx = '';
      document.getElementById('spec-letter-input').value = 'A';
      document.getElementById('spec-color-input').value = '#005ca9';
      document.getElementById('ann-category').value = '';
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
      if (typeof lucide !== 'undefined') lucide.createIcons();
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

