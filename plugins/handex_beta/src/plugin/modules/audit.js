// ============================================================
// audit.js — declaração de conformidade por frame
//
// Substitui o antigo fluxo de extração e scan de bibliotecas DSC.
// O designer declara o status de conformidade de cada frame
// documentado e justifica desvios intencionais quando necessário.
// O Figma nativo (Check designs) cobre a verificação em tempo de
// design; o Handex registra a decisão final no momento do handoff.
// ============================================================

    function navigateToAudit() {
      navigate('view-audit');
      setTimeout(_refreshAuditView, 50);
    }

    function _refreshAuditView() {
      const frames = handoffData.frames || [];
      const emptyState = document.getElementById('audit-empty-state');
      const auditControls = document.getElementById('audit-controls');
      const list = document.getElementById('audit-frame-list');

      if (frames.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (auditControls) auditControls.classList.add('hidden');
        return;
      }
      if (emptyState) emptyState.classList.add('hidden');
      if (auditControls) auditControls.classList.remove('hidden');

      if (list) {
        list.innerHTML = '';
        const STATUS_CFG = {
          conforme:       { label: 'Conforme',               icon: 'check-circle-2', color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/30' },
          excecoes:       { label: 'Conforme com Exceções',  icon: 'alert-circle',   color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/30' },
          'nao-conforme': { label: 'Não Conforme',           icon: 'x-circle',       color: 'text-red-500',   bg: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/30' }
        };

        frames.forEach(frame => {
          const audit = frame.audit || {};
          let icon, color, bg, label;
          if (!audit.checkDone) {
            icon = 'clock'; color = 'text-slate-500'; bg = 'bg-slate-50 dark:bg-slate-800/20 border-slate-100 dark:border-slate-700/30';
            label = 'Verificação pendente';
          } else if (audit.semDesvios) {
            icon = 'check-circle-2'; color = 'text-green-600'; bg = 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/30';
            label = 'Sem desvios';
          } else {
            icon = 'alert-circle'; color = 'text-amber-500'; bg = 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/30';
            label = 'Desvios registrados';
          }
          const item = document.createElement('div');
          item.className = `flex items-start gap-3 p-3 rounded-xl border ${bg} animate-in fade-in duration-300`;
          item.innerHTML = `
            <i data-lucide="${icon}" class="w-4 h-4 shrink-0 mt-0.5 ${color}"></i>
            <div class="flex-1 min-w-0">
              <p class="text-[12px] font-bold text-slate-800 dark:text-white truncate">${frame.nome}</p>
              <p class="text-[11px] font-semibold mt-0.5 ${color}">${label}</p>
              ${audit.observacoes ? `<p class="text-[10px] text-slate-500 dark:text-dark-muted mt-1.5 leading-relaxed border-t border-gray-100 dark:border-dark-line pt-1.5">${audit.observacoes}</p>` : ''}
            </div>
            <button onclick="focusNode('${frame.figmaId}')" title="Localizar no canvas"
              class="p-1.5 rounded-lg text-gray-300 hover:text-[#0070af] hover:bg-white dark:hover:bg-dark-surface transition-colors shrink-0">
              <i data-lucide="locate" class="w-3.5 h-3.5"></i>
            </button>
          `;
          list.appendChild(item);
        });
      }

      const pending  = frames.filter(f => !f.audit || !f.audit.checkDone).length;
      const ok       = frames.filter(f => f.audit && f.audit.checkDone && f.audit.semDesvios).length;
      const desvios  = frames.filter(f => f.audit && f.audit.checkDone && !f.audit.semDesvios).length;
      const summary = document.getElementById('audit-summary');
      if (summary) {
        summary.innerHTML = `
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30 p-2.5 rounded-xl">
              <p class="text-[18px] font-black text-green-600">${ok}</p>
              <p class="text-[9px] text-green-600 font-bold uppercase tracking-wide">Sem Desvios</p>
            </div>
            <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 p-2.5 rounded-xl">
              <p class="text-[18px] font-black text-amber-500">${desvios}</p>
              <p class="text-[9px] text-amber-500 font-bold uppercase tracking-wide">Com Desvios</p>
            </div>
            <div class="bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-700/30 p-2.5 rounded-xl">
              <p class="text-[18px] font-black text-slate-500">${pending}</p>
              <p class="text-[9px] text-slate-500 font-bold uppercase tracking-wide">Pendentes</p>
            </div>
          </div>`;
      }
      try { lucide.createIcons(); } catch(e) {}
    }

    function setFrameCheckDone(frameId, checked) {
      const frame = getFrame(frameId);
      if (!frame) return;
      if (!frame.audit) frame.audit = {};
      frame.audit.checkDone = checked;
      const resultEl = document.getElementById(`audit-result-${frameId}`);
      if (resultEl) resultEl.classList.toggle('hidden', !checked);
      _updateFrameAuditSubtitle(frameId);
      saveToStorage();
    }

    function setFrameSemDesvios(frameId, checked) {
      const frame = getFrame(frameId);
      if (!frame) return;
      if (!frame.audit) frame.audit = {};
      frame.audit.semDesvios = checked;
      const obsEl = document.getElementById(`audit-obs-${frameId}`);
      if (obsEl) obsEl.classList.toggle('hidden', checked);
      _updateFrameAuditSubtitle(frameId);
      saveToStorage();
    }

    function setFrameAuditObs(frameId, value) {
      const frame = getFrame(frameId);
      if (!frame) return;
      if (!frame.audit) frame.audit = {};
      frame.audit.observacoes = value;
      saveToStorage();
    }

    function _updateFrameAuditSubtitle(frameId) {
      const frame = getFrame(frameId);
      const subtitle = document.getElementById(`frame-subtitle-${frameId}`);
      if (!subtitle) return;
      if (frame && frame.isNewComponent) {
        subtitle.className = 'text-[10px] text-violet-500 font-medium';
        subtitle.textContent = 'Novo Componente';
        return;
      }
      const audit = frame && frame.audit;
      if (!audit || !audit.checkDone) {
        subtitle.className = 'text-[10px] text-slate-300 dark:text-dark-muted font-medium';
        subtitle.textContent = 'Verificação pendente';
        return;
      }
      if (audit.semDesvios) {
        subtitle.className = 'text-[10px] text-green-600 font-medium';
        subtitle.textContent = 'Sem desvios';
      } else {
        subtitle.className = 'text-[10px] text-amber-500 font-medium';
        subtitle.textContent = 'Desvios registrados';
      }
    }

    // ── Stubs para compatibilidade com specifications.js ─────────────
    // computeItemAuditStatus e AUDIT_LABEL são referenciados em
    // createAccordionSection/createSpecItem mas nunca acionados pois
    // isCurrentFrameAuditEnabled() retorna false.
    const AUDIT_LABEL = { ok: 'Em conformidade', warning: 'Necessita revisão', error: 'Fora do padrão' };
    function computeItemAuditStatus() { return null; }
    function getAuditSummary() { return null; }

    Object.assign(window, {
      navigateToAudit,
      setFrameCheckDone,
      setFrameSemDesvios,
      setFrameAuditObs,
      _updateFrameAuditSubtitle,
      _refreshAuditView
    });
