// ============================================================
// messages.js — dispatcher único de window.onmessage
//
// Recebe mensagens postadas pelo backend Figma (code.js) e
// despacha para as funções da UI. Atua como roteador.
// As funções chamadas vivem em core.js / audit.js / measurement.js / etc.
// ============================================================

    // --- MESSAGE HANDLING CONSOLIDATION ---
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      
      if (msg.type === 'init-plugin') {
        const badge = document.getElementById('version-badge');
        if (badge) badge.textContent = 'v' + msg.version;
        
        if (msg.savedState) {
          // Restore handoffData safely
          const mergedState = {
            ...handoffData,
            ...msg.savedState,
            briefing: { ...handoffData.briefing, ...(msg.savedState.briefing || {}) },
            step1: { ...handoffData.step1, ...(msg.savedState.step1 || {}) },
            step2: { ...handoffData.step2, ...(msg.savedState.step2 || {}) },
            step3: { ...handoffData.step3, ...(msg.savedState.step3 || {}) },
            docs: { ...handoffData.docs, ...(msg.savedState.docs || {}) }
          };
          handoffData = mergedState;
          createdSpecs = handoffData.specs || [];
          restoreUIFromState();
          renderFlowsList();
        }
        // Request handoff history so the next exported HTML can show a diff
        // with the previous version.
        parent.postMessage({ pluginMessage: { type: 'snapshot-load' } }, '*');
        return;
      }

      if (msg.type === "scan-result") {
        const btnScan = document.getElementById("btn-scan");
        if (btnScan) {
          btnScan.disabled = false;
          btnScan.innerHTML = '<i data-lucide="search" class="w-4 h-4"></i> Escanear Frame';
        }
        
        const btnAudit = document.getElementById("btn-perform-audit");
        if (btnAudit) {
          btnAudit.disabled = false;
          btnAudit.innerHTML = '<i data-lucide="check-square" class="w-4 h-4"></i> Realizar Auditoria';
        }
        
        try { lucide.createIcons(); } catch(e) {}

        if (msg.error) {
          const res = document.getElementById("scan-results");
          if (res) res.innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-xl text-xs">${msg.error}</div>`;
          return;
        }

        handoffData.step2.specs = msg.data;
        lastAuditResults = msg.data;
        renderSpecs(msg.data);
        if (handoffData.step2.isAuditEnabled) {
          renderAuditSummary(msg.data);
        }
        saveToStorage();
      }

      if (msg.type === "selection-link") {
        const inputTitle = document.getElementById(`title-${msg.targetId}`);
        if (inputTitle) {
          inputTitle.value = msg.linkName;
          updateData('step3', `${msg.targetId}_title`, msg.linkName);
          inputTitle.classList.add('border-green-500', 'ring-2', 'ring-green-100');
          setTimeout(() => inputTitle.classList.remove('border-green-500', 'ring-2', 'ring-green-100'), 2000);
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

      if (msg.type === 'audit-cache-loaded') {
        if (msg.bundle && Array.isArray(msg.bundle.libraries) && msg.bundle.libraries.length > 0) {
          handoffData.step2.auditAutoBundle = msg.bundle;
          renderAuditRefsReady(msg.bundle);
        } else {
          startAuditExtraction();
        }
        return;
      }

      if (msg.type === 'extract-progress') {
        renderAuditStatus('extracting', {
          processed: msg.processed,
          total: msg.total,
          libName: msg.libName
        });
        return;
      }

      if (msg.type === 'extract-done') {
        auditExtractInProgress = false;
        if (msg.error) {
          renderAuditStatus('unavailable', { message: msg.error });
          return;
        }
        handoffData.step2.auditAutoBundle = msg.bundle;
        parent.postMessage({ pluginMessage: { type: 'audit-cache-save', bundle: msg.bundle } }, '*');
        renderAuditRefsReady(msg.bundle);
        return;
      }

      if (msg.type === "measurements-applied") {
        handoffData.measurements = (handoffData.measurements || []).concat(msg.data);
        lastMeasurements = handoffData.measurements;
        const maxNum = handoffData.measurements.reduce((max, m) => Math.max(max, m.number || 0), 0);
        handoffData.nextMeasurementNumber = maxNum + 1;
        nextMeasurementNumber = handoffData.nextMeasurementNumber;
        renderMeasurementsResults(handoffData.measurements);
        saveToStorage();
      }

      if (msg.type === "spec-created") {
        createdSpecs.push(msg.spec || msg.data);
        saveSpecsToStorage();
        renderSpecsList();
      }

      if (msg.type === "flow-created") {
        if (!handoffData.createdFlows) handoffData.createdFlows = [];
        handoffData.createdFlows.push(msg.flow);
        handoffData.nextFlowNumber = (handoffData.nextFlowNumber || 1) + 1;
        renderFlowsList();
        saveToStorage();
        if (msg.flow && msg.flow.id) focusNode(msg.flow.id);
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
                    <div class="w-8 h-8 rounded-lg bg-gray-50 dark:bg-dark-bg flex items-center justify-center text-slate-400 group-hover:text-[#0070af] transition-colors">
                      <i data-lucide="${iconName}" class="w-4 h-4"></i>
                    </div>
                    <div>
                      <div class="flex items-center">
                        <span class="text-[12px] font-bold text-slate-700 dark:text-white uppercase tracking-tight">${prop.label}</span>
                        ${tokenBadge}
                      </div>
                      <span class="block text-[11px] text-slate-500 font-mono">${prop.value}</span>
                    </div>
                  </div>
                  <input type="checkbox" id="${id}" value="${prop.key}" checked class="w-5 h-5 rounded-lg border-gray-200 text-[#0070af] focus:ring-[#0070af] transition-all cursor-pointer" />
                </label>
              `;
            });
          }
        }
        document.getElementById('spec-properties-modal').classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      if (msg.type === 'selection-name') {
        const input = document.getElementById('s1-fluxo');
        if (input) {
          // Só atualiza se o campo estiver vazio ou se o usuário não estiver focado nele OU se for manual
          if (!input.value || document.activeElement !== input || msg.isManual) {
            input.value = msg.name;
            updateData('step1', 'fluxo', msg.name);
            
            // Pequeno feedback visual
            input.classList.add('ring-2', 'ring-blue-100');
            setTimeout(() => input.classList.remove('ring-2', 'ring-blue-100'), 1000);
          }
        }
      }
    };
