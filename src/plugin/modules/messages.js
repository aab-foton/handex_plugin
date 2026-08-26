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

        if (typeof setOnboardingSeenState === 'function') setOnboardingSeenState(msg.onboardingSeen);
        // Home é a view ativa por padrão no boot (não passa por navigate()
        // na primeira carga) -- dispara o banner aqui, só depois do estado
        // "visto" chegar do backend, senão apareceria sempre mesmo já visto.
        if (typeof maybeShowOnboardingBanner === 'function') maybeShowOnboardingBanner('home');

        // Auto-fill do título com o nome do arquivo/projeto Figma se campo ainda estiver vazio
        if (msg.projectName) {
          const tituloInput = document.getElementById('s1-titulo');
          if (tituloInput && !tituloInput.value.trim()) {
            tituloInput.value = msg.projectName;
            updateData('step1', 'titulo', msg.projectName);
            if (typeof validateStep1 === 'function') validateStep1();
          }
        }

        // Adiciona automaticamente quem está documentando como primeiro membro da
        // equipe (papel Designer), uma única vez por arquivo — a flag garante que,
        // se o usuário remover esse membro de propósito depois, ele não "ressuscita"
        // sozinho na próxima abertura do plugin.
        if (msg.currentUser && msg.currentUser.name &&
            !handoffData.step1._autoTeamAdded &&
            (!handoffData.step1.equipe || handoffData.step1.equipe.length === 0) &&
            typeof addTeamMember === 'function') {
          addTeamMember('Designer', msg.currentUser.name, '', true);
          handoffData.step1._autoTeamAdded = true;
          if (typeof saveToStorage === 'function') saveToStorage();
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
            if (res) { const _ed = document.createElement('div'); _ed.className = 'p-4 bg-red-50 text-red-600 rounded-xl text-xs'; _ed.textContent = msg.error; res.innerHTML = ''; res.appendChild(_ed); }
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

      if (msg.type === 'ficha-version-pulled') {
        // Sincroniza handoffData com a versão real da ficha já gerada no
        // canvas (se houver), antes de abrir o modal "Gerar Ficha" — evita
        // que o resumo/versionamento partam de um estado desatualizado.
        if (msg.versao) {
          handoffData.step1.versao = msg.versao;
          handoffData._fichaGenerated = true;
          const s1Versao = document.getElementById('s1-versao');
          if (s1Versao) s1Versao.value = msg.versao;
          saveToStorage();
        }
        clearTimeout(window._pullVersionTimeout);
        if (window._pendingOpenInjectModal && typeof _continueOpenHandoffInjectModal === 'function') {
          _continueOpenHandoffInjectModal();
        }
        window._pendingOpenInjectModal = false;
        if (typeof _onFinalizarFichaCheck === 'function') _onFinalizarFichaCheck(!!msg.temFicha);
      }

      if (msg.type === "selection-link") {
        if (msg.targetId === 'exc-modal-vinc') {
          const vinc = document.getElementById('exc-modal-vinc');
          if (!msg.nodeId) {
            showToast('Selecione um elemento no canvas antes de vincular.', 'error');
          } else {
            if (vinc) {
              vinc.value = msg.linkName || '';
              _updateCharCount(vinc, 80);
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

      if (msg.type === 'toast') {
        // showToast() ainda não trata msg.kind (error/success/warning) — sempre exibe ícone de sucesso.
        showToast(msg.message);
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

      if (msg.type === 'flow-recreate-failed') {
        showToast(`Fluxo "${msg.flowName || 'sem nome'}" não recriado -- elemento(s) de origem/destino não encontrados neste arquivo.`);
        return;
      }

      if (msg.type === 'canvas-content-deleted') {
        // Ação combinada "Apagar tudo" dispara este mesmo delete-canvas-content
        // por baixo (com os 4 tipos marcados) e sinaliza via _isClearingEverything
        // -- nesse caso quem termina o fluxo (fecha modal, limpa o registro do
        // plugin, mostra um toast único cobrindo os dois) é _finishClearEverything,
        // não este handler.
        if (typeof window._isClearingEverything === 'function' && window._isClearingEverything()) {
          window._finishClearEverything(msg.counts);
          return;
        }
        closeModal('confirm-clear-modal');
        const c = msg.counts || {};
        const parts = [];
        if (c.ficha) parts.push(`${c.ficha} ficha${c.ficha > 1 ? 's' : ''}`);
        if (c.spec) parts.push(`${c.spec} spec${c.spec > 1 ? 's' : ''}`);
        if (c.medida) parts.push(`${c.medida} medida${c.medida > 1 ? 's' : ''}`);
        if (c.fluxo) parts.push(`${c.fluxo} fluxo${c.fluxo > 1 ? 's' : ''}`);
        showToast(parts.length ? `${parts.join(', ')} removido(s) do canvas.` : 'Nenhum elemento correspondente encontrado no canvas.');
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
        const newSpec = Object.assign({ pendingConfirmation: true }, msg.spec || msg.data);
        if (activeFrameId) {
          const frame = getFrame(activeFrameId);
          if (frame) {
            if (!frame.createdSpecs) frame.createdSpecs = [];
            frame.createdSpecs.push(newSpec);
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
          createdSpecs.push(newSpec);
          renderSpecsList();
        }
        saveSpecsToStorage();
        if (window._toastSaved) _toastSaved();
        showToast('Especificação criada — arraste para posicionar e conclua o posicionamento.');
      }

      if (msg.type === "spec-locked") {
        let found = false;
        (handoffData.frames || []).forEach(frame => {
          (frame.createdSpecs || []).forEach(spec => {
            if (spec && spec.id === msg.specId) {
              spec.pendingConfirmation = false;
              found = true;
            }
          });
        });
        createdSpecs.forEach(spec => {
          if (spec && spec.id === msg.specId) {
            spec.pendingConfirmation = false;
            found = true;
          }
        });
        if (found) {
          if (activeFrameId && typeof renderSpecsListForFrame === 'function') renderSpecsListForFrame(activeFrameId);
          if (typeof renderSpecsList === 'function') renderSpecsList();
          saveSpecsToStorage();
        }
      }

      if (msg.type === "flow-created") {
        if (!handoffData.createdFlows) handoffData.createdFlows = [];
        // Nome digitado em #flow-name-input no modal "Configurar Conexão"
        // vira journeyName (não flow.name -- ver Mudança 2), aplicado a toda
        // conexão criada pela MESMA operação de confirmFlowConnection
        // (inclui cada segmento de uma cadeia de 3+, que dispara flow-created
        // várias vezes em sequência). window._pendingJourneyName só existe
        // (typeof !== 'undefined') logo após confirmFlowConnection -- editar
        // um fluxo existente (confirmEditFlow) não passa por lá, então não
        // deve tocar journeyName. String vazia nunca sobrescreve um
        // journeyName já existente (mesma cautela de renameJourney).
        if (typeof window._pendingJourneyName !== 'undefined' && msg.flow) {
          if (window._pendingJourneyName) msg.flow.journeyName = window._pendingJourneyName;
        }
        // Edição (apaga+recria, ver editFlowConnection em specifications.js)
        // substitui o item no mesmo índice em vez de adicionar um novo --
        // sem isso, editar um fluxo duplicaria a entrada na lista.
        if (typeof window._editingFlowIndex === 'number' && handoffData.createdFlows[window._editingFlowIndex]) {
          handoffData.createdFlows[window._editingFlowIndex] = msg.flow;
        } else {
          handoffData.createdFlows.push(msg.flow);
          handoffData.nextFlowNumber = (handoffData.nextFlowNumber || 1) + 1;
        }
        window._editingFlowIndex = null;
        renderFlowsList();
        saveToStorage();
        if (window._toastSaved) _toastSaved();
        // Conexão em lote (3+ elementos selecionados) dispara flow-created
        // várias vezes em sequência rápida -- focar o canvas a cada uma
        // seria ruim (viewport pulando várias vezes). window._flowBatchActive
        // é setado por flow-batch-created (backend) antes das mensagens
        // individuais chegarem; só foca quando é uma conexão isolada.
        if (!window._flowBatchActive && msg.flow && msg.flow.id) focusNode(msg.flow.id);
        // Fora de um lote, esta é a única conexão da operação -- consome
        // window._pendingJourneyName aqui. Em lote, quem consome é
        // flow-batch-created (dispara só depois de todos os segmentos).
        if (!window._flowBatchActive) window._pendingJourneyName = undefined;
        setTimeout(() => {
          const list = document.getElementById('flows-results');
          const last = list && list.lastElementChild;
          if (last) autoScrollToNewItem('handoff-scroll-container', last);
        }, 100);
      }

      // Marcador automático de Início/Fim movido pra outro elemento (ver
      // _moveFlowEndpointMarker em code.js) -- remove a entrada antiga
      // (nó já apagado do canvas, ficaria órfão na lista) e adiciona a nova.
      if (msg.type === "flow-marker-moved") {
        if (!handoffData.createdFlows) handoffData.createdFlows = [];
        if (msg.removedOldId) {
          handoffData.createdFlows = handoffData.createdFlows.filter(f => f.id !== msg.removedOldId);
        }
        if (msg.flow) {
          handoffData.createdFlows.push(msg.flow);
          handoffData.nextFlowNumber = (handoffData.nextFlowNumber || 1) + 1;
        }
        renderFlowsList();
        saveToStorage();
      }

      if (msg.type === "flow-edit-failed") {
        window._editingFlowIndex = null;
        showToast('Não foi possível editar o fluxo — elemento(s) de origem/destino não encontrado(s) no canvas.', 'error');
      }

      if (msg.type === "flow-batch-started") {
        window._flowBatchActive = true;
      }

      if (msg.type === "flow-batch-created") {
        window._flowBatchActive = false;
        window._pendingJourneyName = undefined;
        showToast(`${msg.count} conexão(ões) criadas em sequência`);
      }

      // Chega tanto em resposta a get-flow-selection-bounds (ao abrir o modal)
      // quanto ao vivo a cada mudança de seleção no canvas -- a função trata
      // o early-return de modal fechado.
      if (msg.type === 'flow-selection-bounds') {
        if (typeof updateFlowAnchorPreview === 'function') updateFlowAnchorPreview(msg.nodes || []);
      }

      if (msg.type === 'flows-resynced') {
        const flows = handoffData.createdFlows || [];
        (msg.updated || []).forEach(u => {
          const flow = flows.find(f => f.flowUid === u.flowUid);
          if (flow) flow.id = u.newId;
        });
        saveToStorage();
        renderFlowsList();
        const failCount = (msg.failed || []).length;
        const okCount = (msg.updated || []).length;
        showToast(failCount > 0
          ? `${okCount} fluxo(s) atualizado(s), ${failCount} não puderam ser recriados.`
          : `${okCount} fluxo(s) atualizado(s).`, failCount > 0 ? 'error' : 'success');
      }

      if (msg.type === 'spec-connector-bounds') {
        if (typeof _applySuggestedSpecConnectorStyle === 'function') {
          _applySuggestedSpecConnectorStyle(msg.specId, msg.nodeBounds, msg.cardBounds);
        }
      }

      if (msg.type === 'selection-id-for-spec') {
        if (typeof _onSelectionIdForSpec === 'function') _onSelectionIdForSpec(msg.targetNodeId);
      }

      if (msg.type === 'node-name-for-spec') {
        if (typeof _onNodeNameForSpec === 'function') _onNodeNameForSpec(msg.name);
      }

      if (msg.type === 'position-ghost-created') {
        if (typeof _onPositionGhostCreated === 'function') _onPositionGhostCreated(msg.ghostId);
      }

      if (msg.type === 'position-ghost-read') {
        if (typeof _onPositionGhostRead === 'function') _onPositionGhostRead(msg.position);
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
            list.innerHTML = '<p class="text-[12px] text-orange-800 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-100 dark:border-orange-800/30 flex items-center gap-3"><i data-lucide="alert-triangle" class="w-5 h-5 shrink-0"></i> Nenhuma propriedade detectada no elemento selecionado.</p>';
          } else {
            const iconMap = { height: 'maximize-2', width: 'maximize-2', radius: 'corner-up-right', direction: 'move', alignment: 'align-center', gap: 'space', padding: 'box', fill: 'palette', stroke: 'square', strokeWidth: 'hash', fontFamily: 'type', fontWeight: 'bold', fontSize: 'text-cursor-input' };
            currentScannedProps.forEach(prop => {
              const id = 'prop-' + prop.key;
              const iconName = iconMap[prop.key] || (prop.key.startsWith('variant-') ? 'component' : 'settings');
              const tokenBadge = prop.token ? `<span class="ml-2 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-[9px] text-[#005ca9] dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-800 shadow-sm">${prop.token}</span>` : '';
              list.innerHTML += `
                <label class="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-dark-surface/50 rounded-2xl cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-800 transition-all group">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-gray-50 dark:bg-dark-bg flex items-center justify-center text-slate-500 dark:text-dark-muted group-hover:text-[#005ca9] transition-colors">
                      <i data-lucide="${iconName}" class="w-4 h-4"></i>
                    </div>
                    <div>
                      <div class="flex items-center">
                        <span class="text-[12px] font-bold text-slate-700 dark:text-white uppercase tracking-tight">${prop.label}</span>
                        ${tokenBadge}
                      </div>
                      ${!prop.token ? `<span class="block text-[11px] text-slate-500 dark:text-dark-muted font-mono">${prop.value}</span>` : ''}
                    </div>
                  </div>
                  <input type="checkbox" id="${id}" value="${prop.key}" checked class="w-5 h-5 rounded-lg border-gray-200 text-[#005ca9] focus:ring-[#005ca9] transition-all cursor-pointer" />
                </label>
              `;
            });
          }
        }
        document.getElementById('spec-properties-modal').classList.remove('hidden');
        _refreshIcons()
        if (typeof _persistentFocus === 'function') {
          _persistentFocus(document.querySelector('#spec-properties-modal ' + FOCUSABLE_SELECTOR));
        }
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
          showToast(`Ficha atualizada — ${msg.timestamp}`);
        } else {
          showToast('Ficha gerada no canvas!');
        }
        return;
      }

      if (msg.type === 'handoff-error') {
        if (typeof hideHandoffLoading === 'function') hideHandoffLoading();
        showToast('Erro ao gerar ficha: ' + (msg.message || 'Verifique o console do plugin.'), 'error');
        return;
      }

      if (msg.type === 'spec-connector-edited') {
        // Busca em createdSpecs (a variável global renderizada na tela, que
        // já cobre specs avulsas e por-frame via _mergeLooseAndFramed) --
        // buscar só em handoffData.frames[].createdSpecs deixaria specs
        // avulsas sem persistir (mesma família de bug já corrigida em
        // removeSpecById/saveSpecsToStorage, ver core.js).
        const spec = (typeof createdSpecs !== 'undefined' ? createdSpecs : []).find(s => s.id === msg.specId);
        if (spec) {
          spec.connectorStyle = msg.connectorStyle;
          spec.connectorCurvature = msg.connectorCurvature;
        }
        if (typeof saveSpecsToStorage === 'function') saveSpecsToStorage();
        else saveToStorage();
        if (typeof closeEditSpecConnectorModal === 'function') closeEditSpecConnectorModal();
        showToast('Linha da especificação atualizada');
        return;
      }

      if (msg.type === 'spec-connector-edit-failed') {
        window._editingSpecConnectorIndex = null;
        showToast('Não foi possível editar a linha — elemento vinculado não encontrado no canvas.', 'error');
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
