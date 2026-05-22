// --- GLOBAL STATE & CONSTANTS ---
let currentStep = 1;
const totalSteps = 4;
window.uploadedFiles = {};
let lastMeasurements = [];
let createdSpecs = [];
let currentSpecTab = 'specs-form';
let lastAuditResults = null;
let handoffData = {
  briefing: { questions: [] },
  step1: { files: [], versao: "v2.0.0" },
  step2: { specs: null, isAuditEnabled: false, auditReferenceTokens: null, auditReferences: [] },
  step3: {
    team: [],
    erro_checked: true,
    confirmacao_checked: true,
    aviso_checked: false,
    sucesso_checked: true,
    info_checked: true,
    regras_checked: true,
    doc_checked: true,
    nao_aplica_checked: false
  },
  docs: {
    proto: { checked: false, link: '' },
    a11y: { checked: false, link: '' },
    research: { checked: false, link: '' }
  },
  step4: {},
  measurements: [],
  nextMeasurementNumber: 1,
  tagNames: {},
  createdFlows: [],
  nextFlowNumber: 1
};

// Expose functions to window IMMEDIATELY (hoisting will handle the function definitions)
Object.assign(window, {
  toggleTheme,
  toggleCollapse,
  startHandoff,
  navigate,
  exportHandoffData,
  importHandoffData,
  toggleAllMeasuresVisibility,
  exportMeasurements,
  switchSpecTab,
  toggleAccordion,
  toggleAllSpecsVisibility,
  exportSpecsToMd,
  toggleBriefingSection,
  scrollToStep,
  scanFrame,
  toggleAuditSection,
  refreshAuditRefs,
  handleAuditRefUpload,
  performAudit,
  exportAuditReport,
  openMeasureModal,
  openSpecFormModal,
  openFlowFormModal,
  addBriefingQuestion,
  addChecklistItem,
  addStateItem,
  addMotionItem,
  removeStateItem,
  removeMotionItem,
  scrollToTop,
  handleScroll,
  removeBriefingQuestion,
  updateBriefingQuestion,
  removeChecklistItem,
  updateData,
  showToast,
  focusNode,
  saveToStorage,
  saveSpecsToStorage,
  removeAuditReference,
  validateUrl,
  validateEmail,
  exportHandoff,
  openModal,
  closeModal,
  openHelp,
  closeHelpAndReturn,
  toggleCategoryManager,
  addCategory,
  requestSpecProperties,
  confirmSpecProperties,
  closeMeasureModal,
  selectMeasurement,
  executeMeasurement,
  selectFlowType,
  confirmFlowConnection,
  toggleUiScale
});

function saveSpecsToStorage() {
  handoffData.specs = createdSpecs;
  saveToStorage();
}

let nextMeasurementNumber = 1;

