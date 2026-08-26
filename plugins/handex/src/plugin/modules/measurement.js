// ============================================================
// measurement.js — modal "Inserir Medidas" + render no plugin
//
// Inclui:
//   - render dos cards de medidas escaneadas (renderMeasurementsResults)
//   - botões de toggle/visibilidade (updateHideAllMeasuresButtonState, toggleAllMeasuresVisibility)
//   - modal de criação de medida (openMeasureModal / closeMeasureModal / selectMeasurement / executeMeasurement)
//   - export para Markdown (exportMeasurements)
//
// Depende de: handoffData, openModal/closeModal, lastMeasurements, focusNode
// (escopo global compartilhado com core.js)
// ============================================================

    function renderMeasurementsResults(data, frameId) {
      // Renderiza em container do frame (se frameId), senão fallback para global
      const containerId = frameId ? `measurements-list-${frameId}` : 'measurements-results';
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = "";

      // Hint e botões globais (apenas na tela de medidas standalone)
      if (!frameId) {
        _updateContentHint('hint-measures', !!(data && data.length > 0));
        const exportBtn = document.getElementById('btn-export-measures');
        const hideAllBtn = document.getElementById('btn-hide-all-measures');
        const collapseBtn = document.querySelector('#view-measurement [data-collapse-toggle]');
        const finalizeWrap = document.getElementById('btn-finalize-measurements-wrap');
        const sectionTitle = document.getElementById('measures-section-title');
        if (data && data.length > 0) {
          if (exportBtn) exportBtn.classList.remove('hidden');
          if (hideAllBtn) hideAllBtn.classList.remove('hidden');
          if (collapseBtn) collapseBtn.classList.remove('hidden');
          if (finalizeWrap) finalizeWrap.classList.remove('hidden');
          if (sectionTitle) {
            sectionTitle.classList.remove('hidden');
            sectionTitle.textContent = `Medidas Inseridas (${data.length})`;
          }
        } else {
          if (exportBtn) exportBtn.classList.add('hidden');
          if (hideAllBtn) hideAllBtn.classList.add('hidden');
          if (collapseBtn) collapseBtn.classList.add('hidden');
          if (finalizeWrap) finalizeWrap.classList.add('hidden');
          if (sectionTitle) sectionTitle.classList.add('hidden');
        }
      }

      if (!data || data.length === 0) {
        if (!frameId) {
          container.innerHTML = `
            <li class="empty-state-placeholder flex flex-col items-center list-none">
              <div class="relative mb-4">
                <i data-lucide="ruler" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
              </div>
              <p class="text-[12px] font-bold text-slate-600 dark:text-dark-muted text-center px-4 mb-1">Nenhuma medida criada ainda</p>
              <p class="text-[10px] text-slate-600 dark:text-dark-muted text-center px-6">Selecione elementos no canvas e toque em <button type="button" onclick="openMeasureModal()" class="font-bold text-[#004d8d] dark:text-[#4da3e0] hover:underline">Inserir medida</button></p>
            </li>
          `;
          _refreshIcons();
        }
        return;
      }

      // Atualiza contador no sub-accordion
      if (frameId) {
        const countEl = document.getElementById(`sub-count-medidas-${frameId}`);
        if (countEl) countEl.textContent = data.length;
      }

      // Cabeçalho de grupo com toggle de visibilidade em bloco
      if (frameId) {
        const frame = getFrame(frameId);
        const isGroupVisible = !(frame && frame.measurementsGroupVisible === false);
        const groupHeader = document.createElement('div');
        groupHeader.className = 'flex items-center justify-between px-2 pb-2 pt-1';
        groupHeader.innerHTML = `
          <span class="text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide">${data.length} medida${data.length !== 1 ? 's' : ''}</span>
          <button type="button" title="${isGroupVisible ? 'Ocultar todas as medidas' : 'Exibir todas as medidas'}"
            onclick="toggleMeasurementsGroup('${frameId}')"
            class="flex items-center gap-1 px-2 py-0.5 rounded-xl text-[10px] font-bold ${isGroupVisible ? 'text-[#005ca9]' : 'text-gray-500'} hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <i data-lucide="${isGroupVisible ? 'eye' : 'eye-off'}" class="w-3 h-3"></i>
            ${isGroupVisible ? 'Ocultar todas' : 'Exibir todas'}
          </button>`;
        container.appendChild(groupHeader);
      }

      data.forEach((item, index) => {
        const section = document.createElement("li");
        section.className = "border border-gray-200 dark:border-dark-line rounded-xl overflow-hidden bg-white dark:bg-dark-surface shadow-sm";
        if (item.nodeId) {
          section.setAttribute('data-node-id', item.nodeId);
        }

        const isExpanded = index === 0;
        const header = document.createElement("div");
        header.className = "flex items-center w-full bg-gray-50 dark:bg-slate-800";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "Expandir/recolher e focar no elemento no Figma";
        btn.setAttribute('aria-label', "Expandir/recolher e focar no elemento no Figma");
        btn.className = "w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left";
        btn.setAttribute('data-accordion-toggle', '');
        btn.onclick = () => toggleAccordion(btn, item.nodeId, item.number || (index + 1));

        const chevronClass = isExpanded ? "rotate-180" : "";
        const chevronColorClass = isExpanded ? "text-[#005ca9] dark:text-blue-300" : "text-gray-500 dark:text-dark-muted";
        btn.innerHTML = `
          <div class="w-5 h-5 flex items-center justify-center bg-[#004d8d] text-white text-[10px] font-bold rounded-full shrink-0">${item.number || (index + 1)}</div>
          <div class="flex-1 min-w-0 text-left">
            <span class="text-[12px] font-bold text-[#1E293B] dark:text-white truncate block" title="${item.name}">${item.name}</span>
          </div>
          <i data-lucide="chevron-down" class="w-4 h-4 ${chevronColorClass} transition-transform ${chevronClass} shrink-0"></i>
        `;

        // Visibility Toggle
        const visBtn = document.createElement("button");
        visBtn.type = "button";
        visBtn.title = "Exibir/Ocultar no canvas";
        visBtn.className = "px-3 py-3 hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors shrink-0 border-l border-gray-100 dark:border-dark-line";
        visBtn.setAttribute('data-vis-btn', '');

        if (item.visible === undefined) {
          item.visible = true;
        }

        const isVisible = item.visible !== false;
        visBtn.innerHTML = isVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
        visBtn.classList.toggle("text-[#004d8d]", isVisible);
        visBtn.classList.toggle("text-gray-400", !isVisible);
        visBtn.setAttribute('aria-label', isVisible ? 'Ocultar medida no canvas' : 'Exibir medida no canvas');

        visBtn.onclick = (e) => {
          e.stopPropagation();
          const nowVisible = !(item.visible !== false);
          item.visible = nowVisible;

          visBtn.innerHTML = nowVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
          visBtn.classList.toggle("text-[#004d8d]", nowVisible);
          visBtn.classList.toggle("text-gray-400", !nowVisible);
          visBtn.setAttribute('aria-label', nowVisible ? 'Ocultar medida no canvas' : 'Exibir medida no canvas');

          if (item.nodeId) {
            parent.postMessage({ pluginMessage: { type: 'hide-node', id: item.nodeId, forceState: nowVisible } }, '*');
          }
          saveToStorage();
          _refreshIcons();
          updateHideAllMeasuresButtonState();
        };

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.title = "Remover medida";
        delBtn.setAttribute('aria-label', 'Remover medida');
        delBtn.className = "px-3 py-3 text-gray-500 dark:text-dark-muted hover:text-red-500 transition-colors shrink-0 border-l border-gray-100 dark:border-dark-line";
        delBtn.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4"></i>`;
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (item.nodeId) {
            parent.postMessage({ pluginMessage: { type: 'delete-node', id: item.nodeId } }, '*');
          }
          if (frameId) {
            const fr = getFrame(frameId);
            if (fr) fr.measurements = (fr.measurements || []).filter(m => m.nodeId !== item.nodeId);
          } else {
            handoffData.measurements = (handoffData.measurements || []).filter(m => m.nodeId !== item.nodeId);
            lastMeasurements = handoffData.measurements;
          }
          saveToStorage();
          section.remove();
        };

        header.appendChild(btn);

        const measActionsRow = document.createElement("div");
        measActionsRow.className = "flex items-center justify-end gap-2 px-3 py-1.5 border-t border-gray-100 dark:border-dark-line bg-gray-50/50 dark:bg-slate-900/30";
        const measActionsLabel = document.createElement("span");
        measActionsLabel.className = "text-[9px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wider shrink-0";
        measActionsLabel.textContent = "Ações";
        measActionsRow.appendChild(measActionsLabel);
        const measActions = document.createElement("div");
        measActions.className = "flex items-center gap-0.5";
        measActions.appendChild(visBtn);
        measActions.appendChild(delBtn);
        measActionsRow.appendChild(measActions);

        const content = document.createElement("div");
        content.setAttribute('data-accordion-content', '');
        content.className = `px-3 py-3 bg-white dark:bg-dark-surface space-y-2 border-t border-gray-100 dark:border-dark-line ${isExpanded ? '' : 'hidden'}`;

        item.details.forEach(det => {
          const detEl = document.createElement("div");
          detEl.className = "text-[11px] text-slate-600 dark:text-dark-text bg-gray-50 dark:bg-dark-bg p-2 rounded-lg border border-gray-100 dark:border-dark-line font-mono";
          detEl.innerText = det;
          content.appendChild(detEl);
        });

        // Preview transitório no canvas — só enquanto o mouse está sobre o
        // item da lista, some ao tirar o mouse (não fica preso ao estado de
        // expandido/recolhido do accordion).
        if (item.nodeId) {
          header.addEventListener('mouseenter', () => sendHighlight(item.nodeId));
          header.addEventListener('mouseleave', () => clearHighlight());
        }

        section.appendChild(header);
        section.appendChild(measActionsRow);
        section.appendChild(content);
        container.appendChild(section);
      });

      _refreshIcons();
      if (!frameId) {
        const currentCount = (data || []).length;
        if (currentCount > (lastMeasurements ? lastMeasurements.length : 0)) {
          autoScrollToNewItem('measures-scroll-container');
        }
        lastMeasurements = data;
        updateHideAllMeasuresButtonState();
      }
    }


    // ── Ocultar Tudo helpers ───────────────────────────────────────
    let _measuresHidden = false;

    function _getAllMeasurements() {
      const standalone = handoffData.measurements || [];
      const perFrame = (handoffData.frames || []).flatMap(f => f.measurements || []);
      return [...standalone, ...perFrame];
    }

    function updateHideAllMeasuresButtonState() {
      const btn = document.getElementById('btn-hide-all-measures');
      if (!btn) return;

      const measurements = _getAllMeasurements();
      if (measurements.length === 0) {
        btn.classList.add('hidden');
        return;
      }
      btn.classList.remove('hidden');

      const allHidden = measurements.every(m => m.visible === false);
      _measuresHidden = allHidden;

      btn.textContent = allHidden ? 'Mostrar tudo' : 'Ocultar tudo';
    }

    function toggleMeasurementsGroup(frameId) {
      if (!frameId) return;
      const frame = getFrame(frameId);
      if (!frame) return;
      const isNowHiding = !(frame.measurementsGroupVisible === false);
      frame.measurementsGroupVisible = !isNowHiding;
      (frame.measurements || []).forEach(m => {
        if (m.nodeId) {
          parent.postMessage({ pluginMessage: { type: 'hide-node', id: m.nodeId, forceState: !isNowHiding } }, '*');
        }
      });
      saveToStorage();
      renderMeasurementsResults(frame.measurements || [], frameId);
      _refreshIcons();
    }
    window.toggleMeasurementsGroup = toggleMeasurementsGroup;

    function toggleAllMeasuresVisibility() {
      const measurements = _getAllMeasurements();
      if (measurements.length === 0) return;

      const anyVisible = measurements.some(m => m.visible !== false);
      const targetState = !anyVisible;

      measurements.forEach(m => {
        m.visible = targetState;
        if (m.nodeId) {
          parent.postMessage({ pluginMessage: { type: 'hide-node', id: m.nodeId, forceState: targetState } }, '*');
        }
      });

      _measuresHidden = !targetState;
      saveToStorage();

      // Atualiza botões de visibilidade em todos os containers (global + por frame)
      document.querySelectorAll('[data-node-id] [data-vis-btn]').forEach(visBtn => {
        visBtn.innerHTML = targetState ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
        visBtn.classList.toggle("text-[#004d8d]", targetState);
        visBtn.classList.toggle("text-gray-400", !targetState);
      });

      const btn = document.getElementById('btn-hide-all-measures');
      if (btn) btn.textContent = _measuresHidden ? 'Mostrar tudo' : 'Ocultar tudo';

      _refreshIcons();
    }

    let _specsHidden = false;

    function openMeasureModal(frameId) {
      if (frameId) activeFrameId = frameId;
      resetMeasureSelection();
      openModal('measure-form-modal');
    }
    function closeMeasureModal() {
      closeModal('measure-form-modal');
    }

    let currentMeasureTypes = [];
    function resetMeasureSelection() {
      currentMeasureTypes = [];
      document.querySelectorAll('.measure-btn').forEach(btn => {
        btn.classList.remove('border-[#005ca9]', 'bg-blue-50', 'dark:bg-blue-900/20', 'outline', 'outline-2', 'outline-offset-2', 'outline-[#005ca9]');
        btn.classList.add('border-gray-100', 'dark:border-dark-line', 'hover:bg-gray-50', 'dark:hover:bg-slate-700');
        const icon = btn.querySelector('.measure-icon');
        if (icon) {
          icon.classList.remove('text-[#005ca9]', 'dark:text-blue-400');
          icon.classList.add('text-slate-500');
        }
        const label = btn.querySelector('.measure-label');
        if (label) {
          label.classList.remove('text-[#005ca9]', 'dark:text-blue-400', 'font-bold');
          label.classList.add('text-slate-500', 'dark:text-dark-text');
        }
      });
    }
    function selectMeasurement(type) {
      if (currentMeasureTypes.includes(type)) {
        if (currentMeasureTypes.length > 1) {
          currentMeasureTypes = currentMeasureTypes.filter(t => t !== type);
        }
      } else {
        currentMeasureTypes.push(type);
      }

      document.querySelectorAll('.measure-btn').forEach(btn => {
        const btnType = btn.id.replace('btn-measure-', '');
        const isActive = currentMeasureTypes.includes(btnType);

        if (isActive) {
          btn.classList.remove('border-gray-100', 'dark:border-dark-line', 'hover:bg-gray-50', 'dark:hover:bg-slate-700');
          btn.classList.add('border-[#005ca9]', 'bg-blue-50', 'dark:bg-blue-900/20', 'outline', 'outline-2', 'outline-offset-2', 'outline-[#005ca9]');
          const icon = btn.querySelector('.measure-icon');
          if (icon) {
            icon.classList.remove('text-slate-500');
            icon.classList.add('text-[#005ca9]', 'dark:text-blue-400');
          }
          const label = btn.querySelector('.measure-label');
          if (label) {
            label.classList.remove('text-slate-500', 'dark:text-dark-text');
            label.classList.add('text-[#005ca9]', 'dark:text-blue-400', 'font-bold');
          }
        } else {
          btn.classList.remove('border-[#005ca9]', 'bg-blue-50', 'dark:bg-blue-900/20', 'outline', 'outline-2', 'outline-offset-2', 'outline-[#005ca9]');
          btn.classList.add('border-gray-100', 'dark:border-dark-line', 'hover:bg-gray-50', 'dark:hover:bg-slate-700');
          const icon = btn.querySelector('.measure-icon');
          if (icon) {
            icon.classList.remove('text-[#005ca9]', 'dark:text-blue-400');
            icon.classList.add('text-slate-500');
          }
          const label = btn.querySelector('.measure-label');
          if (label) {
            label.classList.remove('text-[#005ca9]', 'dark:text-blue-400', 'font-bold');
            label.classList.add('text-slate-500', 'dark:text-dark-text');
          }
        }
      });
    }

    function executeMeasurement() {
      if (!currentMeasureTypes.length) {
        showToast('Selecione ao menos um tipo de medida');
        return;
      }
      const storeInParent = document.getElementById('chk-store-parent').checked;
      const frame = activeFrameId ? getFrame(activeFrameId) : null;
      const startNum = frame ? (frame.nextMeasurementNumber || 1) : nextMeasurementNumber;
      parent.postMessage({
        pluginMessage: {
          type: 'measure-nodes-custom',
          measureTypes: currentMeasureTypes,
          storeInParent,
          startingNumber: startNum
        }
      }, '*');
      closeMeasureModal();
    }

    function exportMeasurements() {
      if (!lastMeasurements || lastMeasurements.length === 0) return;

      const dateStr = new Date().toLocaleString('pt-BR');
      let md = `# Handex \u2014 Dimens\u00f5es e Medidas\n_Exportado em: ${dateStr}_\n\n---\n\n`;

      lastMeasurements.forEach((item, idx) => {
        md += `## ${idx + 1}. ${item.name}\n\n`;
        if (item.details && item.details.length > 0) {
          item.details.forEach(d => { md += `- ${d}\n`; });
        } else {
          md += `_Sem detalhes registrados._\n`;
        }
        md += `\n`;
      });

      md += `---\n_Gerado pelo plugin HANDEX \u2014 Handoff Express_\n`;

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `handex-medidas-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }

