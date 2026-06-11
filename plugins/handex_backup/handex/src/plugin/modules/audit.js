// ============================================================
// audit.js — fluxo de auditoria DSC no plugin
//
// Engloba:
//   1. Estado + lifecycle do toggle ("Auditoria de Design")
//   2. Extração token-free via Plugin API (postMessage para code.js)
//   3. Cache de refs entre sessões (figma.clientStorage via mensagem)
//   4. Render dos cards de status (extracting / ready / unavailable)
//   5. Classificação discreta (worst-of) de elemento por status das props
//   6. Computação do sumário + render do relatório DSC
//
// Depende de: handoffData, showToast, saveToStorage, getInteractiveHTMLContent
// (todos vivem em core.js / handoff.js — escopo global compartilhado)
// ============================================================

    let auditExtractInProgress = false;
    let auditCacheRequested = false;

    function toggleAuditSection(checked) {
      if (checked) {
        // Abre modal de seleção de libs antes de habilitar a seção
        if (typeof openAuditLibsModal === 'function') {
          openAuditLibsModal();
          // A modal chama _activateAuditSection() ao confirmar
          return;
        }
      }
      _activateAuditSection(checked);
    }

    function _activateAuditSection(checked) {
      const content = document.getElementById('audit-card-content');
      if (content) content.classList.toggle('hidden', !checked);
      handoffData.step2.isAuditEnabled = checked;
      saveToStorage();

      if (checked && !auditCacheRequested) {
        auditCacheRequested = true;
        parent.postMessage({ pluginMessage: { type: 'audit-cache-load' } }, '*');
      } else if (checked && handoffData.step2.auditAutoBundle) {
        renderAuditRefsReady(handoffData.step2.auditAutoBundle);
      }
    }

    function refreshAuditRefs() {
      startAuditExtraction();
    }

    function resetAuditCache() {
      auditCacheRequested = false;
      auditExtractInProgress = false;
      if (handoffData && handoffData.step2) handoffData.step2.auditAutoBundle = null;
    }

    function startAuditExtraction() {
      if (auditExtractInProgress) return;
      const skeleton = (typeof window !== 'undefined') ? window.__HANDEX_REF_SKELETON__ : null;
      if (!skeleton || !Array.isArray(skeleton.libraries) || skeleton.libraries.length === 0) {
        renderAuditStatus('unavailable', { message: 'Bundle de referência não embarcado na build. Rode npm run bundle:ui.' });
        return;
      }
      auditExtractInProgress = true;

      const selectedSlugs = handoffData.step2 && handoffData.step2.selectedLibSlugs;
      const filteredLibraries = (selectedSlugs && selectedSlugs.length > 0)
        ? skeleton.libraries.filter(lib => selectedSlugs.includes(lib.slug))
        : skeleton.libraries;

      const filteredSkeleton = { ...skeleton, libraries: filteredLibraries };

      const totalStyles = filteredLibraries.reduce((acc, lib) => {
        const s = lib.styleTokens || {};
        return acc + ((s.colors && s.colors.length) || 0) + ((s.typography && s.typography.length) || 0) + ((s.effects && s.effects.length) || 0);
      }, 0);
      renderAuditStatus('extracting', { processed: 0, total: totalStyles, libName: '', libCount: filteredLibraries.length });
      parent.postMessage({ pluginMessage: { type: 'extract-design-refs', skeleton: filteredSkeleton } }, '*');
    }

    function renderAuditRefsReady(bundle) {
      const libs = bundle.libraries || [];
      const unavailable = libs.filter(l => l._stats && l._stats.libNotAvailable).map(l => (l.meta && l.meta.libraryName) || l.slug);
      renderAuditStatus('ready', {
        generatedAt: bundle.generatedAt,
        libraryCount: libs.length,
        unavailableLibs: unavailable
      });
      enablePerformAuditButton();
    }

    function enablePerformAuditButton() {
      const btn = document.getElementById('btn-perform-audit');
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }

    function renderAuditStatus(state, data) {
      const container = document.getElementById('audit-refs-status');
      if (!container) return;
      data = data || {};

      if (state === 'extracting') {
        const pct = data.total > 0 ? Math.min(100, Math.round((data.processed / data.total) * 100)) : 0;
        container.innerHTML = `
          <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30">
            <div class="flex items-center gap-2 mb-2">
              <i data-lucide="loader-2" class="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin shrink-0"></i>
              <span class="text-[11px] font-bold text-blue-800 dark:text-blue-300 truncate flex-1">${data.libName ? 'Resolvendo ' + data.libName + '…' : 'Iniciando extração…'}</span>
              <span class="text-[10px] font-bold text-blue-600 dark:text-blue-400 shrink-0">${data.processed}/${data.total}</span>
            </div>
            <div class="w-full h-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden">
              <div class="h-full bg-blue-500 transition-all duration-300" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      } else if (state === 'ready') {
        const dt = data.generatedAt ? new Date(data.generatedAt) : new Date();
        const fmt = dt.toLocaleDateString('pt-BR') + ' às ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const errs = data.unavailableLibs || [];
        container.innerHTML = `
          <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800/30">
            <div class="flex items-start gap-2">
              <i data-lucide="check-circle-2" class="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0"></i>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-bold text-green-800 dark:text-green-300">Bibliotecas de referência atualizadas</p>
                <p class="text-[10px] text-green-700 dark:text-green-400 mt-0.5">${fmt} · ${data.libraryCount} biblioteca${data.libraryCount === 1 ? '' : 's'}</p>
                ${errs.length > 0 ? '<p class="text-[10px] text-amber-700 dark:text-amber-400 mt-1.5 leading-snug">⚠ Não disponível no arquivo atual: ' + errs.join(', ') + '. Assine essa(s) lib(s) na equipe para auditar.</p>' : ''}
              </div>
              <button onclick="refreshAuditRefs()" title="Re-extrair bibliotecas" class="px-2 py-1 bg-white dark:bg-green-900/30 border border-green-200 dark:border-green-800/50 rounded text-[10px] font-bold text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors shrink-0">
                Atualizar
              </button>
            </div>
          </div>
        `;
      } else if (state === 'unavailable') {
        container.innerHTML = `
          <div class="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/30">
            <div class="flex items-start gap-2">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"></i>
              <p class="text-[11px] text-amber-800 dark:text-amber-300 flex-1">${data.message || 'Bibliotecas de referência indisponíveis.'}</p>
            </div>
          </div>
        `;
      } else {
        container.innerHTML = '';
      }

      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function handleAuditRefUpload(event) {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      let loadedCount = 0;
      const targetCount = files.length;
      let hasError = false;

      if (!handoffData.step2.auditReferences) handoffData.step2.auditReferences = [];

      for (let i = 0; i < targetCount; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const json = JSON.parse(e.target.result);
            handoffData.step2.auditReferences.push({
              name: file.name,
              tokens: json
            });
          } catch (err) {
            hasError = true;
          }
          loadedCount++;
          if (loadedCount === targetCount) {
            saveToStorage();
            renderAuditFilesList();
            
            const btnPerform = document.getElementById('btn-perform-audit');
            if (btnPerform && handoffData.step2.auditReferences.length > 0) {
              btnPerform.disabled = false;
              btnPerform.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            
            if (hasError) {
              showToast('Alguns arquivos falharam ao ler', 'error');
            } else {
              showToast('Referências de auditoria importadas!');
            }
            // Reset input so same file can be uploaded again if needed
            event.target.value = '';
          }
        };
        reader.readAsText(file);
      }
    }

    function renderAuditFilesList() {
      const container = document.getElementById('audit-files-container');
      if (!container) return;
      container.innerHTML = '';
      
      const refs = handoffData.step2.auditReferences || [];
      if (refs.length === 0) return;
      
      refs.forEach((ref, idx) => {
        const item = document.createElement('div');
        item.className = "p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1";
        item.innerHTML = `
          <div class="flex items-center gap-2 overflow-hidden">
            <i data-lucide="file-json" class="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0"></i>
            <span class="text-[11px] font-bold text-blue-800 dark:text-blue-300 truncate">${ref.name}</span>
          </div>
          <button onclick="removeAuditReference(${idx})" class="p-1 hover:bg-blue-100 dark:hover:bg-blue-800/50 rounded-md text-blue-600 dark:text-blue-400 transition-colors" title="Remover arquivo">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        `;
        container.appendChild(item);
      });
      
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function performAudit() {
      // Auto-extracted bundle libraries (already shaped as referenceTokens objects)
      const autoLibs = (handoffData.step2.auditAutoBundle && Array.isArray(handoffData.step2.auditAutoBundle.libraries))
        ? handoffData.step2.auditAutoBundle.libraries
        : [];
      // Manual uploads come wrapped as { name, tokens } — unwrap to .tokens
      const manualLibs = (handoffData.step2.auditReferences || [])
        .map(r => (r && r.tokens) ? r.tokens : r)
        .filter(Boolean);
      const refs = [...autoLibs, ...manualLibs];

      if (refs.length === 0) {
        showToast("Aguarde a atualização das bibliotecas, ou importe um JSON manual.", "error");
        const content = document.getElementById('audit-card-content');
        if (content && content.classList.contains('hidden')) content.classList.remove('hidden');
        return;
      }
      const btn = document.getElementById('btn-perform-audit');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Auditando...';
      }
      if (window.lucide) lucide.createIcons();
      parent.postMessage({ pluginMessage: { type: "scan-frame", isAudit: true, referenceTokens: refs } }, "*");
    }

    function exportAuditReport() {
      if (!lastAuditResults) return;
      const dataStr = JSON.stringify(lastAuditResults, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const fileName = `relatorio-auditoria-${new Date().toISOString().split('T')[0]}.json`;
      const link = document.createElement('a');
      link.setAttribute('href', dataUri);
      link.setAttribute('download', fileName);
      link.click();
    }

    function removeAuditReference(idx) {
      if (handoffData && handoffData.step2 && handoffData.step2.auditReferences) {
        handoffData.step2.auditReferences.splice(idx, 1);
        saveToStorage();
        renderAuditFilesList();
        
        const btnPerform = document.getElementById('btn-perform-audit');
        if ((!handoffData.step2.auditReferences || handoffData.step2.auditReferences.length === 0) && btnPerform) {
          btnPerform.disabled = true;
          btnPerform.classList.add('opacity-50', 'cursor-not-allowed');
        }
        showToast('Referência removida');
      }
    }

    // Audit thresholds mirror src/plugin/audit.js (AUDIT_THRESHOLDS).
    // Element status is derived from the average score of its properties:
    //   >= 0.98  →  "ok"      "Em conformidade"
    //   >= 0.11  →  "warning" "Necessita revisão"
    //   <  0.11  →  "error"   "Fora do padrão"
    const AUDIT_OURO = 0.98;
    const AUDIT_AJUSTE = 0.11;

    function classifyAuditRate(rate) {
      if (rate >= AUDIT_OURO) return "ok";
      if (rate >= AUDIT_AJUSTE) return "warning";
      return "error";
    }

    // Classifica uma única prop em "ok" | "warning" | "error" (regra discreta).
    function classifyPropStatus(p) {
      if (typeof p.score === "number") {
        if (p.score >= AUDIT_OURO) return "ok";
        if (p.score >= AUDIT_AJUSTE) return "warning";
        return "error";
      }
      if (p.isDS === true) return "ok";
      if (p.isDS === "warning") return "warning";
      return "error";
    }

    // Conta props por status (sem agregar — preserva granularidade).
    function getItemAuditBreakdown(item) {
      const breakdown = { ok: 0, warning: 0, error: 0, total: 0 };
      const props = Array.isArray(item && item.properties) ? item.properties : [];
      for (const p of props) {
        const s = classifyPropStatus(p);
        breakdown[s]++;
        breakdown.total++;
      }
      return breakdown;
    }

    // Element status by WORST-OF rule:
    //   error   = pelo menos 1 prop fora do padrão (qualquer NONE)
    //   warning = nenhuma error, mas pelo menos 1 warning
    //   ok      = todas as props EXACT
    //
    // Elementos sem properties (components/icons puros) caem no element-level score
    // ou no isDS legado.
    function computeItemAuditStatus(item) {
      if (!handoffData.step2.isAuditEnabled) return null;

      if (item.properties && item.properties.length > 0) {
        const b = getItemAuditBreakdown(item);
        if (b.error > 0) return "error";
        if (b.warning > 0) return "warning";
        return "ok";
      }

      // No properties (components/icons): use element-level score, falling back to isDS.
      if (typeof item.score === "number") {
        if (item.score >= AUDIT_OURO) return "ok";
        if (item.score >= AUDIT_AJUSTE) return "warning";
        return "error";
      }
      if (item.isDS === true) return "ok";
      if (item.isDS === "warning") return "warning";
      return "error";
    }

    const AUDIT_LABEL = {
      ok: "Em conformidade",
      warning: "Necessita revisão",
      error: "Fora do padrão"
    };

    function getAuditSummary(data) {
      if (!data) return null;
      let total = 0;
      let dsCount = 0;
      const issues = [];
      const adjustments = [];
      let elementsOk = 0;
      let elementsWarning = 0;
      let elementsError = 0;

      Object.keys(data).forEach(cat => {
        if (cat === "frameJson") return;
        if (!Array.isArray(data[cat])) return;

        data[cat].forEach(element => {
          // Track the element-level status using the same rule as the accordion.
          const elementStatus = computeItemAuditStatus(element);
          if (elementStatus === "ok") elementsOk++;
          else if (elementStatus === "warning") elementsWarning++;
          else if (elementStatus === "error") elementsError++;

          if (element.properties && element.properties.length > 0) {
            element.properties.forEach(p => {
              total++;
              const isOk = (typeof p.score === "number") ? (p.score >= AUDIT_OURO) : (p.isDS === true);
              const isWarning = (typeof p.score === "number") ? (p.score >= AUDIT_AJUSTE && p.score < AUDIT_OURO) : (p.isDS === "warning");
              if (isOk) {
                dsCount++;
              } else if (isWarning) {
                adjustments.push({ cat: cat.toUpperCase(), name: `${element.name} -> ${p.name}` });
              } else {
                issues.push({ cat: cat.toUpperCase(), name: `${element.name} -> ${p.name}` });
              }
            });
          } else if (cat === "components" || cat === "icons") {
            total++;
            if (elementStatus === "ok") dsCount++;
            else if (elementStatus === "warning") adjustments.push({ cat: cat.toUpperCase(), name: element.name });
            else issues.push({ cat: cat.toUpperCase(), name: element.name });
          }
        });
      });

      const elementsTotal = elementsOk + elementsWarning + elementsError;
      return {
        // Property-level (granular)
        total,
        dsCount,
        adoption: total > 0 ? Math.round((dsCount / total) * 100) : 0,
        issues,
        adjustments,
        // Element-level (worst-of rule)
        elementsTotal,
        elementsOk,
        elementsWarning,
        elementsError,
        elementsAdoption: elementsTotal > 0 ? Math.round((elementsOk / elementsTotal) * 100) : 0
      };
    }

    function renderAuditSummary(data) {
      const summary = getAuditSummary(data);
      if (!summary) return;
      
      const container = document.getElementById("scan-results");
      if (!container) return;

      const adoption = summary.adoption;
      const issues = summary.issues;
      const adjustments = summary.adjustments;
      const total = summary.total;
      
      const statusColor = adoption > 90 ? "text-[#10b981]" : (adoption > 70 ? "text-amber-500" : "text-red-500");
      const statusBg = adoption > 90 ? "bg-green-50 dark:bg-green-900/20" : (adoption > 70 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-red-50 dark:bg-red-900/20");

      const auditCard = document.createElement("div");
      auditCard.className = `p-4 rounded-2xl ${statusBg} border border-gray-100 dark:border-dark-line mb-6 animate-in fade-in slide-in-from-top-4 duration-500`;
      auditCard.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <div>
            <h4 class="text-[14px] font-bold text-slate-800 dark:text-white">Relatório de Auditoria</h4>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Análise de aderência ao DSC</p>
          </div>
          <div class="text-right">
            <span class="text-2xl font-black ${statusColor}">${adoption}%</span>
            <p class="text-[9px] font-bold uppercase tracking-widest text-slate-400">Aderência</p>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 mb-3">
          <div class="bg-white/50 dark:bg-black/20 p-2 rounded-xl">
            <p class="text-[9px] text-slate-500 dark:text-slate-400">Analisado</p>
            <p class="text-[13px] font-bold text-slate-800 dark:text-white">${total}</p>
          </div>
          <div class="bg-white/50 dark:bg-black/20 p-2 rounded-xl">
            <p class="text-[9px] text-slate-500 dark:text-slate-400">Fora do padrão</p>
            <p class="text-[13px] font-bold text-red-500">${issues.length}</p>
          </div>
          <div class="bg-white/50 dark:bg-black/20 p-2 rounded-xl">
            <p class="text-[9px] text-slate-500 dark:text-slate-400">Necessita revisão</p>
            <p class="text-[13px] font-bold text-amber-500">${adjustments.length}</p>
          </div>
        </div>

        <div class="bg-white/50 dark:bg-black/20 p-2.5 rounded-xl mb-3">
          <p class="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Legenda</p>
          <div class="space-y-1">
            <div class="flex items-start gap-2 text-[10px]">
              <span class="shrink-0 mt-0.5 px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/30 text-[#10b981] font-bold text-[9px] uppercase tracking-wide">Em conformidade</span>
              <span class="text-slate-500 dark:text-slate-400 leading-snug">≥ 98% das características vinculadas a tokens oficiais da biblioteca.</span>
            </div>
            <div class="flex items-start gap-2 text-[10px]">
              <span class="shrink-0 mt-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-500 font-bold text-[9px] uppercase tracking-wide">Necessita revisão</span>
              <span class="text-slate-500 dark:text-slate-400 leading-snug">Entre 11% e 98% das características casam com a biblioteca — precisa de ajustes.</span>
            </div>
            <div class="flex items-start gap-2 text-[10px]">
              <span class="shrink-0 mt-0.5 px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 font-bold text-[9px] uppercase tracking-wide">Fora do padrão</span>
              <span class="text-slate-500 dark:text-slate-400 leading-snug">Até 10% de aderência — o elemento não referencia tokens oficiais.</span>
            </div>
          </div>
          <p class="text-[9px] text-slate-400 mt-2 italic">Dica: clique em um chip dentro de cada seção para filtrar apenas os itens daquele status.</p>
        </div>

        ${issues.length > 0 ? `
          <div class="flex items-center gap-2 text-red-500 text-[11px] font-bold py-2">
            <i data-lucide="alert-circle" class="w-4 h-4"></i>
            <span>Itens Fora do Padrão detectados</span>
          </div>
        ` : (adjustments.length > 0 ? `
           <div class="flex items-center gap-2 text-amber-500 text-[11px] font-bold py-2">
            <i data-lucide="help-circle" class="w-4 h-4"></i>
            <span>Existem itens que necessitam revisão.</span>
          </div>
        ` : `
          <div class="flex items-center gap-2 text-[#10b981] text-[11px] font-bold py-2">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Parabéns! Design 100% em conformidade com o padrão.</span>
          </div>
        `)}
      `;
      
      container.prepend(auditCard);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