document.addEventListener('DOMContentLoaded', () => {
  if (handoffData && handoffData.currentSpecTab) {
    currentSpecTab = handoffData.currentSpecTab;
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
});

    // ── Plugin Collapse / Expand ──────────────────────────────────────────
    let isCollapsed = false;
    const FULL_W = 480, FULL_H = 750;
    // 44px = altura do header (py-2 top + py-2 bottom + conteúdo ≈ 44px)
    const MINI_H = 44;

    function toggleCollapse() {
      isCollapsed = !isCollapsed;
      const mainContent = document.querySelector('body > div.flex-1');
      const collapseBtn = document.getElementById('btn-collapse');

      if (isCollapsed) {
        if (mainContent) mainContent.classList.add('hidden');
        // Trocar ícone para maximize
        if (collapseBtn) collapseBtn.innerHTML = '<i data-lucide="maximize-2" class="w-4 h-4" aria-hidden="true"></i>';
      } else {
        if (mainContent) mainContent.classList.remove('hidden');
        // Trocar ícone para minimize
        if (collapseBtn) collapseBtn.innerHTML = '<i data-lucide="minimize-2" class="w-4 h-4" aria-hidden="true"></i>';
      }

      parent.postMessage({
        pluginMessage: {
          type: 'resize-ui',
          width:  FULL_W,
          height: isCollapsed ? MINI_H : FULL_H
        }
      }, '*');

      try { lucide.createIcons(); } catch(e) {}
    }

    // Initialize Categorized Briefing Suggestions
    function initBriefingSuggestions() {
      const container = document.getElementById('briefing-categories-container-v2');
      if (!container) return;
      container.innerHTML = '';
      
      const categories = [
        {
          id: 'negocio',
          name: 'Negócio',
          icon: 'briefcase',
          color: 'text-blue-500',
          questions: [
            { label: 'Problema', text: 'Qual a principal dor do usuário ou problema de negócio estamos resolvendo?' },
            { label: 'Stakeholders', text: 'Quem são os principais decisores e stakeholders envolvidos no projeto?' },
            { label: 'Métricas (KPIs)', text: 'Como mediremos o sucesso desta entrega (ex: conversão, redução de chamados)?' },
            { label: 'Diferencial', text: 'Qual o principal diferencial ou valor único que esta solução propõe ao usuário?' },
            { label: 'Canais', text: 'Em quais plataformas a solução vai rodar (App CAIXA, IBC, Internet Banking, etc.)?' },
            { label: 'Público-Alvo', text: 'Quem é o usuário final desta interface e qual seu perfil?' },
            { label: 'Histórico', text: 'Houve tentativas anteriores de resolver esse problema? O que aprendemos com elas?' }
          ]
        },
        {
          id: 'tech',
          name: 'Escopo Técnico',
          icon: 'git-merge',
          color: 'text-orange-500',
          questions: [
            { label: 'MVP', text: 'O que é estritamente essencial para a primeira entrega e o que fica para depois?' },
            { label: 'Riscos', text: 'Quais os maiores riscos identificados que podem impedir o sucesso do projeto?' },
            { label: 'Impacto Cruzado', text: 'Esta solução afeta outras jornadas, componentes ou produtos da CAIXA?' },
            { label: 'Restrições Técnicas', text: 'Existem limitações conhecidas de arquitetura, legados ou segurança?' },
            { label: 'Compliance/Legal', text: 'Há regras de negócio específicas ou normativos (ex: Bacen, LGPD) envolvidos?' },
            { label: 'Dependências', text: 'Existem dependências críticas de outros times ou tecnologias externas?' },
            { label: 'Não-escopo', text: 'O que está explicitamente fora do escopo desta versão ou entrega?' }
          ]
        },
        {
          id: 'design',
          name: 'UX e Design',
          icon: 'compass',
          color: 'text-purple-500',
          questions: [
            { label: 'Jornada', text: 'Em qual etapa da jornada do cliente essa interface ou funcionalidade está inserida?' },
            { label: 'Materiais Prévios', text: 'Existem pesquisas, dados de uso ou documentações anteriores que embasam esta demanda?' },
            { label: 'Benchmarking', text: 'Quais são as principais referências de mercado ou concorrentes para esta solução?' },
            { label: 'Tom de Voz', text: 'Qual o tom de voz e personalidade que a marca deve projetar nesta interação?' },
            { label: 'Anti-objetivos', text: 'O que você absolutamente NÃO quer ver no resultado final dessa interface?' },
            { label: 'Sentimento', text: 'Qual a principal percepção que o design deve transmitir (ex: segurança, agilidade)?' },
            { label: 'Acessibilidade', text: 'Há requisitos específicos de acessibilidade ou inclusão para este público-alvo?' }
          ]
        }
      ];

      categories.forEach(cat => {
        const catDiv = document.createElement('div');
        catDiv.className = 'border border-gray-100 dark:border-dark-line rounded-xl overflow-hidden bg-white dark:bg-dark-surface/30';
        catDiv.innerHTML = `
          <button onclick="toggleCategory('${cat.id}')" class="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-dark-surface/50 hover:bg-slate-100 transition-all">
            <span class="flex items-center gap-2 text-[12px] font-bold text-slate-700 dark:text-white">
              <i data-lucide="${cat.icon}" class="w-4 h-4 ${cat.color}"></i>
              ${cat.name}
            </span>
            <i data-lucide="chevron-down" id="arrow-${cat.id}" class="w-4 h-4 text-gray-400 transition-transform"></i>
          </button>
          <div id="cat-${cat.id}" class="hidden p-3 bg-white dark:bg-dark-bg/10 border-t border-gray-100 dark:border-dark-line">
            <div class="flex flex-wrap gap-2" id="chips-${cat.id}"></div>
          </div>
        `;
        container.appendChild(catDiv);

        const chipsContainer = document.getElementById(`chips-${cat.id}`);
        cat.questions.forEach(q => {
          const btn = document.createElement('button');
          btn.className = 'px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-dark-muted rounded-full text-[11px] font-bold hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-[#0070af] dark:hover:text-blue-400 transition-all border border-transparent hover:border-blue-100 dark:hover:border-blue-900';
          btn.innerHTML = `+ ${q.label}`;
          btn.onclick = () => addBriefingQuestion(q.text, cat.name);
          chipsContainer.appendChild(btn);
        });
      });
      lucide.createIcons();
    }

    function toggleCategory(id) {
      const el = document.getElementById(`cat-${id}`);
      const arrow = document.getElementById(`arrow-${id}`);
      if (el && arrow) {
        const isHidden = el.classList.contains('hidden');
        el.classList.toggle('hidden');
        arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    }

    function addBriefingQuestion(questionText = "", category = "Customizada") {
      if (typeof questionText !== 'string') questionText = "";
      const container = document.getElementById('briefing-questions-container-v2');
      const id = Date.now();
      const index = container.children.length + 1;
      
      const card = document.createElement('div');
      card.id = `briefing-card-${id}`;
      card.className = "bg-white dark:bg-dark-bg p-5 rounded-xl border border-gray-100 dark:border-dark-line shadow-sm relative animate-in slide-in-from-top-4 duration-300";
      card.innerHTML = `
        <button onclick="removeBriefingQuestion('${id}')" title="Excluir Pergunta" class="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
        <div class="flex items-center gap-3 mb-4">
          <span class="text-[#0070af] font-bold text-[14px]">#${index} Pergunta</span>
          <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-dark-muted rounded border border-gray-100 dark:border-dark-line uppercase tracking-wider">${category}</span>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-[11px] font-bold text-[#0070af] uppercase mb-1.5">Pergunta</label>
            <textarea placeholder="Digite sua pergunta estratégica..." 
              class="w-full px-3 py-2 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold text-slate-700 dark:text-white min-h-[44px] resize-none overflow-hidden"
              oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
              onchange="updateBriefingQuestion('${id}', 'question', this.value)">${questionText}</textarea>
          </div>
          <div>
            <label class="block text-[11px] font-bold text-[#0070af] uppercase mb-1.5">Resposta</label>
            <textarea placeholder="Insira aqui a resposta ou direcionamento..." 
              class="w-full px-3 py-2 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg text-sm min-h-[100px] focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
              onchange="updateBriefingQuestion('${id}', 'answer', this.value)"></textarea>
          </div>
        </div>
      `;
      container.appendChild(card);
      
      const questionObj = { id, question: questionText, answer: "", category };
      handoffData.briefing.questions.push(questionObj);
      saveToStorage();
      lucide.createIcons();
      
      // Auto-resize the new textarea
      const ta = card.querySelector('textarea');
      if (ta) {
        ta.style.height = '';
        ta.style.height = ta.scrollHeight + 'px';
      }
      autoScrollToNewItem('handoff-scroll-container', card);
    }

    function removeBriefingQuestion(id) {
      const card = document.getElementById(`briefing-card-${id}`);
      if (card) card.remove();
      handoffData.briefing.questions = handoffData.briefing.questions.filter(q => q.id != id);
      
      // Update numbering
      const container = document.getElementById('briefing-questions-container-v2');
      Array.from(container.children).forEach((child, i) => {
        const badge = child.querySelector('.text-\\[\\#0070af\\]');
        if (badge) badge.textContent = `#${i + 1} Pergunta`;
      });
      saveToStorage();
    }

    function updateBriefingQuestion(id, key, value) {
      const question = handoffData.briefing.questions.find(q => q.id == id);
      if (question) question[key] = value;
      saveToStorage();
    }

    function toggleBriefingSection(checked) {
      if (handoffData.briefing) {
        handoffData.briefing.enabled = checked;
      }
      const card = document.getElementById('briefing-card');
      if (card) {
        card.classList.toggle('hidden', !checked);
      }
      // Se habilitado, inicializar as categorias se o container estiver vazio
      if (checked) {
        const container = document.getElementById('briefing-categories-container-v2');
        if (container && container.innerHTML === '') {
          initBriefingSuggestions();
        }
      }
      
      // Controlar FAB dinamicamente
      updateFABVisibility();
      
      saveToStorage();
    }

    // Navigation & Scrolling
    function scrollToStep(stepId) {
      // Hide all steps
      document.querySelectorAll(".step-content").forEach(el => el.classList.add("hidden"));

      // Show target step
      const target = document.getElementById(stepId);
      if (target) target.classList.remove("hidden");

      // Reset scroll position to top
      const container = document.getElementById("handoff-scroll-container");
      if (container) container.scrollTop = 0;

      currentStep = parseInt(stepId.split("-")[1]);
      updateNavigationUI();
      
      const btnTop = document.getElementById('btn-top');
      if (btnTop) {
        btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
        btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
      }
    }

    function updateNavigationUI() {
      // Update select
      const navSelect = document.getElementById("nav-select");
      if (navSelect) navSelect.value = "step-" + currentStep;

      // Update dots
      for (let i = 1; i <= totalSteps; i++) {
        const dot = document.getElementById("dot-" + i);
        if (dot) {
          dot.classList.toggle("bg-[#0070af]", i === currentStep);
          dot.classList.toggle("bg-gray-200", i !== currentStep);
          dot.classList.toggle("dark:bg-dark-surface", i !== currentStep);
          dot.classList.toggle("w-3", i === currentStep);
          dot.classList.toggle("w-1.5", i !== currentStep);
        }
      }
      updateFooterButtons();
      updateFABVisibility();
    }

    function updateFABVisibility(forceHide = false) {
      const activeView = document.querySelector('.view.active');
      const viewId = activeView ? activeView.id : '';
      const isHandoff = viewId === 'view-handoff';
      const isBriefingOn = document.getElementById('toggle-briefing')?.checked;
      
      const fabMeasure = document.getElementById('fab-measure');
      const fabSpec = document.getElementById('fab-spec');
      const fabFlow = document.getElementById('fab-flow');
      const fabBriefing = document.getElementById('fab-handoff-briefing');

      const hideAll = () => {
        if (fabMeasure) fabMeasure.classList.add('hidden');
        if (fabSpec) fabSpec.classList.add('hidden');
        if (fabFlow) fabFlow.classList.add('hidden');
        if (fabBriefing) fabBriefing.classList.add('hidden');
      };

      if (forceHide) {
        hideAll();
        return;
      }

      // Medidas
      if (fabMeasure) fabMeasure.classList.toggle('hidden', viewId !== 'view-measurement');
      
      // Especificações e Fluxos
      if (fabSpec) {
        fabSpec.classList.toggle('hidden', viewId !== 'view-specifications' || currentSpecTab !== 'specs-form');
      }
      if (fabFlow) {
        fabFlow.classList.toggle('hidden', viewId !== 'view-specifications' || currentSpecTab !== 'specs-flow');
      }

      // Handoff FABs — requer Step 1 E briefing ativado
      if (fabBriefing) {
        fabBriefing.classList.toggle('hidden', !isHandoff || currentStep !== 1 || !isBriefingOn);
      }

      if (window.lucide) lucide.createIcons();
    }

    function nextStep() {
      if (currentStep < totalSteps) {
        scrollToStep("step-" + (currentStep + 1));
      }
    }

    function prevStep() {
      if (currentStep > 1) {
        scrollToStep("step-" + (currentStep - 1));
      }
    }

    function updateFooterButtons() {
      const btnBack = document.getElementById("btn-back");
      const btnNext = document.getElementById("btn-next");
      if (!btnBack || !btnNext) return;

      if (currentStep === 1) {
        btnBack.textContent = "Home";
        btnBack.onclick = () => navigate("view-home");
      } else {
        btnBack.textContent = "Voltar";
        btnBack.onclick = () => prevStep();
      }

      if (currentStep === totalSteps) {
        btnNext.classList.add("hidden");
      } else {
        btnNext.classList.remove("hidden");
        btnNext.innerHTML = '<span>Próximo</span> <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>';
        btnNext.classList.remove("bg-green-600");
        btnNext.classList.add("bg-[#0070af]");
        btnNext.onclick = () => nextStep();
      }
      lucide.createIcons();
    }

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

    initBriefingSuggestions();
    
    function saveToStorage() {
      parent.postMessage({ pluginMessage: { type: 'save-storage', data: handoffData } }, '*');
      checkDataPresence();
    }

    function checkDataPresence() {
      const btn = document.getElementById('btn-export-json');
      if (!btn) return;
      const hasBriefing = handoffData.briefing.questions.length > 0;
      const hasStep1 = (handoffData.step1.fluxo && handoffData.step1.fluxo.trim() !== '') || (handoffData.step1.objetivo && handoffData.step1.objetivo.trim() !== '');
      const hasTeam = handoffData.step3.team && handoffData.step3.team.length > 0;
      const hasChecklist = document.querySelectorAll('#list-equipe > div, #list-excecao > div, #list-regras > div, #list-doc > div').length > 0;
      const hasData = hasBriefing || hasStep1 || hasTeam || hasChecklist;
      btn.disabled = !hasData;
    }

    function toggleTheme() {
      document.documentElement.classList.toggle("dark");
      const isDark = document.documentElement.classList.contains("dark");
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      
      // Toggle icons if they exist
      document.querySelectorAll(".sun-icon").forEach(el => el.classList.toggle("hidden", isDark));
      document.querySelectorAll(".moon-icon").forEach(el => el.classList.toggle("hidden", !isDark));
      
      lucide.createIcons();
    }

    // --- IMPORT / EXPORT LOGIC ---
    
    function incrementVersion(v) {
      if (!v) return 'v1.0.1';
      // Basic semantic versioning: vX.Y.Z
      const match = v.match(/v?(\d+)\.(\d+)\.(\d+)/);
      if (!match) {
        // Fallback for non-standard versions
        return v + '.1';
      }
      
      let major = parseInt(match[1]);
      let minor = parseInt(match[2]);
      let patch = parseInt(match[3]);
      
      patch++; 
      return `v${major}.${minor}.${patch}`;
    }

    function exportHandoffData() {
      const dataStr = JSON.stringify(handoffData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const fileName = `handex-backup-${handoffData.step1.fluxo || 'projeto'}-${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', fileName);
      linkElement.click();
    }

    function importHandoffData() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = event => {
          try {
            const importedData = JSON.parse(event.target.result);
            
            // Validate basic structure
            if (!importedData.step1) throw new Error("Formato de JSON inválido para o Handex.");
            
            // Automatic versioning
            const oldVersion = importedData.step1.versao || 'v1.0.0';
            const newVersion = incrementVersion(oldVersion);
            importedData.step1.versao = newVersion;
            
            // Update state
            Object.assign(handoffData, importedData);
            
            // Save and Refresh
            saveToStorage();
            restoreUIFromState();
            
            // Visual feedback
            alert(`Ô£à Dados importados!\nVersão anterior: ${oldVersion}\nVersão atual: ${newVersion}`);
          } catch (err) {
            alert('ÔØî Erro na importação: ' + err.message);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }

    // --- INITIALIZATION ---

    function updateData(step, key, value) {
      if (!handoffData[step]) handoffData[step] = {};
      handoffData[step][key] = value;
      saveToStorage();
    }

    function showToast(message) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      
      const toast = document.createElement('div');
      toast.className = 'bg-slate-800 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-2';
      toast.innerHTML = `<i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-green-400"></i> ${message}`;
      
      container.appendChild(toast);
      if (window.lucide) lucide.createIcons();
      
      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    function toggleBriefingSuggestions() {
      // This function is now deprecated in favor of toggleCategory, but kept for compatibility if needed elsewhere
    }



    function openModal(id) {
      document.getElementById(id).classList.remove("hidden");
      updateFABVisibility(true);
    }

    function closeModal(id) {
      document.getElementById(id).classList.add("hidden");
      updateFABVisibility(false);
    }

    function startHandoff() {
      currentStep = 1;
      navigate("view-handoff");
      scrollToStep("step-1");
    }

    function navigate(viewId) {
      document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
      const targetView = document.getElementById(viewId);
      if (targetView) targetView.classList.add("active");

      // Reset scroll positions and back-to-top button
      const containers = document.querySelectorAll('.overflow-y-auto');
      containers.forEach(c => c.scrollTop = 0);
      
      const btnTop = document.getElementById('btn-top');
      if (btnTop) {
        btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
        btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
      }

      const isHandoff = viewId === "view-handoff";
      document.getElementById("footer-handoff").classList.toggle("hidden", !isHandoff);
      document.getElementById("footer-signature").classList.toggle("hidden", isHandoff);

      // Header Switch - Now simplified to always keep home header visible
      document.getElementById("header-home").classList.remove("hidden");

      if (isHandoff) updateFooterButtons();
      if (viewId === 'view-specifications') {
        if (currentSpecTab === 'specs-form') renderSpecsList();
        else renderFlowsList();
      }
      if (viewId === 'view-measurement') renderMeasurementsResults(lastMeasurements);
      
      updateFABVisibility();
    }

    // Step 3: Category-based Checklist Logic
    function addChecklistItem(category, label, icon, color) {
      const list = document.getElementById(`list-${category}`);
      const id = `${category}-${Date.now()}`;

      const item = document.createElement('div');
      item.id = `item-${id}`;
      item.className = "p-3 bg-gray-50/50 dark:bg-dark-bg/30 border border-gray-100 dark:border-dark-line rounded-lg animate-in slide-in-from-top-2 duration-200";

      let fields = '';
      if (category === 'excecao') {
        fields = `
          <div class="space-y-2">
            <!-- Title & Vincular Row -->
            <div class="flex gap-2">
              <input type="text" id="title-${id}" placeholder="Título da exceção" class="flex-1 px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none font-bold" onchange="updateData('step3', '${id}_title', this.value)">
              <button onclick="linkCurrentSelection('${id}')" data-tooltip="Importar nome do frame ou projeto" class="tooltip-left px-3 py-1.5 bg-blue-50 text-[#0070af] rounded-lg text-[10px] font-bold hover:bg-blue-100 transition-all flex items-center gap-1.5">
                <i data-lucide="target" class="w-3 h-3"></i> Vincular
              </button>
            </div>
            
            <!-- Link Row -->
            <div class="relative">
              <i data-lucide="link" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400"></i>
              <input type="text" id="link-${id}" placeholder="Figma URL..." class="w-full pl-7 pr-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none" 
                onchange="updateData('step3', '${id}_link', this.value)"
                onblur="validateUrl(this)">
            </div>

            <!-- Notes Toggle -->
            <label class="flex items-center gap-2 cursor-pointer pt-1">
              <input type="checkbox" class="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500" onchange="document.getElementById('notes-container-${id}').classList.toggle('hidden', !this.checked)">
              <span class="text-[10px] font-bold text-gray-400 uppercase">Adicionar observações</span>
            </label>

            <div id="notes-container-${id}" class="hidden animate-in slide-in-from-top-1">
              <textarea placeholder="Ex: Jornada 1, cenários específicos..." class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none resize-none" rows="2" onchange="updateData('step3', '${id}_notes', this.value)"></textarea>
            </div>
          </div>
        `;
      } else if (category === 'regras') {
        fields = `
          <div class="space-y-2">
            <input type="text" id="title-${id}" placeholder="Título da Regra/HU" class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none font-bold" 
              onchange="updateData('step3', '${id}_title', this.value)">
            
            <div class="relative">
              <i data-lucide="link" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400"></i>
              <input type="text" id="link-${id}" placeholder="Link da HU/Regra (Jira/Docs)" class="w-full pl-7 pr-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none" 
                onchange="updateData('step3', '${id}_link', this.value)"
                onblur="validateUrl(this)">
            </div>
            
            <textarea placeholder="Descrição ou regras detalhadas..." class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none resize-none" rows="2" 
              onchange="updateData('step3', '${id}_notes', this.value)"></textarea>
          </div>
        `;
      }

      item.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <i data-lucide="${icon}" class="w-3.5 h-3.5 text-${color}-500"></i>
            <span class="text-[12px] font-bold text-slate-700 dark:text-white">${label}</span>
          </div>
          <button onclick="removeChecklistItem('${id}', '${category}')" title="Remover" aria-label="Remover item" class="text-gray-300 hover:text-red-500 transition-colors">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </button>
        </div>
        ${fields}
      `;

      if (category === 'excecao') {
        updateData('step3', `${id}_type`, label);
      }

      list.appendChild(item);
      lucide.createIcons();
      updateCategoryCount(category);
      autoScrollToNewItem('handoff-scroll-container', item);
    }

    function removeChecklistItem(id, category) {
      const el = document.getElementById(`item-${id}`);
      if (el) el.remove();
      updateCategoryCount(category);
    }

    function updateCategoryCount(category) {
      const list = document.getElementById(`list-${category}`);
      const countEl = document.getElementById(`count-${category}`);
      if (list && countEl) {
        countEl.textContent = `${list.children.length} itens`;
      }
      updateStatesMotionSummary();
    }

    function updateStatesMotionSummary() {
      const stateCount = document.querySelectorAll('#list-states > div').length;
      const motionCount = document.querySelectorAll('#list-motion > div').length;
      const stateEl = document.getElementById('count-states');
      const motionEl = document.getElementById('count-motion');
      const summaryEl = document.getElementById('count-states-motion');
      if (stateEl) stateEl.textContent = `${stateCount} itens`;
      if (motionEl) motionEl.textContent = `${motionCount} itens`;
      if (summaryEl) summaryEl.textContent = `${stateCount} estado${stateCount === 1 ? '' : 's'} · ${motionCount} transi${motionCount === 1 ? 'ção' : 'ções'}`;
    }

    // ─── Estados Interativos ───────────────────────────────────
    function addStateItem(stateLabel, icon, color) {
      const list = document.getElementById('list-states');
      if (!list) return;
      const id = `state-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const item = document.createElement('div');
      item.id = `item-${id}`;
      item.className = "p-3 bg-gray-50/50 dark:bg-dark-bg/30 border border-gray-100 dark:border-dark-line rounded-lg animate-in slide-in-from-top-2 duration-200";
      item.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <i data-lucide="${icon}" class="w-3.5 h-3.5 text-${color}-500"></i>
            <span class="text-[12px] font-bold text-slate-700 dark:text-white">${stateLabel}</span>
          </div>
          <button onclick="removeStateItem('${id}')" title="Remover" class="text-gray-300 hover:text-red-500 transition-colors">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </button>
        </div>
        <div class="space-y-2">
          <input type="text" placeholder="Componente (ex: Button/Primary, Input, Card)"
            class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none font-bold"
            onchange="updateData('step3', '${id}_target', this.value)">
          <textarea rows="2" placeholder="Comportamento visual (ex: opacidade 0.8, sombra, fundo claro...)"
            class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none resize-none"
            onchange="updateData('step3', '${id}_description', this.value)"></textarea>
          <div class="relative">
            <i data-lucide="link" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400"></i>
            <input type="text" placeholder="Link Figma do estado (opcional)"
              class="w-full pl-7 pr-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none"
              onchange="updateData('step3', '${id}_link', this.value)"
              onblur="validateUrl(this)">
          </div>
        </div>
      `;
      updateData('step3', `${id}_state`, stateLabel);
      updateData('step3', `${id}_icon`, icon);
      updateData('step3', `${id}_color`, color);
      list.appendChild(item);
      if (typeof lucide !== 'undefined') lucide.createIcons();
      updateStatesMotionSummary();
      autoScrollToNewItem('handoff-scroll-container', item);
    }

    function removeStateItem(id) {
      const el = document.getElementById(`item-${id}`);
      if (el) el.remove();
      ['_target', '_description', '_link', '_state', '_icon', '_color'].forEach(k => {
        delete handoffData.step3[id + k];
      });
      saveToStorage();
      updateStatesMotionSummary();
    }

    // ─── Motion / Transições ───────────────────────────────────
    function addMotionItem() {
      const list = document.getElementById('list-motion');
      if (!list) return;
      const id = `motion-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const item = document.createElement('div');
      item.id = `item-${id}`;
      item.className = "p-3 bg-gray-50/50 dark:bg-dark-bg/30 border border-gray-100 dark:border-dark-line rounded-lg animate-in slide-in-from-top-2 duration-200";
      item.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <i data-lucide="zap" class="w-3.5 h-3.5 text-pink-500"></i>
            <span class="text-[12px] font-bold text-slate-700 dark:text-white">Transição</span>
          </div>
          <button onclick="removeMotionItem('${id}')" title="Remover" class="text-gray-300 hover:text-red-500 transition-colors">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <input type="text" placeholder="Componente / Escopo"
            class="col-span-2 px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none font-bold"
            onchange="updateData('step3', '${id}_target', this.value)">

          <select class="px-2 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none cursor-pointer"
            onchange="updateData('step3', '${id}_property', this.value)">
            <option value="">Propriedade animada</option>
            <option>opacity</option>
            <option>transform</option>
            <option>color</option>
            <option>background-color</option>
            <option>border-color</option>
            <option>box-shadow</option>
            <option>width</option>
            <option>height</option>
            <option>all</option>
          </select>

          <select class="px-2 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none cursor-pointer"
            onchange="updateData('step3', '${id}_trigger', this.value)">
            <option value="">Gatilho</option>
            <option>hover</option>
            <option>focus</option>
            <option>click</option>
            <option>mount</option>
            <option>route-change</option>
            <option>scroll</option>
          </select>

          <div class="relative">
            <input type="number" min="0" placeholder="Duração (ms)"
              class="w-full px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none"
              onchange="updateData('step3', '${id}_duration', this.value)">
          </div>

          <select class="px-2 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none cursor-pointer"
            onchange="updateData('step3', '${id}_easing', this.value)">
            <option value="">Easing</option>
            <option value="linear">linear</option>
            <option value="ease">ease</option>
            <option value="ease-in">ease-in</option>
            <option value="ease-out">ease-out</option>
            <option value="ease-in-out">ease-in-out</option>
            <option value="cubic-bezier(0.4, 0, 0.2, 1)">cubic-bezier(0.4, 0, 0.2, 1) (Material)</option>
            <option value="cubic-bezier(0.16, 1, 0.3, 1)">cubic-bezier(0.16, 1, 0.3, 1) (Spring)</option>
          </select>
        </div>
        <textarea rows="2" placeholder="Notas adicionais (opcional)"
          class="w-full mt-2 px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none resize-none"
          onchange="updateData('step3', '${id}_notes', this.value)"></textarea>
      `;
      list.appendChild(item);
      if (typeof lucide !== 'undefined') lucide.createIcons();
      updateStatesMotionSummary();
      autoScrollToNewItem('handoff-scroll-container', item);
    }

    function removeMotionItem(id) {
      const el = document.getElementById(`item-${id}`);
      if (el) el.remove();
      ['_target', '_property', '_trigger', '_duration', '_easing', '_notes'].forEach(k => {
        delete handoffData.step3[id + k];
      });
      saveToStorage();
      updateStatesMotionSummary();
    }

    // Step 3: File Handling

    function linkCurrentSelection(id) {
      parent.postMessage({ pluginMessage: { type: 'get-selection-link', targetId: id } }, '*');
    }

    function importTitleFromSelection() {
      parent.postMessage({ pluginMessage: { type: 'get-selection-name' } }, '*');
    }

    function addTeamMember(role = "Designer", name = "", email = "") {
      const list = document.getElementById("list-equipe");
      const id = "team-" + Date.now() + Math.floor(Math.random() * 1000);

      const item = document.createElement("div");
      item.id = "item-" + id;
      item.className = "p-3 bg-gray-50/50 dark:bg-dark-bg/30 border border-gray-100 dark:border-dark-line rounded-lg animate-in slide-in-from-top-2 duration-200";

      item.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <select id="role-${id}" class="px-2 py-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded text-[11px] font-bold text-slate-700 dark:text-white outline-none cursor-pointer">
            <option value="Designer" ${role === "Designer" ? "selected" : ""}>Designer</option>
            <option value="DEV" ${role === "DEV" ? "selected" : ""}>DEV</option>
            <option value="PO" ${role === "PO" ? "selected" : ""}>PO</option>
            <option value="QA" ${role === "QA" ? "selected" : ""}>QA</option>
            <option value="Outro" ${role === "Outro" ? "selected" : ""}>Outro</option>
          </select>
          <button onclick="removeTeamMember('${id}')" title="Remover membro" aria-label="Remover membro" class="text-gray-300 hover:text-red-500 transition-colors">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <input type="text" id="name-${id}" placeholder="Nome" value="${name}" class="flex-1 min-w-0 px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none" onchange="saveToStorage()">
          <input type="email" id="email-${id}" placeholder="E-mail" value="${email}" class="flex-1 min-w-0 px-3 py-1.5 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg text-[11px] outline-none" 
            onchange="saveToStorage()"
            onblur="validateEmail(this)">
        </div>
      `;

      list.appendChild(item);
      lucide.createIcons();
    }

    function removeTeamMember(id) {
      const item = document.getElementById("item-" + id);
      if (item) item.remove();
    }

    function toggleAccordion(btn, nodeId = null) {
      let content = btn.nextElementSibling;
      if (!content || content.tagName === 'BUTTON' || content.hasAttribute('data-accordion-toggle')) {
        const parent = btn.closest('.border, .rounded-xl, .mb-3');
        content = parent ? parent.querySelector('.accordion-content, [data-accordion-content]') : null;
      }
      if (!content) return;

      const icon = btn.querySelector('[data-lucide="chevron-down"]');
      const isHidden = content.classList.contains("hidden");
      
      content.classList.toggle("hidden");
      
      // WCAG: Update aria-expanded
      btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      
      if (icon) {
        icon.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
      }

      if (nodeId) focusNode(nodeId);
    }

    // Navigation & Scrolling


    function updateNavigationUI() {
      // Update select
      const navSelect = document.getElementById("nav-select");
      if (navSelect) navSelect.value = "step-" + currentStep;

      // Update dots
      for (let i = 0; i <= totalSteps; i++) {
        const dot = document.getElementById("dot-" + i);
        if (dot) {
          dot.classList.toggle("bg-[#0070af]", i === currentStep);
          dot.classList.toggle("bg-gray-200", i !== currentStep);
          dot.classList.toggle("dark:bg-dark-surface", i !== currentStep);
          dot.classList.toggle("w-3", i === currentStep);
          dot.classList.toggle("w-1.5", i !== currentStep);
        }
      }
      updateFooterButtons();
      
      // Controlar FABs do Handoff baseados no Step
      const fabBriefing = document.getElementById('fab-handoff-briefing');
      const activeView = document.querySelector('.view.active');
      const isHandoff = activeView && activeView.id === 'view-handoff';
      const isBriefingOn2 = document.getElementById('toggle-briefing')?.checked;

      if (fabBriefing) fabBriefing.classList.toggle('hidden', !isHandoff || currentStep !== 1 || !isBriefingOn2);
      
      lucide.createIcons();
    }



    // Scroll Handlers moved to the end of script for consolidation

    // Step 1: File Handling
    function handleFiles(input) {
      const files = Array.from(input.files);
      files.forEach(file => {
        if (!handoffData.step1.files.includes(file.name)) {
          handoffData.step1.files.push(file.name);
          const reader = new FileReader();
          reader.onload = e => { window.uploadedFiles[file.name] = e.target.result; };
          reader.readAsArrayBuffer(file);
          addFileToUI(file.name);
        }
      });
      input.value = "";
    }

    function handleChecklistFile(input) {
      const files = Array.from(input.files);
      files.forEach(file => {
        if (!handoffData.step1.files.includes(file.name)) {
          handoffData.step1.files.push(file.name);
          const reader = new FileReader();
          reader.onload = e => { window.uploadedFiles[file.name] = e.target.result; };
          reader.readAsArrayBuffer(file);

          const list = document.getElementById("checklist-file-list");
          if (list) {
            const item = document.createElement("div");
            item.className = "flex items-center gap-2 px-3 py-2 bg-white dark:bg-dark-bg border border-gray-100 dark:border-dark-line rounded-lg text-[11px] group";
            item.innerHTML = `
              <i data-lucide="file" class="w-3.5 h-3.5 text-blue-500"></i>
              <span class="flex-1 truncate font-medium text-slate-700 dark:text-dark-text">${file.name}</span>
              <button onclick="removeFile('${file.name}', this)" title="Remover anexo" aria-label="Remover anexo" class="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            `;
            list.appendChild(item);
            lucide.createIcons();
          }
          addFileToUI(file.name); // Keeps them synced in both views
        }
      });
      input.value = "";
    }

    function addFileToUI(fileName) {
      const list = document.getElementById("file-list");
      const item = document.createElement("div");
      item.className = "flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-dark-surface rounded-full border border-gray-100 dark:border-dark-line text-[11px] animate-in zoom-in duration-200";
      item.innerHTML = `
        <i data-lucide="file" class="w-3 h-3 text-[#0070af]"></i>
        <span class="max-w-[100px] truncate text-slate-600 dark:text-dark-text">${fileName}</span>
        <button onclick="removeFile('${fileName}', this)" title="Remover" aria-label="Remover arquivo" class="text-gray-400 hover:text-red-500 transition-colors">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      `;
      list.appendChild(item);
      lucide.createIcons();
    }

    function removeFile(name, btn) {
      handoffData.step1.files = handoffData.step1.files.filter(f => f !== name);
      delete window.uploadedFiles[name];
      btn.closest("div").remove();
    }


    // Step 2: Scanning & Specs
    let auditExtractInProgress = false;
    let auditCacheRequested = false;

    function toggleAuditSection(checked) {
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

    function startAuditExtraction() {
      if (auditExtractInProgress) return;
      const skeleton = (typeof window !== 'undefined') ? window.__HANDEX_REF_SKELETON__ : null;
      if (!skeleton || !Array.isArray(skeleton.libraries) || skeleton.libraries.length === 0) {
        renderAuditStatus('unavailable', { message: 'Bundle de referência não embarcado na build. Rode npm run bundle:ui.' });
        return;
      }
      auditExtractInProgress = true;
      const totalStyles = skeleton.libraries.reduce((acc, lib) => {
        const s = lib.styleTokens || {};
        return acc + ((s.colors && s.colors.length) || 0) + ((s.typography && s.typography.length) || 0) + ((s.effects && s.effects.length) || 0);
      }, 0);
      renderAuditStatus('extracting', { processed: 0, total: totalStyles, libName: '', libCount: skeleton.libraries.length });
      parent.postMessage({ pluginMessage: { type: 'extract-design-refs', skeleton } }, '*');
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

    function validateUrl(input) {
      if (!input || !input.value) return;
      const val = input.value.trim();
      if (!val) return;
      
      try {
        new URL(val);
        input.classList.remove('border-red-500', 'ring-2', 'ring-red-100');
        input.classList.add('border-green-500');
        setTimeout(() => input.classList.remove('border-green-500'), 2000);
      } catch (e) {
        input.classList.add('border-red-500', 'ring-2', 'ring-red-100');
        showToast("URL inválida. Certifique-se de incluir http:// ou https://", "error");
      }
    }

    function validateEmail(input) {
      if (!input || !input.value) return;
      const val = input.value.trim();
      // Basic email regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (emailRegex.test(val)) {
        input.classList.remove('border-red-500', 'ring-2', 'ring-red-100');
        input.classList.add('border-green-500');
        setTimeout(() => input.classList.remove('border-green-500'), 2000);
      } else {
        input.classList.add('border-red-500', 'ring-2', 'ring-red-100');
        showToast("E-mail inválido.", "error");
      }
    }

    function scanFrame(categories = null) {
      const refs = handoffData.step2.auditReferences || [];
      if (handoffData.step2.isAuditEnabled && refs.length === 0) {
        showToast("Carregue ao menos um arquivo JSON de referência antes de escanear com auditoria.", "error");
        const content = document.getElementById('audit-card-content');
        if (content && content.classList.contains('hidden')) content.classList.remove('hidden');
        return;
      }

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



    function renderMeasurementsResults(data) {
      const container = document.getElementById("measurements-results");
      if (!container) return;
      container.innerHTML = "";
      
      const hint = document.getElementById('hint-measures');
      if (hint) {
        if (data && data.length > 0) hint.classList.add('hidden');
        else hint.classList.remove('hidden');
      }

      const exportBtn = document.getElementById('btn-export-measures');
      const hideAllBtn = document.getElementById('btn-hide-all-measures');
      if (data && data.length > 0) {
        if (exportBtn) exportBtn.classList.remove('hidden');
        if (hideAllBtn) hideAllBtn.classList.remove('hidden');
      } else {
        if (exportBtn) exportBtn.classList.add('hidden');
        if (hideAllBtn) hideAllBtn.classList.add('hidden');
      }

      if (!data || data.length === 0) {
        container.innerHTML = `
          <div class="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500">
            <div class="relative mb-4">
              <i data-lucide="ruler" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
            </div>
            <p class="text-[12px] font-bold text-slate-400 dark:text-slate-500 text-center px-4 mb-1">Nenhuma medida criada ainda</p>
            <p class="text-[10px] text-slate-300 dark:text-slate-600 text-center px-6">Selecione elementos no canvas e toque no botão <strong>+</strong></p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      if (!data || data.length === 0) return;

      data.forEach((item, index) => {
        const section = document.createElement("div");
        section.className = "border border-gray-200 dark:border-dark-line rounded-xl overflow-hidden bg-white dark:bg-dark-surface shadow-sm";
        if (item.nodeId) {
          section.setAttribute('data-node-id', item.nodeId);
        }

        const isExpanded = index === 0;
        const header = document.createElement("div");
        header.className = "flex items-center w-full bg-gray-50 dark:bg-slate-800";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "flex-1 flex items-center gap-3 px-3 py-3 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left";
        btn.setAttribute('data-accordion-toggle', '');
        btn.onclick = () => toggleAccordion(btn, item.nodeId, item.number || (index + 1));

        const chevronClass = isExpanded ? "rotate-180" : "";
        btn.innerHTML = `
          <div class="w-5 h-5 flex items-center justify-center bg-[#005ca9] text-white text-[10px] font-bold rounded-full shrink-0">${item.number || (index + 1)}</div>
          <div class="flex-1 min-w-0 text-left">
            <span class="text-[12px] font-bold text-[#1E293B] dark:text-white truncate block" title="${item.name}">${item.name}</span>
          </div>
          <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400 transition-transform ${chevronClass} shrink-0"></i>
        `;

        // Visibility Toggle
        const visBtn = document.createElement("button");
        visBtn.type = "button";
        visBtn.title = "Exibir/Ocultar no canvas";
        visBtn.ariaLabel = "Ocultar medida";
        visBtn.className = "px-3 py-3 hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors shrink-0 border-l border-gray-100 dark:border-dark-line";
        visBtn.setAttribute('data-vis-btn', '');

        if (item.visible === undefined) {
          item.visible = true;
        }

        const isVisible = item.visible !== false;
        visBtn.innerHTML = isVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
        visBtn.classList.toggle("text-[#005ca9]", isVisible);
        visBtn.classList.toggle("text-gray-300", !isVisible);

        visBtn.onclick = (e) => {
          e.stopPropagation();
          const nowVisible = !(item.visible !== false);
          item.visible = nowVisible;
          
          visBtn.innerHTML = nowVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
          visBtn.classList.toggle("text-[#005ca9]", nowVisible);
          visBtn.classList.toggle("text-gray-300", !nowVisible);
          
          if (item.nodeId) {
            parent.postMessage({ pluginMessage: { type: 'hide-node', id: item.nodeId, forceState: nowVisible } }, '*');
          }
          saveToStorage();
          if (typeof lucide !== 'undefined') lucide.createIcons();
          updateHideAllMeasuresButtonState();
        };

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.title = "Remover medida";
        delBtn.ariaLabel = "Remover medida";
        delBtn.className = "px-3 py-3 text-gray-400 hover:text-red-500 transition-colors shrink-0 border-l border-gray-100 dark:border-dark-line";
        delBtn.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4"></i>`;
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (item.nodeId) {
            parent.postMessage({ pluginMessage: { type: 'delete-node', id: item.nodeId } }, '*');
          }
          handoffData.measurements = (handoffData.measurements || []).filter(m => m.nodeId !== item.nodeId);
          lastMeasurements = handoffData.measurements;
          saveToStorage();
          section.remove();
          
          // Verifica se a lista ficou vazia para mostrar o hint novamente
          const remaining = container.querySelectorAll('.border.rounded-xl.overflow-hidden').length;
          if (remaining === 0) {
            const h = document.getElementById('hint-measures');
            if (h) h.classList.remove('hidden');
            const ex = document.getElementById('btn-export-measures');
            if (ex) ex.classList.add('hidden');
          }
        };

        header.appendChild(btn);
        header.appendChild(visBtn);
        header.appendChild(delBtn);

        const content = document.createElement("div");
        content.setAttribute('data-accordion-content', '');
        content.className = `px-3 py-3 bg-white dark:bg-dark-surface space-y-2 border-t border-gray-100 dark:border-dark-line ${isExpanded ? '' : 'hidden'}`;

        item.details.forEach(det => {
          const detEl = document.createElement("div");
          detEl.className = "text-[11px] text-slate-600 dark:text-dark-text bg-gray-50 dark:bg-dark-bg p-2 rounded-lg border border-gray-100 dark:border-dark-line font-mono";
          detEl.innerText = det;
          content.appendChild(detEl);
        });

        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);
      });
      lucide.createIcons();
      const currentCount = (data || []).length;
      if (currentCount > (lastMeasurements ? lastMeasurements.length : 0)) {
        autoScrollToNewItem('measures-scroll-container');
      }
      lastMeasurements = data;
      updateHideAllMeasuresButtonState();
    }


    // ── Ocultar Tudo helpers ───────────────────────────────────────
    let _measuresHidden = false;
    function updateHideAllMeasuresButtonState() {
      const btn = document.getElementById('btn-hide-all-measures');
      if (!btn) return;
      
      const measurements = handoffData.measurements || [];
      if (measurements.length === 0) return;
      
      const allHidden = measurements.every(m => m.visible === false);
      _measuresHidden = allHidden;
      
      btn.innerHTML = allHidden
        ? '<i data-lucide="eye" class="w-3.5 h-3.5"></i> Mostrar tudo'
        : '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i> Ocultar tudo';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function toggleAllMeasuresVisibility() {
      const measurements = handoffData.measurements || [];
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
      
      const container = document.getElementById('measurements-results');
      if (container) {
        const sections = container.querySelectorAll('[data-node-id]');
        sections.forEach(section => {
          const visBtn = section.querySelector('[data-vis-btn]');
          if (visBtn) {
            visBtn.innerHTML = targetState ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
            visBtn.classList.toggle("text-[#005ca9]", targetState);
            visBtn.classList.toggle("text-gray-300", !targetState);
          }
        });
      }
      
      const btn = document.getElementById('btn-hide-all-measures');
      if (btn) {
        btn.innerHTML = _measuresHidden
          ? '<i data-lucide="eye" class="w-3.5 h-3.5"></i> Mostrar tudo'
          : '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i> Ocultar tudo';
      }
      
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    let _specsHidden = false;
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

      // Use the calculated componentStatus (now derived from match-rate thresholds)
      const status = item.componentStatus || (item.isDS === true ? "ok" : (item.isDS === "warning" ? "warning" : "error"));

      const dsStatus = handoffData.step2.isAuditEnabled ? (status === "ok" ?
        `<span class="flex items-center gap-1 text-[#10b981]"><i data-lucide="check-circle" class="w-2.5 h-2.5"></i>EM CONFORMIDADE</span>` :
        (status === "warning" ?
          `<span class="flex items-center gap-1 text-amber-500 font-bold"><i data-lucide="help-circle" class="w-2.5 h-2.5"></i>NECESSITA REVISÃO</span>` :
          `<span class="flex items-center gap-1 text-red-400 font-bold"><i data-lucide="alert-circle" class="w-2.5 h-2.5"></i>FORA DO PADRÃO</span>`)) : "";

      let propsHtml = "";
      if (item.properties && item.properties.length > 0) {
        propsHtml = `<div class="mt-2 space-y-1 border-t border-gray-100 dark:border-dark-line pt-2">`;
        item.properties.forEach(p => {
           const pStatus = handoffData.step2.isAuditEnabled ? 
             (p.isDS === true ? `<span class="text-[#10b981]"><i data-lucide="check" class="w-3 h-3"></i></span>` : 
              (p.isDS === "warning" ? `<span class="text-amber-500"><i data-lucide="alert-triangle" class="w-3 h-3"></i></span>` : 
               `<span class="text-red-400"><i data-lucide="x" class="w-3 h-3"></i></span>`)) : "";
           
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
             `<div class="w-3 h-3 rounded-full border border-gray-200 inline-block align-middle" style="background-color: ${p.value}"></div>` : 
             `<i data-lucide="${icon}" class="w-3 h-3 text-gray-300"></i>`;

           propsHtml += `<div class="flex items-center justify-between text-[9px] text-gray-500 dark:text-gray-400">
             <div class="flex items-center gap-1.5 truncate" title="${p.name}">
               <div class="w-3 h-3 flex items-center justify-center">${colorPrev}</div>
               <span class="truncate">${p.label || p.type}: <span class="font-bold text-slate-600 dark:text-gray-300">${p.value}</span></span>
             </div>
             ${pStatus}
           </div>`;
        });
        propsHtml += `</div>`;
      }

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
          ${propsHtml}
        </div>
      `;
    }

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

    function bytesToBase64(bytes) {
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
      return window.btoa(binary);
    }

    function collectHandoffData() {
      const s1Fluxo = document.getElementById("s1-fluxo");
      handoffData.step1.fluxo = s1Fluxo ? s1Fluxo.value : "";
      const s1Status = document.getElementById("s1-status");
      handoffData.step1.status = s1Status ? s1Status.value : "";
      const s1Objetivo = document.getElementById("s1-objetivo");
      handoffData.step1.objetivo = s1Objetivo ? s1Objetivo.value : "";
      const s1Gerente = document.getElementById("s1-gerente");
      handoffData.step1.gerente = s1Gerente ? s1Gerente.value : "";
      const s1Versao = document.getElementById("s1-versao");
      handoffData.step1.versao = s1Versao ? s1Versao.value : "v2.0.0";

      handoffData.setup = {
        ficha: document.getElementById('chk-ficha') ? document.getElementById('chk-ficha').checked : true,
        espacamentos: document.getElementById('chk-espacamentos') ? document.getElementById('chk-espacamentos').checked : true,
        anatomia: document.getElementById('chk-anatomia') ? document.getElementById('chk-anatomia').checked : true,
        instancias: document.getElementById('chk-instancias') ? document.getElementById('chk-instancias').checked : true,
        componentes: document.getElementById('chk-componentes') ? document.getElementById('chk-componentes').checked : true
      };

      handoffData.step3.team = [];
      document.querySelectorAll("#list-equipe > div").forEach(item => {
        const id = item.id.replace("item-", "");
        handoffData.step3.team.push({
          role: document.getElementById(`role-${id}`).value,
          name: document.getElementById(`name-${id}`).value,
          email: document.getElementById(`email-${id}`).value
        });
      });

      const excecoes = [];
      const regras = [];
      const seenIds = new Set();
      Object.keys(handoffData.step3).forEach(key => {
        const m = key.match(/^(excecao-\d+|regras-\d+)_/);
        if (!m) return;
        const id = m[1];
        if (seenIds.has(id)) return;
        seenIds.add(id);

        if (id.startsWith("excecao-")) {
          excecoes.push({
            title: handoffData.step3[`${id}_title`] || "Sem título",
            link: handoffData.step3[`${id}_link`] || "",
            notes: handoffData.step3[`${id}_notes`] || "",
            type: handoffData.step3[`${id}_type`] || "Geral"
          });
        } else if (id.startsWith("regras-")) {
          regras.push({
            title: handoffData.step3[`${id}_title`] || "Regra de Negócio",
            link: handoffData.step3[`${id}_link`] || "",
            notes: handoffData.step3[`${id}_notes`] || ""
          });
        }
      });

      handoffData.excecoes = excecoes;
      handoffData.regras = regras;

      // Collect interactive states & motion (Estados & Motion accordion)
      const states = [];
      const motion = [];
      const stateSeen = new Set();
      const motionSeen = new Set();
      Object.keys(handoffData.step3).forEach(key => {
        const sMatch = key.match(/^(state-\d+(?:-\d+)?)_/);
        if (sMatch && !stateSeen.has(sMatch[1])) {
          stateSeen.add(sMatch[1]);
          const id = sMatch[1];
          states.push({
            id,
            state: handoffData.step3[`${id}_state`] || 'Estado',
            icon: handoffData.step3[`${id}_icon`] || 'circle',
            color: handoffData.step3[`${id}_color`] || 'slate',
            target: handoffData.step3[`${id}_target`] || '',
            description: handoffData.step3[`${id}_description`] || '',
            link: handoffData.step3[`${id}_link`] || ''
          });
        }
        const mMatch = key.match(/^(motion-\d+(?:-\d+)?)_/);
        if (mMatch && !motionSeen.has(mMatch[1])) {
          motionSeen.add(mMatch[1]);
          const id = mMatch[1];
          motion.push({
            id,
            target: handoffData.step3[`${id}_target`] || '',
            property: handoffData.step3[`${id}_property`] || '',
            trigger: handoffData.step3[`${id}_trigger`] || '',
            duration: handoffData.step3[`${id}_duration`] || '',
            easing: handoffData.step3[`${id}_easing`] || '',
            notes: handoffData.step3[`${id}_notes`] || ''
          });
        }
      });
      handoffData.states = states;
      handoffData.motion = motion;

      // Collect docs link visibility (checkbox state + link value)
      handoffData.docs = {
        proto: { checked: !!(document.querySelector('#proto-field') && !document.querySelector('#proto-field').classList.contains('hidden') && handoffData.step3.proto_link), link: handoffData.step3.proto_link || '' },
        a11y: { checked: !!(document.querySelector('#a11y-field') && !document.querySelector('#a11y-field').classList.contains('hidden') && handoffData.step3.a11y_link), link: handoffData.step3.a11y_link || '' },
        research: { checked: !!(document.querySelector('#research-field') && !document.querySelector('#research-field').classList.contains('hidden') && handoffData.step3.research_link), link: handoffData.step3.research_link || '' },
      };

      let briefingMD = "## Briefing Estratégico\n";
      if (handoffData.briefing && handoffData.briefing.questions && handoffData.briefing.questions.length > 0) {
        handoffData.briefing.questions.forEach((q, i) => {
          briefingMD += `- **#${i+1} [${q.category || "Customizada"}] ${q.question}**: ${q.answer}\n`;
        });
      } else {
        briefingMD += "Nenhum briefing cadastrado.\n";
      }

      const mdContent = `# HANDOFF: ${handoffData.step1.fluxo}

${briefingMD}

## Informações Obrigatórias
- **Título do Fluxo:** ${handoffData.step1.fluxo}
- **Status:** ${handoffData.step1.status}
- **Versão do Documento:** ${handoffData.step1.versao}
- **Designer Responsável:** ${handoffData.step1.gerente}
- **Objetivo da entrega:**
${handoffData.step1.objetivo}

## Equipe e Responsáveis
${handoffData.step3.team.length === 0 ? "Nenhum membro" : handoffData.step3.team.map(m => `- **${m.role}**: ${m.name} (${m.email})`).join('\n')}

## Cenários de Exceção
${excecoes.length === 0 ? "Nenhum cenário cadastrado." : excecoes.map(e => `- [${e.title}](${e.link}): ${e.notes}`).join('\n')}

## Regras de Negócio e HUs
${regras.length === 0 ? "Nenhuma regra cadastrada." : regras.map(r => `- [Regra](${r.link}): ${r.notes}`).join('\n')}

## Documentação Adicional
- **Protótipo:** ${handoffData.step3.proto_link || "N/A"}
- **Acessibilidade:** ${handoffData.step3.a11y_link || "N/A"}
- **UX Research:** ${handoffData.step3.research_link || "N/A"}
`;
      handoffData.mdContent = mdContent;
    }

    function exportHandoff() {
      const btn = document.getElementById("btn-final-export");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span>Exportando...</span>';
      }
      lucide.createIcons();

      collectHandoffData();

      const s1Versao = document.getElementById("s1-versao");
      if (s1Versao) {
        const newV = incrementVersion(s1Versao.value);
        s1Versao.value = newV;
        handoffData.step1.versao = newV;
      }

      const g = id => document.getElementById(id);
      handoffData.setup = {
        incluirBriefing: g("setup-briefing") ? g("setup-briefing").checked : true,
        ficha: g("setup-ficha") ? g("setup-ficha").checked : true,
        componentes: g("setup-specs") ? g("setup-specs").checked : true,
        checklist: g("setup-checklist") ? g("setup-checklist").checked : true
      };

      const mdContent = handoffData.mdContent;

      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text("Handoff: " + handoffData.step1.fluxo, 10, 20);
        doc.setFontSize(10);

        const pdfLines = doc.splitTextToSize(mdContent, 180);
        doc.text(pdfLines, 10, 30);

        const pdfBlob = doc.output('blob');

        const zip = new JSZip();
        const rawName = handoffData.step1.fluxo || "handoff";
        const safeName = rawName.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");

        const visualizerHTML = getInteractiveHTMLContent();
        zip.file(`${safeName}.html`, visualizerHTML);

        const documentosFolder = zip.folder("Documentos");
        documentosFolder.file(safeName + ".md", mdContent);
        documentosFolder.file(safeName + ".pdf", pdfBlob);

        if (window.uploadedFiles && Object.keys(window.uploadedFiles).length > 0) {
          const anexosFolder = zip.folder("Anexos");
          for (const [fName, buffer] of Object.entries(window.uploadedFiles)) {
            anexosFolder.file(fName, buffer);
          }
        }

        zip.generateAsync({ type: "blob" }).then(function (content) {
          try {
            const url = URL.createObjectURL(content);
            const a = document.createElement("a");
            a.href = url;
            a.download = safeName + ".zip";
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 100);

            // Save a snapshot of this export so the next handoff can show a
            // diff with the previous version. Strip preview blobs to keep
            // clientStorage usage small.
            try {
              const stripPreview = (it) => { const c = Object.assign({}, it); delete c.preview; if (c.layers && c.layers instanceof Set) c.layers = Array.from(c.layers); return c; };
              const specsData = handoffData.step2.specs || {};
              const snapshot = {
                exportedAt: new Date().toISOString(),
                projectName: handoffData.step1.fluxo || null,
                versao: handoffData.step1.versao || null,
                status: handoffData.step1.status || null,
                scan: {
                  components: (specsData.components || []).map(stripPreview),
                  icons: (specsData.icons || []).map(stripPreview),
                  typography: (specsData.typography || []).map(stripPreview),
                  frames: (specsData.frames || []).map(stripPreview),
                  vectors: (specsData.vectors || []).map(stripPreview)
                },
                states: handoffData.states || [],
                motion: handoffData.motion || []
              };
              parent.postMessage({ pluginMessage: { type: 'snapshot-save', snapshot } }, '*');
            } catch (snapErr) {
              console.warn("Snapshot save skipped:", snapErr);
            }
          } catch (e) {
            console.error("Erro no download:", e);
          }
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Exportar Handoff (ZIP)</span> <i data-lucide="download" class="w-4 h-4"></i>';
            lucide.createIcons();
          }
        }).catch(err => {
          console.error("ZIP Generation error", err);
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Exportar Handoff (ZIP)</span> <i data-lucide="download" class="w-4 h-4"></i>';
            lucide.createIcons();
          }
        });
      } catch (err) {
        console.error("PDF/ZIP setup error", err);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Exportar Handoff (ZIP)</span> <i data-lucide="download" class="w-4 h-4"></i>';
          lucide.createIcons();
        }
      }
    }

    function computeHandoffDiff(previous, current) {
      const result = { added: [], removed: [], modified: [] };
      const cats = ["components", "icons", "typography", "frames", "vectors"];
      const prevScan = previous.scan || {};

      cats.forEach(cat => {
        const prevList = Array.isArray(prevScan[cat]) ? prevScan[cat] : [];
        const currList = Array.isArray(current[cat]) ? current[cat] : [];
        const prevMap = new Map(prevList.map(it => [it.name, it]));
        const currMap = new Map(currList.map(it => [it.name, it]));

        currList.forEach(it => {
          if (!prevMap.has(it.name)) {
            result.added.push({ category: cat, name: it.name });
          } else {
            const prev = prevMap.get(it.name);
            const changes = comparePropertyLists(prev.properties || [], it.properties || []);
            if (changes.length > 0) {
              result.modified.push({ category: cat, name: it.name, changes });
            }
          }
        });
        prevList.forEach(it => {
          if (!currMap.has(it.name)) {
            result.removed.push({ category: cat, name: it.name });
          }
        });
      });

      // States + motion are treated as a single category by id/state name
      const prevStates = previous.states || [];
      const currStates = current.states || [];
      const stateKey = (s) => `${s.state || ''}:${s.target || ''}`;
      const prevStateMap = new Map(prevStates.map(s => [stateKey(s), s]));
      const currStateMap = new Map(currStates.map(s => [stateKey(s), s]));
      currStates.forEach(s => { if (!prevStateMap.has(stateKey(s))) result.added.push({ category: 'state', name: `${s.state} (${s.target || '—'})` }); });
      prevStates.forEach(s => { if (!currStateMap.has(stateKey(s))) result.removed.push({ category: 'state', name: `${s.state} (${s.target || '—'})` }); });

      const prevMotion = previous.motion || [];
      const currMotion = current.motion || [];
      const motionKey = (m) => `${m.target || ''}:${m.property || ''}:${m.trigger || ''}`;
      const prevMMap = new Map(prevMotion.map(m => [motionKey(m), m]));
      const currMMap = new Map(currMotion.map(m => [motionKey(m), m]));
      currMotion.forEach(m => { if (!prevMMap.has(motionKey(m))) result.added.push({ category: 'motion', name: `${m.target || 'Global'} · ${m.property || '?'}` }); });
      prevMotion.forEach(m => { if (!currMMap.has(motionKey(m))) result.removed.push({ category: 'motion', name: `${m.target || 'Global'} · ${m.property || '?'}` }); });

      return result;
    }

    function comparePropertyLists(prevProps, currProps) {
      const changes = [];
      const keyOf = (p) => `${p.type}:${p.label || p.name || ''}`;
      const prevMap = new Map(prevProps.map(p => [keyOf(p), p]));
      currProps.forEach(p => {
        const key = keyOf(p);
        if (prevMap.has(key)) {
          const before = String(prevMap.get(key).value || '');
          const after = String(p.value || '');
          if (before !== after) {
            changes.push({ type: p.type, label: p.label || p.name, before, after });
          }
        }
      });
      return changes;
    }

    function getInteractiveHTMLContent() {
      const rawName = handoffData.step1.fluxo || "handoff";
      const safeName = rawName.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
      const status = handoffData.step1.status || "Pendente";
      const versao = handoffData.step1.versao || "v1.0.0";
      const autor = handoffData.step1.autor || "Não especificado";
      const validador = handoffData.step1.validador_po || "Não especificado";
      const tags = handoffData.step1.tags || "";

      // High-resolution 2x frame preview base64 conversion
      let framePreviewBase64 = "";
      if (handoffData.step2 && handoffData.step2.specs && handoffData.step2.specs.framePreview) {
        const fp = handoffData.step2.specs.framePreview;
        if (typeof fp === "string") {
          framePreviewBase64 = fp;
        } else if (fp.byteLength) {
          framePreviewBase64 = bytesToBase64(fp);
        } else if (fp.data && Array.isArray(fp.data)) {
          framePreviewBase64 = bytesToBase64(new Uint8Array(fp.data));
        } else if (Array.isArray(fp)) {
          framePreviewBase64 = bytesToBase64(new Uint8Array(fp));
        }
      }

      // Construct flat dynamic variables for tags and links to prevent syntax nesting
      let tagsHTML = "";
      if (tags) {
        const tagSpans = tags.split(',').map(tag => `
          <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-[9px] font-bold text-slate-500 dark:text-slate-400">${tag.trim()}</span>
        `).join('');
        tagsHTML = `
          <div>
            <span class="text-[9px] font-bold text-slate-400 uppercase block mb-1">Tags</span>
            <div class="flex flex-wrap gap-1">
              ${tagSpans}
            </div>
          </div>
        `;
      }

      const steps = handoffData.step3 || {};
      const excecoes = handoffData.excecoes || [];
      const regras = handoffData.regras || [];
      const uploadedFileNames = (handoffData.step1 && Array.isArray(handoffData.step1.files)) ? handoffData.step1.files : [];

      const protoLink = steps.proto_link || '#';
      const protoTarget = steps.proto_link ? 'target="_blank"' : '';
      const a11yLink = steps.a11y_link || '#';
      const a11yTarget = steps.a11y_link ? 'target="_blank"' : '';
      const researchLink = steps.research_link || '#';
      const researchTarget = steps.research_link ? 'target="_blank"' : '';

      // Type → visual mapping for Cenários de Exceção
      const excecaoTypeMap = {
        "Erro":         { color: "red",    icon: "alert-circle",   label: "Erro" },
        "Aviso":        { color: "amber",  icon: "alert-triangle", label: "Aviso" },
        "Sucesso":      { color: "green",  icon: "check-circle",   label: "Sucesso" },
        "Confirmação":  { color: "orange", icon: "help-circle",    label: "Confirmação" }
      };
      const excecaoTypePalette = {
        red:    { dot: "bg-red-500",    title: "text-red-700 dark:text-red-300",    bg: "bg-red-50/40 dark:bg-red-950/10",    border: "border-red-100 dark:border-red-900/30",    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
        amber:  { dot: "bg-amber-500",  title: "text-amber-700 dark:text-amber-300",bg: "bg-amber-50/40 dark:bg-amber-950/10",border: "border-amber-100 dark:border-amber-900/30",badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
        green:  { dot: "bg-green-500",  title: "text-green-700 dark:text-green-300",bg: "bg-green-50/40 dark:bg-green-950/10",border: "border-green-100 dark:border-green-900/30",badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
        orange: { dot: "bg-orange-500", title: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50/40 dark:bg-orange-950/10", border: "border-orange-100 dark:border-orange-900/30", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" }
      };

      // Accordion HTML builder helper (natively in plugin context)
      function buildAccordionHTML(id, title, icon, content, isExpanded = false) {
        const hiddenClass = isExpanded ? "" : "hidden";
        const rotateClass = isExpanded ? "rotate-180" : "";
        return `
          <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-sm mb-4 overflow-hidden">
            <button onclick="toggleHTMLAccordion('${id}', this)" class="w-full px-5 py-4 bg-slate-50/50 dark:bg-slate-950/20 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between font-black text-slate-800 dark:text-white text-xs uppercase tracking-wider select-none text-left">
              <div class="flex items-center gap-3">
                <div class="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-[#0070af] dark:text-blue-400 shrink-0">
                  <i data-lucide="${icon}" class="w-4 h-4"></i>
                </div>
                <span class="font-black">${title}</span>
              </div>
              <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 transition-transform ${rotateClass}"></i>
            </button>
            <div id="${id}" class="${hiddenClass} p-5 border-t border-slate-100 dark:border-slate-800/80">
              ${content}
            </div>
          </div>
        `;
      }

      // Generate Accordions List (ordem: Objetivo → Briefing → Exceções → Regras → Anexos → Equipe)
      let accordionsHTML = "";

      // 1. Objetivo da Entrega (sempre aberto, primeiro item)
      const objetivoContent = `
        <div class="p-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-slate-800/40 text-left">
          <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${(handoffData.step1.objetivo || "Nenhum objetivo especificado.").replace(/\n/g, '<br>')}</p>
        </div>
      `;
      accordionsHTML += buildAccordionHTML("acc-objetivo", "Objetivo da Entrega", "target", objetivoContent, true);

      // 2. Briefing Estratégico (só renderiza se houver conteúdo)
      const hasBriefing = handoffData.briefing &&
                          handoffData.briefing.enabled &&
                          handoffData.briefing.questions &&
                          handoffData.briefing.questions.some(q => q.answer && q.answer.trim() !== "");

      if (hasBriefing) {
        const briefingContent = `
          <div class="space-y-4 text-left">
            ${handoffData.briefing.questions.filter(q => q.answer && q.answer.trim() !== "").map(q => `
              <div class="p-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-slate-800/40">
                <span class="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-[#0070af] dark:text-blue-400 font-bold text-[9px] uppercase tracking-wide rounded mb-2 inline-block">${q.category || "Geral"}</span>
                <h4 class="text-xs font-black text-slate-800 dark:text-white mb-1.5">${q.question}</h4>
                <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${q.answer.replace(/\n/g, '<br>')}</p>
              </div>
            `).join('')}
          </div>
        `;
        accordionsHTML += buildAccordionHTML("acc-briefing", "Briefing Estratégico", "message-square", briefingContent, false);
      }

      // 3. Cenários de Exceção & Erro (agrupados por tipo)
      let excecoesContent = "";
      if (excecoes.length === 0) {
        excecoesContent = '<p class="text-xs text-slate-400 dark:text-slate-500 font-medium">Nenhum cenário de exceção cadastrado.</p>';
      } else {
        const groups = {};
        excecoes.forEach(e => {
          const t = e.type || "Geral";
          if (!groups[t]) groups[t] = [];
          groups[t].push(e);
        });
        const groupOrder = ["Erro", "Aviso", "Confirmação", "Sucesso"];
        const orderedTypes = Object.keys(groups).sort((a, b) => {
          const ai = groupOrder.indexOf(a); const bi = groupOrder.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        excecoesContent = `<div class="space-y-5 text-left">` + orderedTypes.map(type => {
          const map = excecaoTypeMap[type] || { color: "red", icon: "alert-octagon", label: type };
          const pal = excecaoTypePalette[map.color] || excecaoTypePalette.red;
          const items = groups[type];
          const cards = items.map(e => `
            <div class="p-4 ${pal.bg} border ${pal.border} rounded-xl">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <h4 class="text-xs font-black ${pal.title} flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 ${pal.dot} rounded-full"></span>${e.title}
                </h4>
                <span class="shrink-0 px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide ${pal.badge}">${map.label}</span>
              </div>
              ${e.notes ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1.5">${e.notes.replace(/\n/g, '<br>')}</p>` : ''}
              ${e.link ? `<a href="${e.link}" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-2 hover:underline">Abrir no Figma <i data-lucide="external-link" class="w-2.5 h-2.5"></i></a>` : ''}
            </div>
          `).join('');
          return `
            <div>
              <div class="flex items-center gap-2 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                <i data-lucide="${map.icon}" class="w-3.5 h-3.5"></i>
                <span>${map.label}</span>
                <span class="text-slate-400">·</span>
                <span class="text-slate-400 dark:text-slate-500 font-bold">${items.length}</span>
              </div>
              <div class="space-y-2">${cards}</div>
            </div>
          `;
        }).join('') + `</div>`;
      }
      accordionsHTML += buildAccordionHTML("acc-excecoes", "Cenários de Exceção & Erro", "alert-octagon", excecoesContent, false);

      // 4. Regras de Negócio & HUs
      const regrasContent = `
        <div class="space-y-3 text-left">
          ${regras.length === 0
            ? '<p class="text-xs text-slate-400 dark:text-slate-500 font-medium">Nenhuma regra de negócio cadastrada.</p>'
            : regras.map(r => `
              <div class="p-4 bg-blue-50/10 dark:bg-blue-950/5 border border-blue-100/50 dark:border-blue-900/20 rounded-xl">
                <h4 class="text-xs font-black text-blue-800 dark:text-blue-400 flex items-center gap-1.5"><span class="w-1.5 h-1.5 bg-[#0070af] rounded-full"></span>${r.title || 'Regra de Negócio'}</h4>
                ${r.notes ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1.5">${r.notes.replace(/\n/g, '<br>')}</p>` : ''}
                ${r.link ? `<a href="${r.link}" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-2 hover:underline">Ver regras/doc <i data-lucide="external-link" class="w-2.5 h-2.5"></i></a>` : ''}
              </div>
            `).join('')
          }
        </div>
      `;
      accordionsHTML += buildAccordionHTML("acc-regras", "Regras de Negócio & HUs", "shield-alert", regrasContent, false);

      // 4.4 Diff com versão anterior (se houver snapshot prévio)
      var computedDiff = null;
      if (handoffData.previousSnapshot && handoffData.previousSnapshot.scan) {
        computedDiff = computeHandoffDiff(handoffData.previousSnapshot, {
          components: components, icons: icons, typography: typography,
          frames: frames, vectors: vectors,
          states: handoffData.states || [], motion: handoffData.motion || []
        });

        const totalChanges = computedDiff.added.length + computedDiff.removed.length + computedDiff.modified.length;
        if (totalChanges > 0) {
          const prevDt = new Date(handoffData.previousSnapshot.exportedAt);
          const prevFmt = prevDt.toLocaleDateString('pt-BR') + ' às ' + prevDt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const prevVer = handoffData.previousSnapshot.versao || '—';

          const renderItem = (entry, kind) => {
            const colorMap = {
              added:    { bg: 'bg-green-50/40 dark:bg-green-950/10', border: 'border-green-100 dark:border-green-900/30', icon: 'plus-circle', iconColor: 'text-green-600 dark:text-green-400', label: 'Adicionado' },
              removed:  { bg: 'bg-red-50/40 dark:bg-red-950/10',     border: 'border-red-100 dark:border-red-900/30',     icon: 'minus-circle', iconColor: 'text-red-500 dark:text-red-400', label: 'Removido' },
              modified: { bg: 'bg-amber-50/40 dark:bg-amber-950/10', border: 'border-amber-100 dark:border-amber-900/30', icon: 'edit-3', iconColor: 'text-amber-600 dark:text-amber-400', label: 'Modificado' }
            };
            const c = colorMap[kind];
            const changesText = (entry.changes || []).map(ch => `${ch.label || ch.type}: ${ch.before} → ${ch.after}`).join(' · ');
            return `
              <div class="p-3 ${c.bg} border ${c.border} rounded-xl">
                <div class="flex items-start gap-2">
                  <i data-lucide="${c.icon}" class="w-3.5 h-3.5 ${c.iconColor} mt-0.5 shrink-0"></i>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <span class="text-[11px] font-black text-slate-800 dark:text-white">${entry.name}</span>
                      <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${entry.category}</span>
                    </div>
                    ${changesText ? `<p class="text-[10px] text-slate-600 dark:text-slate-400 mt-1 leading-snug font-mono">${changesText}</p>` : ''}
                  </div>
                </div>
              </div>
            `;
          };

          const diffSections = [
            { kind: 'added',    title: 'Adicionados',   items: computedDiff.added },
            { kind: 'modified', title: 'Modificados',   items: computedDiff.modified },
            { kind: 'removed',  title: 'Removidos',     items: computedDiff.removed }
          ].filter(s => s.items.length > 0);

          const diffContent = `
            <div class="text-left space-y-4">
              <div class="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60 rounded-xl text-[10px] text-slate-500 dark:text-slate-400">
                <span class="font-bold text-slate-700 dark:text-slate-300">Comparando com versão ${prevVer}</span> · exportada em ${prevFmt}
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="bg-green-50/40 dark:bg-green-950/10 border border-green-100 dark:border-green-900/30 p-2 rounded-lg text-center">
                  <p class="text-base font-black text-green-700 dark:text-green-400">${computedDiff.added.length}</p>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Adicionados</p>
                </div>
                <div class="bg-amber-50/40 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 p-2 rounded-lg text-center">
                  <p class="text-base font-black text-amber-700 dark:text-amber-400">${computedDiff.modified.length}</p>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Modificados</p>
                </div>
                <div class="bg-red-50/40 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 p-2 rounded-lg text-center">
                  <p class="text-base font-black text-red-700 dark:text-red-400">${computedDiff.removed.length}</p>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Removidos</p>
                </div>
              </div>
              ${diffSections.map(sec => `
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">${sec.title} · ${sec.items.length}</p>
                  <div class="space-y-2">${sec.items.map(it => renderItem(it, sec.kind)).join('')}</div>
                </div>
              `).join('')}
            </div>
          `;
          accordionsHTML += buildAccordionHTML("acc-diff", "Mudanças desde a versão anterior", "history", diffContent, true);
        }
      }

      // 4.5 Estados Interativos & Motion (P3) — só renderiza se houver entradas.
      const statesArr = Array.isArray(handoffData.states) ? handoffData.states : [];
      const motionArr = Array.isArray(handoffData.motion) ? handoffData.motion : [];
      if (statesArr.length > 0 || motionArr.length > 0) {
        const stateColorMap = {
          blue: 'bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30 text-blue-700 dark:text-blue-300',
          indigo: 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30 text-indigo-700 dark:text-indigo-300',
          green: 'bg-green-50 dark:bg-green-950/20 border-green-100 dark:border-green-900/30 text-green-700 dark:text-green-300',
          amber: 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30 text-amber-700 dark:text-amber-300',
          gray: 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/40 text-slate-700 dark:text-slate-300',
          slate: 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/40 text-slate-700 dark:text-slate-300',
          sky: 'bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/30 text-sky-700 dark:text-sky-300',
          emerald: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-300'
        };

        let statesHTML = "";
        if (statesArr.length > 0) {
          statesHTML = `
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Estados Interativos · ${statesArr.length}</p>
              <div class="grid sm:grid-cols-2 gap-3">
                ${statesArr.map(s => `
                  <div class="p-3 border ${stateColorMap[s.color] || stateColorMap.slate} rounded-xl">
                    <div class="flex items-center gap-2 mb-1.5">
                      <i data-lucide="${s.icon || 'circle'}" class="w-3.5 h-3.5"></i>
                      <span class="text-[11px] font-black">${s.state}</span>
                      ${s.target ? `<span class="ml-auto text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate" title="${s.target}">${s.target}</span>` : ''}
                    </div>
                    ${s.description ? `<p class="text-[11px] text-slate-600 dark:text-slate-300 leading-snug mb-1.5">${s.description.replace(/\n/g, '<br>')}</p>` : ''}
                    ${s.link ? `<a href="${s.link}" target="_blank" class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline">Ver no Figma <i data-lucide="external-link" class="w-2.5 h-2.5"></i></a>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }

        let motionHTML = "";
        if (motionArr.length > 0) {
          motionHTML = `
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 mt-${statesArr.length > 0 ? '4' : '0'}">Motion / Transições · ${motionArr.length}</p>
              <div class="space-y-2">
                ${motionArr.map(m => `
                  <div class="p-3 bg-pink-50/40 dark:bg-pink-950/10 border border-pink-100/60 dark:border-pink-900/30 rounded-xl">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-black text-slate-800 dark:text-white">${m.target || 'Global'}</span>
                      ${m.trigger ? `<span class="px-2 py-0.5 bg-white dark:bg-slate-900 border border-pink-100 dark:border-pink-900/40 rounded text-[9px] font-bold text-pink-700 dark:text-pink-300 uppercase tracking-wide">${m.trigger}</span>` : ''}
                    </div>
                    <div class="flex flex-wrap gap-1.5 mb-${m.notes ? '2' : '0'}">
                      ${m.property ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-white dark:bg-slate-900 rounded text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300"><i data-lucide="zap" class="w-2.5 h-2.5"></i>${m.property}</span>` : ''}
                      ${m.duration ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-white dark:bg-slate-900 rounded text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300"><i data-lucide="clock" class="w-2.5 h-2.5"></i>${m.duration}ms</span>` : ''}
                      ${m.easing ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-white dark:bg-slate-900 rounded text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300"><i data-lucide="line-chart" class="w-2.5 h-2.5"></i>${m.easing}</span>` : ''}
                    </div>
                    ${m.notes ? `<p class="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">${m.notes.replace(/\n/g, '<br>')}</p>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }

        const statesMotionContent = `<div class="space-y-4 text-left">${statesHTML}${motionHTML}</div>`;
        accordionsHTML += buildAccordionHTML("acc-states-motion", "Estados & Motion", "zap", statesMotionContent, false);
      }

      // 5. Anexos & Documentos (links externos + arquivos físicos na pasta ./Anexos)
      const hasExternalDocs = !!(steps.proto_link || steps.a11y_link || steps.research_link);
      const hasAttachedFiles = uploadedFileNames.length > 0;
      let anexosContent = "";
      if (!hasExternalDocs && !hasAttachedFiles) {
        anexosContent = '<p class="text-xs text-slate-400 dark:text-slate-500 font-medium">Nenhum anexo ou link adicionado.</p>';
      } else {
        let externalHTML = "";
        if (hasExternalDocs) {
          const docRows = [
            { key: "proto_link",    label: "Protótipo Navegável",      icon: "eye" },
            { key: "a11y_link",     label: "Diretrizes de Acessibilidade", icon: "accessibility" },
            { key: "research_link", label: "UX Research & Insights",   icon: "file-text" }
          ].filter(d => steps[d.key]).map(d => `
            <a href="${steps[d.key]}" target="_blank" class="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/40 rounded-xl hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
              <div class="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-[#0070af] dark:text-blue-400 shrink-0">
                <i data-lucide="${d.icon}" class="w-4 h-4"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-black text-slate-800 dark:text-white truncate">${d.label}</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate">${steps[d.key]}</p>
              </div>
              <i data-lucide="external-link" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
            </a>
          `).join('');
          externalHTML = `
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Links externos</p>
              <div class="space-y-2">${docRows}</div>
            </div>
          `;
        }
        let filesHTML = "";
        if (hasAttachedFiles) {
          const fileRows = uploadedFileNames.map(name => {
            const ext = (name.split('.').pop() || "").toLowerCase();
            let icon = "file";
            if (["pdf"].includes(ext)) icon = "file-text";
            else if (["doc","docx","odt","rtf"].includes(ext)) icon = "file-text";
            else if (["xls","xlsx","csv","ods"].includes(ext)) icon = "table";
            else if (["png","jpg","jpeg","gif","svg","webp"].includes(ext)) icon = "image";
            else if (["zip","rar","7z","tar","gz"].includes(ext)) icon = "archive";
            const safeFile = encodeURIComponent(name);
            return `
              <a href="./Anexos/${safeFile}" target="_blank" class="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/40 rounded-xl hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
                <div class="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <i data-lucide="${icon}" class="w-4 h-4"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-black text-slate-800 dark:text-white truncate">${name}</p>
                  <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate">./Anexos/${name}</p>
                </div>
                <i data-lucide="download" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
              </a>
            `;
          }).join('');
          filesHTML = `
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 mt-${hasExternalDocs ? '4' : '0'}">Arquivos anexados (pasta ./Anexos)</p>
              <div class="space-y-2">${fileRows}</div>
            </div>
          `;
        }
        anexosContent = `<div class="space-y-4 text-left">${externalHTML}${filesHTML}</div>`;
      }
      accordionsHTML += buildAccordionHTML("acc-anexos", "Anexos & Documentos", "paperclip", anexosContent, false);

      // 6. Equipe & Responsáveis
      const equipeContent = `
        <div class="grid sm:grid-cols-2 gap-4 text-left">
          ${(handoffData.step3.team && handoffData.step3.team.length > 0)
            ? handoffData.step3.team.map(m => `
              <div class="flex items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/40 rounded-xl">
                <div class="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-xs shrink-0">${m.name ? m.name.charAt(0).toUpperCase() : '?'}</div>
                <div class="min-w-0 flex-1">
                  <h4 class="text-xs font-black text-slate-800 dark:text-white truncate">${m.name || "Sem Nome"}</h4>
                  <p class="text-[9px] font-bold text-[#0070af] dark:text-blue-400 uppercase tracking-wide mt-0.5">${m.role || "Membro"}</p>
                  ${m.email ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">${m.email}</p>` : ''}
                </div>
              </div>
            `).join('')
            : '<p class="col-span-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center py-4">Nenhum membro da equipe adicionado.</p>'
          }
        </div>
      `;
      accordionsHTML += buildAccordionHTML("acc-equipe", "Equipe & Responsáveis", "users", equipeContent, false);

      // Frame & Elementos Tab content
      let assetsHTML = "";
      if (framePreviewBase64) {
        assetsHTML = `
          <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm text-center">
            <h3 class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-4 text-left flex items-center gap-2">
              <i data-lucide="image" class="w-4 h-4 text-[#0070af]"></i> Preview do Frame Principal (Alta Resolução 2x)
            </h3>
            
            <div class="relative group cursor-zoom-in overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800/60 max-w-3xl mx-auto" onclick="openPreviewModal('Frame Principal', 'data:image/png;base64,${framePreviewBase64}')">
              <img src="data:image/png;base64,${framePreviewBase64}" class="w-full h-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]" alt="Preview do Frame Principal" />
              <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-xs select-none">
                <i data-lucide="zoom-in" class="w-5 h-5"></i> Clique para ampliar
              </div>
            </div>
          </div>
        `;
      } else {
        assetsHTML = `
          <div class="text-center py-12 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80">
            <p class="text-sm font-bold text-slate-400 dark:text-slate-500">Nenhuma imagem de preview do frame disponível.</p>
          </div>
        `;
      }

      // Scanned Elements & Audit
      let scannedHTML = "";
      const specsData = handoffData.step2.specs || {};
      const fileKey = specsData.fileKey || "";
      const components = specsData.components || [];
      const icons = specsData.icons || [];
      const typography = specsData.typography || [];
      const frames = specsData.frames || [];
      const vectors = specsData.vectors || [];

      const scannedItemsCount = components.length + icons.length + typography.length + frames.length + vectors.length;
      const hasScannedItems = scannedItemsCount > 0;

      if (!hasScannedItems) {
        scannedHTML = `
          <div class="text-center py-12 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80">
            <p class="text-sm font-bold text-slate-400 dark:text-slate-500">Nenhum item escaneado ou auditado neste frame.</p>
          </div>
        `;
      } else {
        // Frame-level summary — aggregates counts + libs detected, always visible.
        const allItems = [...components, ...icons, ...typography, ...frames, ...vectors];
        const libsCount = {};
        for (const it of allItems) {
          if (it.matchedIn) libsCount[it.matchedIn] = (libsCount[it.matchedIn] || 0) + 1;
          if (Array.isArray(it.properties)) {
            for (const p of it.properties) {
              if (p.matchedIn) libsCount[p.matchedIn] = (libsCount[p.matchedIn] || 0) + 1;
            }
          }
        }
        const libsSorted = Object.entries(libsCount).sort((a, b) => b[1] - a[1]);
        const libsBadgesHTML = libsSorted.length > 0
          ? libsSorted.map(([name, count]) => `
              <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded-md text-[10px] font-bold text-blue-700 dark:text-blue-300">
                <i data-lucide="library" class="w-2.5 h-2.5"></i>
                ${name}
                <span class="text-blue-400 dark:text-blue-500">(${count})</span>
              </span>
            `).join('')
          : '<span class="text-[10px] text-slate-400 dark:text-slate-500">nenhuma biblioteca DSC detectada</span>';

        const frameSummaryHTML = `
          <div class="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/80 mb-4 text-left">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Resumo do Frame</h4>
              <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500">${scannedItemsCount} elementos</span>
            </div>
            <div class="grid grid-cols-5 gap-2 mb-3">
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${components.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Componentes</p>
              </div>
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${icons.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Ícones</p>
              </div>
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${typography.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Tipografia</p>
              </div>
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${frames.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Frames</p>
              </div>
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${vectors.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Vetores</p>
              </div>
            </div>
            <div>
              <p class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Bibliotecas detectadas</p>
              <div class="flex flex-wrap gap-1.5">${libsBadgesHTML}</div>
            </div>
          </div>
        `;

        // Audit summary
        const auditSummary = handoffData.step2.isAuditEnabled ? getAuditSummary(specsData) : null;
        let auditCardHTML = frameSummaryHTML;
        if (auditSummary) {
          const adoption = auditSummary.adoption;
          const issues = auditSummary.issues;
          const adjustments = auditSummary.adjustments;
          const total = auditSummary.total;
          
          const statusColor = adoption > 90 ? "text-[#10b981]" : (adoption > 70 ? "text-amber-500" : "text-red-500");
          const statusBg = adoption > 90 ? "bg-green-50 dark:bg-green-950/20" : (adoption > 70 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-red-50 dark:bg-red-950/20");
          const borderCol = adoption > 90 ? "border-green-100 dark:border-green-900/30" : (adoption > 70 ? "border-amber-100 dark:border-amber-900/30" : "border-red-100 dark:border-red-900/30");

          auditCardHTML = frameSummaryHTML + `
            <div class="p-5 rounded-2xl ${statusBg} border ${borderCol} mb-6 text-left">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">Relatório de Auditoria DSC</h4>
                  <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Análise automática de conformidade com design tokens corporativos</p>
                </div>
                <div class="text-right">
                  <span class="text-3xl font-black ${statusColor}">${adoption}%</span>
                  <p class="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Aderência (props)</p>
                </div>
              </div>

              <!-- Property-level: granular -->
              <p class="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Propriedades · ${total}</p>
              <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Em conformidade</p>
                  <p class="text-base font-black text-[#10b981]">${auditSummary.dsCount}</p>
                </div>
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Necessita revisão</p>
                  <p class="text-base font-black text-amber-500">${adjustments.length}</p>
                </div>
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Fora do padrão</p>
                  <p class="text-base font-black text-red-500">${issues.length}</p>
                </div>
              </div>

              <!-- Element-level: worst-of rule -->
              <p class="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Elementos · ${auditSummary.elementsTotal} <span class="text-slate-400 dark:text-slate-500 font-bold normal-case tracking-normal ml-1">(classificação pelo pior caso)</span></p>
              <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">100% conformes</p>
                  <p class="text-base font-black text-[#10b981]">${auditSummary.elementsOk}</p>
                </div>
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Com revisões</p>
                  <p class="text-base font-black text-amber-500">${auditSummary.elementsWarning}</p>
                </div>
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Com violações</p>
                  <p class="text-base font-black text-red-500">${auditSummary.elementsError}</p>
                </div>
              </div>

              <div class="bg-white/40 dark:bg-black/10 p-3 rounded-xl">
                <p class="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Como o elemento é classificado</p>
                <div class="space-y-1.5">
                  <div class="flex items-start gap-2 text-[10px]">
                    <span class="shrink-0 px-2 py-0.5 rounded-md bg-green-50 dark:bg-green-950/40 text-[#10b981] font-bold text-[8px] uppercase tracking-wide">Em conformidade</span>
                    <span class="text-slate-500 dark:text-slate-400 leading-snug"><strong class="text-slate-700 dark:text-slate-300">Todas</strong> as propriedades têm vínculo direto com tokens da DSC.</span>
                  </div>
                  <div class="flex items-start gap-2 text-[10px]">
                    <span class="shrink-0 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-500 font-bold text-[8px] uppercase tracking-wide">Necessita revisão</span>
                    <span class="text-slate-500 dark:text-slate-400 leading-snug font-medium">Pelo menos 1 prop bate por valor/nome (não pela key) — token foi reproduzido manualmente.</span>
                  </div>
                  <div class="flex items-start gap-2 text-[10px]">
                    <span class="shrink-0 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/40 text-red-500 font-bold text-[8px] uppercase tracking-wide">Fora do padrão</span>
                    <span class="text-slate-500 dark:text-slate-400 leading-snug">Pelo menos 1 prop <strong class="text-slate-700 dark:text-slate-300">não corresponde</strong> a nenhum token da DSC.</span>
                  </div>
                </div>
              </div>
            </div>
          `;
        }

        const sectionsData = [
          { title: "Componentes", items: components, icon: "box", type: "components" },
          { title: "Ícones", items: icons, icon: "image", type: "icons" },
          { title: "Tipografia", items: typography, icon: "type", type: "typography" },
          { title: "Frames e Layouts", items: frames, icon: "layout", type: "frames" },
          { title: "Vetores", items: vectors, icon: "pen-tool", type: "vectors" }
        ];

        const scannedSectionsHTML = sectionsData.map((sec, secIndex) => {
          if (!sec.items || sec.items.length === 0) return "";
          
          const itemsHTML = sec.items.map(item => {
            // Preview base64
            let previewHTML = "";
            let base64 = "";
            if (item.preview) {
              if (typeof item.preview === "string") {
                base64 = item.preview;
              } else if (item.preview.byteLength) {
                base64 = bytesToBase64(item.preview);
              } else if (item.preview.data && Array.isArray(item.preview.data)) {
                base64 = bytesToBase64(new Uint8Array(item.preview.data));
              } else if (Array.isArray(item.preview)) {
                base64 = bytesToBase64(new Uint8Array(item.preview));
              }
              if (base64) {
                previewHTML = `
                  <div class="relative group cursor-zoom-in overflow-hidden rounded border border-slate-100 dark:border-slate-800 shrink-0 w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-850" onclick="openPreviewModal('${item.name.replace(/'/g, "\\'")}', 'data:image/png;base64,${base64}')">
                    <img src="data:image/png;base64,${base64}" class="w-full h-full object-contain p-1 transition-transform duration-250 group-hover:scale-110" />
                    <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <i data-lucide="zoom-in" class="w-3 h-3"></i>
                    </div>
                  </div>
                `;
              }
            }
            if (!previewHTML) {
              previewHTML = `<div class="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-800 rounded text-slate-300 dark:text-slate-600"><i data-lucide="${sec.icon}" class="w-4 h-4"></i></div>`;
            }

            // Audit badge + property breakdown ("12 props · 11 ok · 1 fora do padrão")
            let badgeHTML = "";
            if (handoffData.step2.isAuditEnabled) {
              const status = computeItemAuditStatus(item);
              const b = getItemAuditBreakdown(item);
              const breakdownChips = b.total > 0
                ? `<span class="inline-flex items-center gap-1.5 text-[8px] font-bold text-slate-500 dark:text-slate-400 normal-case tracking-normal ml-1.5">
                    <span class="text-slate-400 dark:text-slate-500">${b.total} props</span>
                    ${b.ok > 0 ? `<span class="inline-flex items-center gap-0.5 text-[#10b981]"><i data-lucide="check" class="w-2.5 h-2.5"></i>${b.ok}</span>` : ''}
                    ${b.warning > 0 ? `<span class="inline-flex items-center gap-0.5 text-amber-500"><i data-lucide="alert-triangle" class="w-2.5 h-2.5"></i>${b.warning}</span>` : ''}
                    ${b.error > 0 ? `<span class="inline-flex items-center gap-0.5 text-red-500"><i data-lucide="x" class="w-2.5 h-2.5"></i>${b.error}</span>` : ''}
                  </span>`
                : '';

              if (status === "ok") {
                badgeHTML = `<span class="inline-flex items-center gap-1 text-[#10b981] font-bold"><i data-lucide="check-circle" class="w-2.5 h-2.5"></i>EM CONFORMIDADE</span>${breakdownChips}`;
              } else if (status === "warning") {
                badgeHTML = `<span class="inline-flex items-center gap-1 text-amber-500 font-bold"><i data-lucide="help-circle" class="w-2.5 h-2.5"></i>NECESSITA REVISÃO</span>${breakdownChips}`;
              } else {
                badgeHTML = `<span class="inline-flex items-center gap-1 text-red-400 font-bold"><i data-lucide="alert-circle" class="w-2.5 h-2.5"></i>FORA DO PADRÃO</span>${breakdownChips}`;
              }
            }

            // Figma Deep Link
            const figmaLink = (fileKey && item.nodeId)
              ? `https://www.figma.com/design/${fileKey}/?node-id=${item.nodeId.replace(/:/g, '-')}`
              : "";
            
            let figmaLinkHTML = "";
            if (figmaLink) {
              figmaLinkHTML = `
                <a href="${figmaLink}" target="_blank" title="Focar este elemento no Figma" class="text-slate-400 hover:text-blue-500 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer ml-auto flex items-center justify-center">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                </a>
              `;
            }

            // Variants as pills in card header — most useful info for dev to replicate.
            let variantsHTML = "";
            if (Array.isArray(item.variants) && item.variants.length > 0) {
              variantsHTML = `
                <div class="flex flex-wrap gap-1 mt-1.5 mb-1">
                  ${item.variants.map(v => `
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[9px] font-bold text-slate-600 dark:text-slate-300">
                      <span class="text-slate-400 dark:text-slate-500">${v.name}:</span>
                      <span>${v.value}</span>
                    </span>
                  `).join('')}
                </div>
              `;
            }

            // Lib origin (when matched against a DSC lib) + Code Connect mapping
            let libOriginHTML = "";
            if (item.matchedIn) {
              const codeMappings = (typeof window !== 'undefined' && window.__HANDEX_CODE_MAPPINGS__) || null;
              const libMap = codeMappings && codeMappings.libraries && codeMappings.libraries[item.matchedIn];
              const override = codeMappings && codeMappings.componentOverrides && item.componentKey ? codeMappings.componentOverrides[item.componentKey] : null;
              const codeImport = (override && override.import) || (libMap && libMap.import) || null;
              const docsHref = (override && override.docs) || (libMap && libMap.docs) || null;
              libOriginHTML = `
                <span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  <span class="inline-flex items-center gap-1"><i data-lucide="library" class="w-2.5 h-2.5"></i>${item.matchedIn}${item.matchedTokenName && item.matchedTokenName !== item.name ? ` · ${item.matchedTokenName}` : ''}</span>
                  ${codeImport ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded font-mono text-[9px]" title="Importe deste pacote no código"><i data-lucide="code-2" class="w-2.5 h-2.5"></i>${codeImport}</span>` : ''}
                  ${docsHref ? `<a href="${docsHref}" target="_blank" class="inline-flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-blue-500 transition-colors"><i data-lucide="book-open" class="w-2.5 h-2.5"></i>docs</a>` : ''}
                </span>
              `;
            }

            // Properties — grouped by type, violations sorted first within each group.
            let propertiesHTML = "";
            const propsForCard = (item.properties || []).filter(p => p.type !== "variant");
            if (propsForCard.length > 0) {
              const groupDefs = [
                { key: "colors",     title: "Cores",        icon: "palette",          types: ["color", "stroke"] },
                { key: "typography", title: "Tipografia",   icon: "type",             types: ["typography", "fontSize", "fontFamily", "fontWeight", "lineHeight", "letterSpacing"] },
                { key: "spacing",    title: "Espaçamento",  icon: "move-horizontal",  types: ["spacing", "padding", "gap"] },
                { key: "border",     title: "Borda & raio", icon: "square",           types: ["strokeWeight", "strokeWidth", "radius", "cornerRadius"] },
                { key: "layout",     title: "Layout",       icon: "layout-dashboard", types: ["layout", "direction", "alignment", "size"] },
                { key: "effect",     title: "Efeitos",      icon: "sparkles",         types: ["effect"] }
              ];

              const sortByStatus = (a, b) => {
                const rank = (x) => x.isDS === true ? 2 : x.isDS === "warning" ? 1 : 0;
                return rank(a) - rank(b);
              };

              const groups = groupDefs.map(g => ({
                ...g,
                items: propsForCard.filter(p => g.types.includes(p.type)).sort(sortByStatus)
              })).filter(g => g.items.length > 0);

              // Catch-all for unknown types
              const known = new Set(groupDefs.flatMap(g => g.types));
              const others = propsForCard.filter(p => !known.has(p.type)).sort(sortByStatus);
              if (others.length > 0) groups.push({ key: "other", title: "Outros", icon: "circle", items: others });

              const renderProp = (p) => {
                let pStatusHTML = "";
                if (handoffData.step2.isAuditEnabled) {
                  if (p.isDS === true) {
                    pStatusHTML = `<span class="text-[#10b981] shrink-0" title="Em conformidade"><i data-lucide="check" class="w-3.5 h-3.5"></i></span>`;
                  } else if (p.isDS === "warning") {
                    pStatusHTML = `<span class="text-amber-500 shrink-0" title="Necessita revisão"><i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i></span>`;
                  } else {
                    pStatusHTML = `<span class="text-red-400 shrink-0" title="Fora do padrão"><i data-lucide="x" class="w-3.5 h-3.5"></i></span>`;
                  }
                }

                const isColor = (p.type === "color" || p.type === "stroke") && p.value && p.value.startsWith("#");
                const pColorPreview = isColor
                  ? `<div class="w-3.5 h-3.5 rounded-full border border-slate-200 dark:border-slate-700 inline-block align-middle" style="background-color: ${p.value}"></div>`
                  : `<i data-lucide="circle" class="w-3 h-3 text-slate-300 dark:text-slate-600"></i>`;

                // Token name + lib origin line (only when matched)
                let tokenLineHTML = "";
                if (p.matchedTokenName && handoffData.step2.isAuditEnabled) {
                  tokenLineHTML = `
                    <div class="flex items-center gap-1 text-[9px] text-blue-600 dark:text-blue-400 font-bold mt-0.5 ml-5.5">
                      <i data-lucide="link-2" class="w-2.5 h-2.5"></i>
                      <span class="truncate" title="Token: ${p.matchedTokenName}${p.matchedIn ? ' · ' + p.matchedIn : ''}">
                        ${p.matchedTokenName}${p.matchedIn ? ` <span class="text-slate-400 dark:text-slate-500">· ${p.matchedIn}</span>` : ''}
                      </span>
                    </div>
                  `;
                }

                // Closest match suggestion (only when fora do padrão)
                let closestHTML = "";
                if (p.closestMatch && handoffData.step2.isAuditEnabled && p.isDS === false) {
                  const cm = p.closestMatch;
                  closestHTML = `
                    <div class="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 font-bold mt-0.5 ml-5.5">
                      <i data-lucide="lightbulb" class="w-2.5 h-2.5"></i>
                      <span class="truncate" title="Sugestão de match mais próximo">
                        Mais próximo: ${cm.tokenName || cm.value}
                        ${cm.similarity !== undefined ? ` <span class="text-slate-400 dark:text-slate-500">(${cm.similarity}%)</span>` : ''}
                        ${cm.library ? ` <span class="text-slate-400 dark:text-slate-500">· ${cm.library}</span>` : ''}
                      </span>
                    </div>
                  `;
                }

                return `
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2 truncate min-w-0" title="${p.name}">
                        <div class="w-3.5 h-3.5 flex items-center justify-center shrink-0">${pColorPreview}</div>
                        <span class="truncate">${p.label || p.type}: <span class="font-bold text-slate-700 dark:text-slate-200">${p.value}</span></span>
                      </div>
                      ${pStatusHTML}
                    </div>
                    ${tokenLineHTML}
                    ${closestHTML}
                  </div>
                `;
              };

              propertiesHTML = `<div class="mt-3 border-t border-slate-100 dark:border-slate-800 pt-2.5 text-left space-y-3">`
                + groups.map(g => `
                  <div>
                    <div class="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">
                      <i data-lucide="${g.icon}" class="w-3 h-3"></i>
                      <span>${g.title}</span>
                      <span class="text-slate-300 dark:text-slate-600">·</span>
                      <span>${g.items.length}</span>
                    </div>
                    <div class="space-y-1.5">
                      ${g.items.map(renderProp).join('')}
                    </div>
                  </div>
                `).join('')
                + `</div>`;
            }

            return `
              <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-xl shadow-sm p-4 hover:shadow-md transition-all scanned-element-card text-left" data-element-name="${item.name.toLowerCase()}">
                <div class="flex items-start gap-3 mb-2 text-left">
                  ${previewHTML}
                  <div class="flex-1 min-w-0">
                    <span class="font-extrabold text-slate-800 dark:text-white text-xs truncate block" title="${item.name}">${item.name}</span>
                    ${libOriginHTML}
                    ${variantsHTML}
                    <div class="text-[8px] uppercase tracking-wider font-bold mt-1">
                      ${badgeHTML}
                    </div>
                  </div>
                  ${figmaLinkHTML}
                </div>
                ${propertiesHTML}
              </div>
            `;
          }).join('');

          const count = sec.items.length;
          const gridId = `grid-html-${secIndex}`;

          return `
            <div class="scanned-section-container bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-sm mb-6 overflow-hidden">
              <button onclick="toggleHTMLAccordion('${gridId}', this)" class="w-full px-5 py-4 bg-slate-50/50 dark:bg-slate-950/20 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between font-black text-slate-800 dark:text-white text-xs uppercase tracking-wider select-none text-left">
                <div class="flex items-center gap-3">
                  <div class="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-[#0070af] dark:text-blue-400 shrink-0">
                    <i data-lucide="${sec.icon}" class="w-4 h-4"></i>
                  </div>
                  <div>
                    <span class="font-black">${sec.title}</span>
                    <span class="section-count-span text-[9px] font-bold text-slate-400 dark:text-slate-500 ml-1.5 uppercase tracking-wide">(${count} elementos)</span>
                  </div>
                </div>
                <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 transition-transform"></i>
              </button>

              <div id="${gridId}" class="hidden p-5 border-t border-slate-100 dark:border-slate-800/80">
                <div class="grid sm:grid-cols-2 gap-4">
                  ${itemsHTML}
                </div>
              </div>
            </div>
          `;
        }).join('');

        scannedHTML = `
          <div class="space-y-4">
            ${auditCardHTML}
            ${scannedSectionsHTML}
          </div>
        `;
      }

      // Structured payload for "Exportar JSON" — stripped of preview base64
      // so devs can consume the audit data in their pipeline without dragging
      // 30 MB of inline PNGs.
      const stripPreview = (item) => {
        const { preview, ...rest } = item || {};
        return rest;
      };
      const scanPayload = {
        project: {
          name: handoffData.step1.fluxo || null,
          designer: autor,
          status: status,
          versao: versao,
          generatedAt: new Date().toISOString(),
          tags: handoffData.step1.tags || null
        },
        audit: {
          enabled: !!handoffData.step2.isAuditEnabled,
          librariesUsed: (function () {
            const m = {};
            const all = [...components, ...icons, ...typography, ...frames, ...vectors];
            for (const it of all) {
              if (it.matchedIn) m[it.matchedIn] = (m[it.matchedIn] || 0) + 1;
              if (Array.isArray(it.properties)) {
                for (const p of it.properties) if (p.matchedIn) m[p.matchedIn] = (m[p.matchedIn] || 0) + 1;
              }
            }
            return m;
          })(),
          referenceBundle: handoffData.step2.auditAutoBundle ? {
            generatedAt: handoffData.step2.auditAutoBundle.generatedAt,
            libraries: handoffData.step2.auditAutoBundle.libraries.map(l => ({
              slug: l.slug,
              libraryName: l.meta && l.meta.libraryName,
              fileKey: l.meta && l.meta.figmaFileKey,
              styleCount: (l.styleTokens.colors.length + l.styleTokens.typography.length + l.styleTokens.effects.length),
              componentCount: (l.components || []).length,
              variableCount: (l.designTokens.variables || []).length,
              available: !(l._stats && l._stats.libNotAvailable)
            }))
          } : null
        },
        scan: {
          fileKey: specsData.fileKey || null,
          components: components.map(stripPreview),
          icons: icons.map(stripPreview),
          typography: typography.map(stripPreview),
          frames: frames.map(stripPreview),
          vectors: vectors.map(stripPreview)
        },
        interactiveStates: handoffData.states || [],
        motion: handoffData.motion || [],
        diff: typeof computedDiff !== 'undefined' ? computedDiff : null
      };
      // Escape any closing-script sequence so the JSON can't terminate the
      // surrounding tag when embedded inline.
      const scanPayloadLiteral = JSON.stringify(scanPayload).replace(/<\/script/gi, '<\\/script');

      // Search bar HTML
      const searchBarHTML = `
        <div class="mb-6">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              <i data-lucide="search" class="w-4 h-4"></i>
            </div>
            <input type="text" id="scanned-search" oninput="filterElements(this.value)" placeholder="Buscar elemento escaneado..." class="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm" />
          </div>
        </div>
      `;

      const fullHTML = `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Handex Handoff - ${handoffData.step1.fluxo || 'Documento'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/lucide@latest"><\/script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
          }
        }
      }
    }
  <\/script>
  <style>
    body {
      font-family: 'Inter', sans-serif;
    }
    .bg-grid {
      background-size: 20px 20px;
      background-image: linear-gradient(to right, rgba(148, 163, 184, 0.05) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
    }
    .dark .bg-grid {
      background-size: 20px 20px;
      background-image: linear-gradient(to right, rgba(51, 65, 85, 0.15) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(51, 65, 85, 0.15) 1px, transparent 1px);
    }
  </style>
</head>
<body class="bg-slate-50 dark:bg-[#090d16] bg-grid text-slate-800 dark:text-slate-100 min-h-screen transition-colors duration-200">
  <header class="sticky top-0 z-50 bg-white/80 dark:bg-[#0f1626]/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/80 px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631" class="h-7 w-auto shrink-0" aria-label="CAIXA">
        <g transform="translate(-284.78446,-475.51214)">
          <g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)">
            <g transform="scale(0.24,0.24)">
              <path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
            </g>
          </g>
        </g>
      </svg>
      <span class="text-slate-300 dark:text-slate-700 font-bold text-sm">|</span>
      <div>
        <h1 class="text-sm font-black text-slate-900 dark:text-white tracking-[0.15em] uppercase">Handex</h1>
        <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Portal Handoff Desacoplado</p>
      </div>
    </div>
    
    <div class="flex items-center gap-3">
      <span class="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">${versao}</span>
      <span class="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-[#0070af] dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 rounded-full text-[10px] font-extrabold uppercase tracking-wider">${status}</span>
      
      <button onclick="downloadJSON()" title="Baixa o JSON estruturado do scan (sem previews) para uso em pipeline de dev" class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3M13 15h3M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" /></svg>
        <span>Exportar JSON</span>
      </button>

      <button onclick="downloadSelf()" class="flex items-center gap-1.5 px-3 py-1.5 bg-[#0070af] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        <span>Gerar Ficha Técnica</span>
      </button>

      <button onclick="toggleTheme()" class="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer">
        <svg id="sun-icon" class="w-4 h-4 text-amber-500 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
        <svg id="moon-icon" class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      </button>
    </div>
  </header>

  <div class="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-4 gap-8">
    <aside class="md:col-span-1 space-y-6">
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 p-5 shadow-sm space-y-4 text-left">
        <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest pb-2 border-b border-slate-100 dark:border-slate-800/60">Especificações</h2>
        
        <div>
          <span class="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Título do Projeto</span>
          <span class="text-sm font-bold text-slate-800 dark:text-white">${handoffData.step1.fluxo || "Não especificado"}</span>
        </div>

        <div>
          <span class="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Designer Responsável</span>
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 block">${autor}</span>
        </div>

        <div>
          <span class="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Data de Publicação</span>
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 block">${new Date().toLocaleDateString('pt-BR')}</span>
        </div>

        ${tagsHTML}
      </div>

      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 p-5 shadow-sm space-y-3.5 text-left">
        <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest pb-2 border-b border-slate-100 dark:border-slate-800/60">Links do Projeto</h2>
        
        <a href="${protoLink}" ${protoTarget} class="flex items-center gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          Protótipo Navegável
        </a>

        <a href="${a11yLink}" ${a11yTarget} class="flex items-center gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 01-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          Diretrizes Acessibilidade
        </a>

        <a href="${researchLink}" ${researchTarget} class="flex items-center gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          UX Research & Insights
        </a>
      </div>
    </aside>

    <main class="md:col-span-3 space-y-6">
      <div class="flex border-b border-slate-100 dark:border-slate-800/80 gap-6 overflow-x-auto pb-1">
        <button onclick="switchTab('tab-document')" id="btn-tab-document" class="tab-btn px-1 pb-3 text-sm font-black border-b-2 border-blue-500 text-blue-500 focus:outline-none transition-all uppercase tracking-wider whitespace-nowrap shrink-0">
          📑 Ficha Técnica
        </button>
        <button onclick="switchTab('tab-assets')" id="btn-tab-assets" class="tab-btn px-1 pb-3 text-sm font-extrabold text-slate-400 dark:text-slate-500 border-b-2 border-transparent hover:text-slate-700 dark:hover:text-slate-300 focus:outline-none transition-all uppercase tracking-wider whitespace-nowrap shrink-0">
          🖼️ Frame & Elementos
        </button>
        <button onclick="switchTab('tab-scanned')" id="btn-tab-scanned" class="tab-btn px-1 pb-3 text-sm font-extrabold text-slate-400 dark:text-slate-500 border-b-2 border-transparent hover:text-slate-700 dark:hover:text-slate-300 focus:outline-none transition-all uppercase tracking-wider whitespace-nowrap shrink-0">
          🔍 Elementos Escaneados (${scannedItemsCount})
        </button>
      </div>

      <div id="tab-document" class="tab-panel animate-in fade-in duration-300 space-y-4">
        ${accordionsHTML}
      </div>

      <div id="tab-assets" class="tab-panel hidden animate-in fade-in duration-300">
        ${assetsHTML}
      </div>

      <div id="tab-scanned" class="tab-panel hidden animate-in fade-in duration-300">
        ${searchBarHTML}
        ${scannedHTML}
      </div>
    </main>
  </div>

  <footer class="mt-16 py-8 border-t border-slate-100 dark:border-slate-800/80 text-center text-slate-400 dark:text-slate-600">
    <p class="text-[10px] font-bold uppercase tracking-wider">Handex ecosystem • Design Ops Automação Handoff</p>
    <p class="text-[9px] mt-1">Gerado automaticamente pelo plugin Handex no Figma</p>
  </footer>

  <!-- Lightbox Modal -->
  <div id="preview-modal" class="fixed inset-0 z-[100] hidden bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300 opacity-0" onclick="closePreviewModal()">
    <button onclick="closePreviewModal()" class="absolute top-6 right-6 text-white hover:text-red-400 transition-colors p-2 rounded-full hover:bg-white/10 shrink-0 cursor-pointer" aria-label="Fechar zoom">
      <i data-lucide="x" class="w-6 h-6"></i>
    </button>
    <div class="max-w-5xl max-h-[85vh] flex flex-col items-center gap-4" onclick="event.stopPropagation()">
      <h3 id="modal-image-title" class="text-white text-xs font-black uppercase tracking-widest text-center"></h3>
      <div class="relative overflow-auto rounded-xl max-w-full max-h-[75vh] border border-slate-850">
        <img id="modal-image-img" src="" class="max-w-full h-auto object-contain rounded-lg shadow-2xl" />
      </div>
    </div>
  </div>

  <script>
    if (typeof window.lucide !== 'undefined') {
      window.lucide.createIcons();
    }

    function toggleTheme() {
      const html = document.documentElement;
      const sun = document.getElementById("sun-icon");
      const moon = document.getElementById("moon-icon");
      
      if (html.classList.contains("dark")) {
        html.classList.remove("dark");
        sun.classList.remove("hidden");
        moon.classList.add("hidden");
      } else {
        html.classList.add("dark");
        sun.classList.add("hidden");
        moon.classList.remove("hidden");
      }
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-panel').forEach(function(panel) { panel.classList.add('hidden'); });
      document.getElementById(tabId).classList.remove('hidden');

      document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.classList.remove('text-blue-500', 'border-blue-500', 'font-black');
        btn.classList.add('text-slate-400', 'dark:text-slate-500', 'border-transparent', 'font-extrabold');
      });

      var activeBtn = document.getElementById('btn-' + tabId);
      if (activeBtn) {
        activeBtn.classList.remove('text-slate-400', 'dark:text-slate-500', 'border-transparent', 'font-extrabold');
        activeBtn.classList.add('text-blue-500', 'border-blue-500', 'font-black');
      }
    }

    function toggleHTMLAccordion(gridId, btn) {
      var grid = document.getElementById(gridId);
      var chevron = btn.querySelector('.lucide-chevron-down');
      if (grid) {
        var isHidden = grid.classList.contains('hidden');
        if (isHidden) {
          grid.classList.remove('hidden');
          if (chevron) chevron.classList.add('rotate-180');
        } else {
          grid.classList.add('hidden');
          if (chevron) chevron.classList.remove('rotate-180');
        }
      }
    }

    function openPreviewModal(title, imgSrc) {
      var modal = document.getElementById("preview-modal");
      var mTitle = document.getElementById("modal-image-title");
      var mImg = document.getElementById("modal-image-img");
      if (modal && mTitle && mImg) {
        mTitle.textContent = title;
        mImg.src = imgSrc;
        modal.classList.remove("hidden");
        setTimeout(function() {
          modal.classList.remove("opacity-0");
        }, 10);
      }
    }

    function closePreviewModal() {
      var modal = document.getElementById("preview-modal");
      if (modal) {
        modal.classList.add("opacity-0");
        setTimeout(function() {
          modal.classList.add("hidden");
        }, 300);
      }
    }

    function filterElements(query) {
      var lowerQuery = query.toLowerCase().trim();
      var sections = document.querySelectorAll('.scanned-section-container');
      
      sections.forEach(function(sec) {
        var cards = sec.querySelectorAll('.scanned-element-card');
        var visibleCount = 0;
        
        cards.forEach(function(card) {
          var name = card.getAttribute('data-element-name') || '';
          if (name.indexOf(lowerQuery) !== -1) {
            card.classList.remove('hidden');
            visibleCount++;
          } else {
            card.classList.add('hidden');
          }
        });
        
        // Update section count header
        var countSpan = sec.querySelector('.section-count-span');
        if (countSpan) {
          countSpan.textContent = '(' + visibleCount + ' elementos)';
        }
        
        // Hide/show the section itself based on count
        if (visibleCount === 0 && lowerQuery !== '') {
          sec.classList.add('hidden');
        } else {
          sec.classList.remove('hidden');
        }
      });
    }

    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        closePreviewModal();
      }
    });

    function downloadSelf() {
      const baseName = "${safeName}";
      const htmlContent = "<!DOCTYPE html>\\n" + document.documentElement.outerHTML;
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "handoff_" + baseName + "_visualizador.html";
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }

    // Structured scan data (sem previews base64) — pronto para pipeline de dev.
    window.__HANDEX_SCAN_PAYLOAD__ = ${scanPayloadLiteral};

    function downloadJSON() {
      const baseName = "${safeName}";
      const payload = window.__HANDEX_SCAN_PAYLOAD__ || {};
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = baseName + "_scan.json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }
  <\/script>
</body>
</html>`;

      return fullHTML;
    }

    // restoreUIFromState (canonical version) is defined below at the end of the module.



    function importProgress(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          Object.assign(handoffData, data);
          alert("Progresso recuperado!");
          startHandoff();
          // Populate UI fields Seeder if possible
          if (handoffData.step1.fluxo) {
            const el = document.getElementById("s1-fluxo");
            if (el) el.value = handoffData.step1.fluxo;
          }
        } catch (err) { alert("Erro ao importar JSON"); }
      };
      reader.readAsText(file);
    }

    function exportProgress() {
      // Coleta dados pendentes
      const s1FluxoExp = document.getElementById("s1-fluxo");
      handoffData.step1.fluxo = s1FluxoExp ? s1FluxoExp.value : "";
      const s1StatusExp = document.getElementById("s1-status");
      handoffData.step1.status = s1StatusExp ? s1StatusExp.value : "";
      const s1ObjetivoExp = document.getElementById("s1-objetivo");
      handoffData.step1.objetivo = s1ObjetivoExp ? s1ObjetivoExp.value : "";
      const s1GerenteExp = document.getElementById("s1-gerente");
      handoffData.step1.gerente = s1GerenteExp ? s1GerenteExp.value : "";

      // Faz uma copia limpa sem as specs pesadas que contem Uint8Array
      const exportData = JSON.parse(JSON.stringify(handoffData));
      exportData.specs = createdSpecs.map(s => {
        const sCopy = JSON.parse(JSON.stringify(s));
        sCopy.preview = null;
        return sCopy;
      });
      exportData.step2 = { specs: null };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = handoffData.step1.fluxo ? handoffData.step1.fluxo.replace(/\s+/g, '_') : 'progresso';
      a.download = `handex_${safeName}.json`;

      try {
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      } catch (e) {
        console.error("Erro no download JSON:", e);
        alert("O Figma bloqueou o download direto. Se possivel tente rodar o plugin no Browser.");
      }
    }

    function openMeasureModal() {
      openModal('measure-form-modal');
    }
    function closeMeasureModal() {
      closeModal('measure-form-modal');
    }

    let currentMeasureTypes = ['wh'];
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
          btn.classList.remove('border-gray-100', 'dark:border-dark-line');
          btn.classList.add('border-[#0070af]', 'bg-blue-50', 'dark:bg-blue-900/20');
          const icon = btn.querySelector('.measure-icon');
          if (icon) {
            icon.classList.remove('text-slate-400');
            icon.classList.add('text-[#0070af]', 'dark:text-blue-400');
          }
          const label = btn.querySelector('.measure-label');
          if (label) {
            label.classList.remove('text-slate-500', 'dark:text-dark-text');
            label.classList.add('text-[#0070af]', 'dark:text-blue-400', 'font-bold');
          }
        } else {
          btn.classList.remove('border-[#0070af]', 'bg-blue-50', 'dark:bg-blue-900/20');
          btn.classList.add('border-gray-100', 'dark:border-dark-line');
          const icon = btn.querySelector('.measure-icon');
          if (icon) {
            icon.classList.remove('text-[#0070af]', 'dark:text-blue-400');
            icon.classList.add('text-slate-400');
          }
          const label = btn.querySelector('.measure-label');
          if (label) {
            label.classList.remove('text-[#0070af]', 'dark:text-blue-400', 'font-bold');
            label.classList.add('text-slate-500', 'dark:text-dark-text');
          }
        }
      });
    }

    function executeMeasurement() {
      const storeInParent = document.getElementById('chk-store-parent').checked;
      parent.postMessage({ 
        pluginMessage: { 
          type: 'measure-nodes-custom', 
          measureTypes: currentMeasureTypes, 
          storeInParent,
          startingNumber: nextMeasurementNumber 
        } 
      }, '*');
      closeMeasureModal();
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

    
    function exportDesignData(format) {
      parent.postMessage({ pluginMessage: { type: 'export-design-data', format } }, '*');
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
    function openHelp(fromModalId) {
      lastModalBeforeHelp = fromModalId;
      if (fromModalId) closeModal(fromModalId);
      openModal('spec-types-help-modal');
    }

    function closeHelpAndReturn() {
      closeModal('spec-types-help-modal');
      if (lastModalBeforeHelp) {
        openModal(lastModalBeforeHelp);
        lastModalBeforeHelp = null;
      }
    }

    // Variável global para armazenar temporariamente as propriedades recebidas
    let currentScannedProps = [];

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
    function handleScroll(el) {
      const btnTop = document.getElementById('btn-top');
      if (!btnTop) return;
      
      // Limiar reduzido para 100px para melhor percepção em janelas pequenas
      if (el.scrollTop > 100) {
        btnTop.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
        btnTop.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
      } else {
        btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
        btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
      }
    }

    function scrollToTop() {
      // 1. Prioridade para Modais (estão fora das views e têm z-index alto)
      const visibleModals = Array.from(document.querySelectorAll('[id$="-modal"]:not(.hidden)'));
      if (visibleModals.length > 0) {
        const modal = visibleModals[visibleModals.length - 1];
        const scrollable = modal.querySelector('.overflow-y-auto') || modal;
        scrollable.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      // 2. Fallback para a View ativa
      const activeView = document.querySelector('.view.active');
      if (activeView) {
        // Procuramos o container principal da view. Geralmente é o que tem flex-1 e overflow-y-auto.
        // Se não houver um interno, o próprio activeView ou o container pai (Home) será usado.
        const mainScroll = activeView.querySelector('.flex-1.overflow-y-auto') || 
                           activeView.querySelector('.overflow-y-auto') || 
                           document.querySelector('.flex-1.overflow-y-auto.relative'); // Fallback para o container pai da Home
        
        if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: "smooth" });
      }
    }

    function autoScrollToNewItem(containerId, targetElement = null) {
      setTimeout(() => {
        const container = document.getElementById(containerId);
        if (container) {
          const target = targetElement || container.lastElementChild;
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Visual highlight
            target.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
            setTimeout(() => {
              target.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2');
            }, 2000);
          }
        }
      }, 100);
    }

    function focusNode(id) {
      parent.postMessage({ 
        pluginMessage: { 
          type: 'highlight-node', 
          id: id, 
          highlight: true,
          shouldScroll: true,
          color: '#0070af'
        } 
      }, '*');
    }

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

// --- UI RESTORATION ---
    function restoreUIFromState() {
      // 1. Basic Info
      const s1Fluxo = document.getElementById("s1-fluxo");
      if (s1Fluxo) s1Fluxo.value = handoffData.step1.fluxo || "";
      const s1Status = document.getElementById("s1-status");
      if (s1Status) s1Status.value = handoffData.step1.status || "draft";
      const s1Objetivo = document.getElementById("s1-objetivo");
      if (s1Objetivo) s1Objetivo.value = handoffData.step1.objetivo || "";
      const s1Gerente = document.getElementById("s1-gerente");
      if (s1Gerente) s1Gerente.value = handoffData.step1.gerente || "";

      // 2. Briefing Questions
      const briefingContainer = document.getElementById('briefing-questions-container-v2');
      if (briefingContainer) {
        briefingContainer.innerHTML = '';
        if (handoffData.briefing && handoffData.briefing.questions) {
          handoffData.briefing.questions.forEach((q, i) => {
            const card = document.createElement('div');
            card.id = `briefing-card-${q.id}`;
            card.className = "bg-white dark:bg-dark-bg p-5 rounded-xl border border-gray-100 dark:border-dark-line shadow-sm relative";
            card.innerHTML = `
              <button onclick="removeBriefingQuestion('${q.id}')" title="Excluir Pergunta" aria-label="Excluir Pergunta" class="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
              <div class="flex items-center gap-3 mb-4">
                <span class="text-[#0070af] font-bold text-[14px]">#${i+1} Pergunta</span>
                <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-dark-muted rounded border border-gray-100 dark:border-dark-line uppercase tracking-wider">${q.category || "Customizada"}</span>
              </div>
              <div class="space-y-4">
                <div>
                  <label class="block text-[11px] font-bold text-[#0070af] uppercase mb-1.5">Pergunta</label>
                  <textarea class="w-full px-3 py-2 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold text-slate-700 dark:text-white min-h-[44px] resize-none overflow-hidden"
                    oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
                    onchange="updateBriefingQuestion('${q.id}', 'question', this.value)">${q.question}</textarea>
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-[#0070af] uppercase mb-1.5">Resposta</label>
                  <textarea class="w-full px-3 py-2 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg text-sm min-h-[100px] focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none" onchange="updateBriefingQuestion('${q.id}', 'answer', this.value)">${q.answer}</textarea>
                </div>
              </div>
            `;
            briefingContainer.appendChild(card);
          });
        }
        setTimeout(() => {
          document.querySelectorAll('#briefing-questions-container-v2 textarea').forEach(ta => {
            ta.style.height = '';
            ta.style.height = ta.scrollHeight + 'px';
          });
        }, 100);
      }

      // 3. Setup Checkboxes (Checked from handoffData.step3)
      const chkBriefing = document.getElementById('toggle-briefing');
      if (chkBriefing) {
        chkBriefing.checked = (handoffData.briefing && handoffData.briefing.questions && handoffData.briefing.questions.length > 0) || (handoffData.briefing && handoffData.briefing.enabled);
        toggleBriefingSection(chkBriefing.checked);
      }

      // 4. Equipe
      const listEquipe = document.getElementById("list-equipe");
      if (listEquipe && handoffData.step3.team) {
        listEquipe.innerHTML = "";
        handoffData.step3.team.forEach(m => addTeamMember(m.role, m.name, m.email));
      }

      // 5. Medidas & Specs
      if (handoffData.measurements) {
        lastMeasurements = handoffData.measurements;
        renderMeasurementsResults(lastMeasurements);
      }
      if (createdSpecs) {
        renderSpecsList();
      }
      if (handoffData.step2 && handoffData.step2.specs) {
        renderSpecs(handoffData.step2.specs);
        if (handoffData.step2.isAuditEnabled) {
          renderAuditSummary(handoffData.step2.specs);
        }
      }

      // 6. Audit state
      const chkAudit = document.getElementById('toggle-audit');
      if (chkAudit && handoffData.step2) {
        chkAudit.checked = !!handoffData.step2.isAuditEnabled;
        toggleAuditSection(chkAudit.checked);
        
        const refs = handoffData.step2.auditReferences || [];
        if (refs.length > 0) {
          renderAuditFilesList();
          const btn = document.getElementById('btn-perform-audit');
          if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
          }
        }
      }

      // 7. Docs Links Visibility
      if (handoffData.docs) {
        const researchField = document.getElementById("research-field");
        if (researchField && handoffData.docs.research) {
          researchField.classList.toggle("hidden", !handoffData.docs.research.checked);
        }
        const protoField = document.getElementById("proto-field");
        if (protoField && handoffData.docs.proto) {
          protoField.classList.toggle("hidden", !handoffData.docs.proto.checked);
        }
        const a11yField = document.getElementById("a11y-field");
        if (a11yField && handoffData.docs.a11y) {
          a11yField.classList.toggle("hidden", !handoffData.docs.a11y.checked);
        }
      }

      if (typeof lucide !== 'undefined') lucide.createIcons();
    }


    // Initialize version and icons
    window.addEventListener('load', () => {
      if (typeof lucide !== 'undefined') lucide.createIcons();
      
      // Signal UI is ready to receive initialization data
      parent.postMessage({ pluginMessage: { type: 'ui-ready' } }, '*');
      
      // Init Accessibility Features
      if (typeof initResizable === 'function') initResizable();
      if (handoffData && handoffData.uiScale) {
        setUiScale(handoffData.uiScale);
      }
    });

    // ── Accessibility & UX Features ─────────────────────────────
    
    // 1. Janela Redimensionável (Resizable)
    function initResizable() {
      const handle = document.getElementById('resize-handle');
      if (!handle) return;
      
      let isResizing = false;
      let startX, startY, startW, startH;
      
      handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = window.innerWidth;
        startH = window.innerHeight;

        document.body.style.cursor = 'nwse-resize';
        e.preventDefault();
      });
      
      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const newW = startW + (e.clientX - startX);
        const newH = startH + (e.clientY - startY);

        parent.postMessage({ 
          pluginMessage: { 
            type: 'resize', 
            width: Math.round(Math.max(300, newW)), 
            height: Math.round(Math.max(300, newH)) 
          } 
        }, '*');
      });
      
      window.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = 'default';
      });
    }

    // 2. Escalonamento da UI (Zoom)
    window.currentUiScale = 1;
    function setUiScale(scale) {
      window.currentUiScale = scale;
      document.documentElement.style.setProperty('--ui-scale', scale);
      
      // Adicionar classe para resposta visual no CSS
      if (scale > 1.1) {
        document.body.classList.add('scale-high');
      } else {
        document.body.classList.remove('scale-high');
      }
      
      if (typeof handoffData !== 'undefined') {
        handoffData.uiScale = scale;
        saveToStorage();
      }
    }

    function toggleUiScale() {
      const scales = [1, 1.15, 1.3, 0.9];
      let idx = scales.indexOf(window.currentUiScale);
      if (idx === -1) idx = 0;
      idx = (idx + 1) % scales.length;
      setUiScale(scales[idx]);
      
      if (typeof showToast === 'function') {
        showToast(`Escala da UI: ${Math.round(scales[idx] * 100)}%`);
      }
    }

    // Expor para o global
    window.toggleUiScale = toggleUiScale;
    window.setUiScale = setUiScale;
    window.initResizable = initResizable;

