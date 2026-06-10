// ============================================================
// messages.js — dispatcher único de window.onmessage
//
// Recebe mensagens postadas pelo backend Figma (code.js) e
// despacha para as funções da UI. Atua como roteador.
// As funções chamadas vivem em core.js / audit.js / measurement.js / etc.
// ============================================================

    function applyFigmaTheme(theme) {
      // Preferência manual do usuário tem prioridade sobre o tema do Figma
      let override = null;
      try { override = localStorage.getItem('theme'); } catch (e) { }
      const resolved = override || theme || 'light';
      const isDark = resolved === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      document.querySelectorAll('.sun-icon').forEach(el => el.classList.toggle('hidden', isDark));
      document.querySelectorAll('.moon-icon').forEach(el => el.classList.toggle('hidden', !isDark));
    }

    // --- MESSAGE HANDLING CONSOLIDATION ---
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      
      if (msg.type === 'init-plugin') {
        applyFigmaTheme(msg.theme);
        const badge = document.getElementById('version-badge');
        if (badge) badge.textContent = 'v' + msg.version;

        // Armazena o usuário Figma identificado automaticamente (sem login)
        if (msg.currentUser) {
          handoffData.currentUser = msg.currentUser;

          // Preenche o campo "Designer responsável" somente se ainda estiver vazio
          const gerenteEl = document.getElementById('s1-gerente');
          if (gerenteEl && !gerenteEl.value && msg.currentUser.name) {
            gerenteEl.value = msg.currentUser.name;
            handoffData.step1.gerente = msg.currentUser.name;
          }

          // Exibe avatar e nome do usuário no header
          const userSlot = document.getElementById('header-user-slot');
          if (userSlot) {
            const u = msg.currentUser;
            const avatarHtml = u.photoUrl
              ? `<img src="${u.photoUrl}" alt="${u.name}" class="w-5 h-5 rounded-full object-cover border border-slate-200 dark:border-dark-line" />`
              : `<span class="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold">${u.name.charAt(0).toUpperCase()}</span>`;
            userSlot.innerHTML = `
              <div class="flex items-center gap-1.5" title="${u.name}">
                ${avatarHtml}
                <span class="text-[10px] font-medium text-slate-500 dark:text-dark-muted max-w-[80px] truncate">${u.name.split(' ')[0]}</span>
              </div>`;
          }
        }

        if (msg.savedState) {
          // Restore handoffData safely, preservando currentUser do Figma
          const mergedStep1 = { ...handoffData.step1, ...(msg.savedState.step1 || {}) };
          // Se o savedState não tinha gerente preenchido, usa o nome do usuário Figma
          if (!mergedStep1.gerente && handoffData.currentUser) {
            mergedStep1.gerente = handoffData.currentUser.name;
          }
          const mergedState = {
            ...handoffData,
            ...msg.savedState,
            briefing: { ...handoffData.briefing, ...(msg.savedState.briefing || {}) },
            step1: mergedStep1,
            step2: { ...handoffData.step2, ...(msg.savedState.step2 || {}) },
            step3: { ...handoffData.step3, ...(msg.savedState.step3 || {}) },
            docs: { ...handoffData.docs, ...(msg.savedState.docs || {}) }
          };
          // Preserva o currentUser que acabou de ser recebido do Figma
          mergedState.currentUser = handoffData.currentUser;
          handoffData = mergedState;
          createdSpecs = handoffData.specs || [];
          // Restaura apenas step1 no boot — frames/flows/specs são lazy-loaded na navegação
          if (typeof _restoreStep1Fields === 'function') _restoreStep1Fields();
        }

        // Auto-fill do título com o nome do arquivo/projeto Figma se campo ainda estiver vazio
        if (msg.projectName) {
          const tituloInput = document.getElementById('s1-titulo');
          if (tituloInput && !tituloInput.value.trim()) {
            tituloInput.value = msg.projectName;
            updateData('step1', 'titulo', msg.projectName);
            if (typeof validateStep1 === 'function') validateStep1();
          }
        }

        // snapshot-load e scan-cache-load são solicitados sob demanda (na navegação para as views que precisam)
        // Onboarding é disparado pelo próprio modals.html via DOMContentLoaded
        return;
      }

      if (msg.type === "scan-result") {
        if (typeof hideScanLoading === 'function') hideScanLoading();
        _refreshIcons()

        // Preferir frameId embutido na resposta (suporte multi-frame)
        const targetFrameId = msg.frameId || activeFrameId;

        if (msg.error) {
          if (targetFrameId) {
            const res = document.getElementById(`scan-results-${targetFrameId}`);
            if (res) res.innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-xl text-xs">${msg.error}</div>`;
            const spinner = document.getElementById(`sub-spinner-tokens-${targetFrameId}`);
            if (spinner) { spinner.classList.add('hidden'); _refreshIcons() }
          }
          return;
        }

        lastAuditResults = msg.data;

        if (targetFrameId) {
          if (targetFrameId !== activeFrameId) activeFrameId = targetFrameId;
          const frame = getFrame(targetFrameId);
          if (frame) {
            frame.specs = msg.data;
            renderSpecs(msg.data, targetFrameId);
            if (typeof showFrameSection === 'function') showFrameSection(targetFrameId, 'tokens');
            if (typeof _updateFrameAuditSubtitle === 'function') _updateFrameAuditSubtitle(targetFrameId);
          }
        } else {
          handoffData.step2.specs = msg.data;
          renderSpecs(msg.data);
        }
        saveToStorage();
      }

      if (msg.type === "selection-link") {
        if (msg.targetId === 'exc-modal-vinc') {
          const vinc = document.getElementById('exc-modal-vinc');
          if (vinc) {
            vinc.value = msg.linkName || '';
            vinc.classList.add('border-green-500', 'ring-2', 'ring-green-100');
            setTimeout(() => vinc.classList.remove('border-green-500', 'ring-2', 'ring-green-100'), 2000);
          }
          if (msg.deeplink) {
            const anchor = document.getElementById('exc-modal-anchor');
            if (anchor && !anchor.value) {
              anchor.value = msg.deeplink;
              anchor.classList.add('border-green-500', 'ring-2', 'ring-green-100');
              setTimeout(() => anchor.classList.remove('border-green-500', 'ring-2', 'ring-green-100'), 2000);
            }
          }
        } else {
          const inputTitle = document.getElementById(`title-${msg.targetId}`);
          if (inputTitle) {
            inputTitle.value = msg.linkName;
            updateData('step3', `${msg.targetId}_title`, msg.linkName);
            inputTitle.classList.add('border-green-500', 'ring-2', 'ring-green-100');
            setTimeout(() => inputTitle.classList.remove('border-green-500', 'ring-2', 'ring-green-100'), 2000);
          }
        }
      }

      if (msg.type === 'annotations-added') {
        showToast(`Anotações criadas`);
      }

      if (msg.type === 'snapshot-history') {
        handoffData._history = Array.isArray(msg.history) ? msg.history : [];
        handoffData.previousSnapshot = handoffData._history[0] || null;
        return;
      }

      if (msg.type === 'cache-cleared') {
        // Reset state e UI completos após limpar cache
        handoffData = {
          briefing: { questions: [] },
          step1: { files: [], versao: 'v0.0.0', gerente: '', gerenteEmail: '' },
          step2: { specs: null, isAuditEnabled: false, auditReferenceTokens: null, auditReferences: [] },
          step3: { team: [], erro_checked: true },
          measurements: [], nextMeasurementNumber: 1,
          tagNames: {}, createdFlows: [], nextFlowNumber: 1,
          currentUser: handoffData.currentUser
        };
        createdSpecs = [];
        restoreUIFromState();
        const scanResults = document.getElementById('scan-results');
        if (scanResults) scanResults.innerHTML = '';
        showToast('Cache limpo. Plugin reiniciado.');
        return;
      }

      if (msg.type === 'scan-cache-loaded') {
        if (msg.data && msg.data.specs) {
          handoffData.step2.specs = msg.data.specs;
          renderSpecs(msg.data.specs, true);
        }
        return;
      }

      if (msg.type === "measurements-applied") {
        if (activeFrameId) {
          const frame = getFrame(activeFrameId);
          if (frame) {
            frame.measurements = (frame.measurements || []).concat(msg.data);
            const maxNum = frame.measurements.reduce((max, m) => Math.max(max, m.number || 0), 0);
            frame.nextMeasurementNumber = maxNum + 1;
            renderMeasurementsResults(frame.measurements, activeFrameId);
            if (typeof renderAllMeasurements === 'function') renderAllMeasurements();
            if (typeof showFrameSection === 'function') showFrameSection(activeFrameId, 'medidas');
            setTimeout(() => {
              const list = document.getElementById(`measurements-list-${activeFrameId}`);
              const last = list && list.lastElementChild;
              if (last) autoScrollToNewItem('handoff-scroll-container', last);
            }, 100);
          }
        } else {
          handoffData.measurements = (handoffData.measurements || []).concat(msg.data);
          lastMeasurements = handoffData.measurements;
          const maxNum = handoffData.measurements.reduce((max, m) => Math.max(max, m.number || 0), 0);
          handoffData.nextMeasurementNumber = maxNum + 1;
          nextMeasurementNumber = handoffData.nextMeasurementNumber;
          renderMeasurementsResults(handoffData.measurements);
        }
        saveToStorage();
        if (window._toastSaved) _toastSaved();
      }

      if (msg.type === "spec-created") {
        if (activeFrameId) {
          const frame = getFrame(activeFrameId);
          if (frame) {
            if (!frame.createdSpecs) frame.createdSpecs = [];
            frame.createdSpecs.push(msg.spec || msg.data);
            renderSpecsListForFrame(activeFrameId);
            if (typeof syncAndRenderSpecs === 'function') syncAndRenderSpecs();
            if (typeof showFrameSection === 'function') showFrameSection(activeFrameId, 'specs');
            setTimeout(() => {
              const list = document.getElementById(`specs-list-${activeFrameId}`);
              const last = list && list.lastElementChild;
              if (last) autoScrollToNewItem('handoff-scroll-container', last);
            }, 100);
          }
        } else {
          createdSpecs.push(msg.spec || msg.data);
          renderSpecsList();
        }
        saveSpecsToStorage();
        if (window._toastSaved) _toastSaved();
      }

      if (msg.type === "flow-created") {
        if (!handoffData.createdFlows) handoffData.createdFlows = [];
        handoffData.createdFlows.push(msg.flow);
        handoffData.nextFlowNumber = (handoffData.nextFlowNumber || 1) + 1;
        renderFlowsList();
        saveToStorage();
        if (window._toastSaved) _toastSaved();
        if (msg.flow && msg.flow.id) focusNode(msg.flow.id);
        setTimeout(() => {
          const list = document.getElementById('flows-results');
          const last = list && list.lastElementChild;
          if (last) autoScrollToNewItem('handoff-scroll-container', last);
        }, 100);
      }

      if (msg.type === "design-data-exported") {
        const blob = new Blob([msg.data], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = msg.format === 'xlsx' ? 'csv' : 'csv';
        a.download = `design-data-${Date.now()}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Dados exportados com sucesso!`);
      }

      if (msg.type === "show-spec-properties") {
        currentScannedProps = msg.properties;
        const list = document.getElementById('spec-properties-list');
        if (list) {
          list.innerHTML = '';
          if (!currentScannedProps || currentScannedProps.length === 0) {
            list.innerHTML = '<p class="text-[12px] text-orange-500 bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-100 dark:border-orange-800/30 flex items-center gap-3"><i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i> Nenhuma propriedade detectada no elemento selecionado.</p>';
          } else {
            const iconMap = { height: 'maximize-2', width: 'maximize-2', radius: 'corner-up-right', direction: 'move', alignment: 'align-center', gap: 'space', padding: 'box', fill: 'palette', stroke: 'square', strokeWidth: 'hash', fontFamily: 'type', fontWeight: 'bold', fontSize: 'text-cursor-input' };
            currentScannedProps.forEach(prop => {
              const id = 'prop-' + prop.key;
              const iconName = iconMap[prop.key] || (prop.key.startsWith('variant-') ? 'component' : 'settings');
              const tokenBadge = prop.token ? `<span class="ml-2 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-[9px] text-[#0070af] dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-800 shadow-sm">${prop.token}</span>` : '';
              list.innerHTML += `
                <label class="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-dark-surface/50 rounded-2xl cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-800 transition-all group">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-gray-50 dark:bg-dark-bg flex items-center justify-center text-slate-500 group-hover:text-[#0070af] transition-colors">
                      <i data-lucide="${iconName}" class="w-4 h-4"></i>
                    </div>
                    <div>
                      <div class="flex items-center">
                        <span class="text-[12px] font-bold text-slate-700 dark:text-white uppercase tracking-tight">${prop.label}</span>
                        ${tokenBadge}
                      </div>
                      ${!prop.token ? `<span class="block text-[11px] text-slate-500 font-mono">${prop.value}</span>` : ''}
                    </div>
                  </div>
                  <input type="checkbox" id="${id}" value="${prop.key}" checked class="w-5 h-5 rounded-lg border-gray-200 text-[#0070af] focus:ring-[#0070af] transition-all cursor-pointer" />
                </label>
              `;
            });
          }
        }
        document.getElementById('spec-properties-modal').classList.remove('hidden');
        _refreshIcons()
      }

      if (msg.type === 'context-name') {
        const field = window._pendingContextField;
        window._pendingContextField = null;
        if (field && msg.name) {
          const input = document.getElementById('s1-' + field);
          if (input && !input.value.trim()) {
            input.value = msg.name;
            updateData('step1', field, msg.name);
          }
        }
      }

      if (msg.type === 'selection-info') {
        const nodes = msg.nodes || (msg.nodeId ? [{ nodeId: msg.nodeId, name: msg.name }] : []);
        if (msg.error || nodes.length === 0) {
          showToast('Selecione um ou mais Frames no canvas primeiro.');
          return;
        }
        const cats = window._pendingScanCategories || null;
        window._pendingScanCategories = null;
        nodes.forEach(node => {
          if (typeof addFrame === 'function') {
            const existing = (handoffData.frames || []).find(f => f.figmaId === node.nodeId);
            if (existing) {
              showToast(`Frame "${existing.nome}" já escaneado. Atualizando...`);
              scanFrame(existing.id, cats, null);
              return;
            }
            const frame = addFrame(node.nodeId, node.name);
            if (frame) scanFrame(frame.id, cats, null);
          }
        });
        return;
      }

      if (msg.type === 'project-name') {
        const input = document.getElementById('s1-titulo');
        if (input && (!input.value || msg.force)) {
          input.value = msg.name;
          updateData('step1', 'titulo', msg.name);
          if (typeof validateStep1 === 'function') validateStep1();
          input.classList.add('ring-2', 'ring-blue-100');
          setTimeout(() => input.classList.remove('ring-2', 'ring-blue-100'), 1000);
        }
        return;
      }

      if (msg.type === 'handoff-complete') {
        if (typeof hideHandoffLoading === 'function') hideHandoffLoading();
        if (typeof _markFichaGenerated === 'function') _markFichaGenerated();
        if (msg.isUpdate) {
          showToast(`Nova versão ${handoffData.step1.versao} gerada ao lado — ${msg.timestamp}`);
        } else {
          showToast('Ficha gerada no canvas!');
        }
        return;
      }

      if (msg.type === 'briefing-data-pulled') {
        const pulled = msg.data || [];
        if (pulled.length === 0) {
          showToast('Nenhum framework de briefing encontrado no canvas.');
          return;
        }
        pulled.forEach(q => {
          if (typeof addBriefingQuestion === 'function') addBriefingQuestion(q.question, q.category);
        });
        showToast(`${pulled.length} pergunta(s) de briefing importadas do canvas.`);
        return;
      }

      if (msg.type === 'framework-injected') {
        showToast('Framework inserido no canvas! ✓', 'success');
        return;
      }
    };
