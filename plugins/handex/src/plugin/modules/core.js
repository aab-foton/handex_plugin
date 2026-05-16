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
  step2: { specs: null, isAuditEnabled: false, auditReferenceTokens: null },
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
  handleAuditRefUpload,
  performAudit,
  exportAuditReport,
  openMeasureModal,
  openSpecFormModal,
  openFlowFormModal,
  addBriefingQuestion,
  addChecklistItem,
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
  validateEmail
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

      // Handoff FABs
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
          // Restore handoffData
          Object.assign(handoffData, msg.savedState);
          createdSpecs = handoffData.specs || [];
          restoreUIFromState();
          renderFlowsList();
        }
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

      if (msg.type === "handoff-complete") {
        const btn = document.getElementById("btn-final-ficha") || document.getElementById("btn-final-generate");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Gerar Handoff</span> <i data-lucide="zap" class="w-4 h-4"></i>';
          try { lucide.createIcons(); } catch(e) {}
        }
      }

      if (msg.type === "handoff-error") {
        const btn = document.getElementById("btn-final-ficha") || document.getElementById("btn-final-generate");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Gerar Handoff</span> <i data-lucide="zap" class="w-4 h-4"></i>';
          try { lucide.createIcons(); } catch(e) {}
        }
        alert("Erro no Figma: " + msg.message);
      }

      if (msg.type === 'annotations-added') {
        showToast(`Anotações criadas`);
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

    // Step 1: Dynamic Items
    function addDynamicItem() {
      const container = document.getElementById("dynamic-items-container");
      const id = Date.now();
      const div = document.createElement("div");
      div.className = "p-4 bg-gray-50/50 dark:bg-dark-surface/30 rounded-xl border border-gray-100 dark:border-dark-line relative group animate-in slide-in-from-top-2 duration-300";
      div.innerHTML = `
        <button onclick="this.parentElement.remove()" title="Remover item" aria-label="Remover item" class="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold text-gray-400 uppercase">Título</label>
            <input type="text" placeholder="Ex: API" class="w-full bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg px-3 py-1.5 text-[12px]" onchange="updateData('step1', 'extra_${id}_title', this.value)">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold text-gray-400 uppercase">Valor</label>
            <input type="text" placeholder="Link ou texto" class="w-full bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-lg px-3 py-1.5 text-[12px]" onchange="updateData('step1', 'extra_${id}_value', this.value)">
          </div>
        </div>
      `;
      container.appendChild(div);
      lucide.createIcons();
      autoScrollToNewItem('handoff-scroll-container');
    }

    // Step 2: Scanning & Specs
    function toggleAuditSection(checked) {
      const content = document.getElementById('audit-card-content');
      if (content) content.classList.toggle('hidden', !checked);
      handoffData.step2.isAuditEnabled = checked;
      saveToStorage();
    }

    function handleAuditRefUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          if (handoffData && handoffData.step2) {
            handoffData.step2.auditReferenceTokens = json;
            handoffData.step2.auditFilename = file.name;
            saveToStorage();
            
            // UI Feedback
            const fileDisplay = document.getElementById('audit-file-display');
            const filenameSpan = document.getElementById('audit-filename');
            const btnPerform = document.getElementById('btn-perform-audit');
            
            if (fileDisplay && filenameSpan) {
              filenameSpan.innerText = file.name;
              fileDisplay.classList.remove('hidden');
            }
            if (btnPerform) {
              btnPerform.disabled = false;
              btnPerform.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            
            showToast('Referências de auditoria importadas!');
          }
        } catch (err) {
          showToast('Erro ao ler arquivo JSON', 'error');
        }
      };
      reader.readAsText(file);
    }

    function performAudit() {
      if (!handoffData.step2.auditReferenceTokens) {
        showToast("Carregue o arquivo JSON de referência antes de realizar a auditoria.", "error");
        // Open the section if it was closed
        const content = document.getElementById('audit-card-content');
        if (content && content.classList.contains('hidden')) content.classList.remove('hidden');
        return;
      }
      const btn = document.getElementById('btn-perform-audit');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Auditando...';
      }
      lucide.createIcons();
      parent.postMessage({ pluginMessage: { type: "scan-frame", isAudit: true, referenceTokens: handoffData.step2.auditReferenceTokens } }, "*");
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

    function removeAuditReference() {
      if (handoffData && handoffData.step2) {
        handoffData.step2.auditReferenceTokens = null;
        handoffData.step2.auditFilename = null;
        saveToStorage();
        
        const fileDisplay = document.getElementById('audit-file-display');
        const filenameSpan = document.getElementById('audit-filename');
        const btnPerform = document.getElementById('btn-perform-audit');
        
        if (fileDisplay) fileDisplay.classList.add('hidden');
        if (filenameSpan) filenameSpan.innerText = '';
        if (btnPerform) {
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

    function scanFrame() {
      if (handoffData.step2.isAuditEnabled && !handoffData.step2.auditReferenceTokens) {
        showToast("Carregue o arquivo JSON de referência antes de escanear com auditoria.", "error");
        const content = document.getElementById('audit-card-content');
        if (content && content.classList.contains('hidden')) content.classList.remove('hidden');
        return;
      }

      const btn = document.getElementById("btn-scan");
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Escaneando...';
      lucide.createIcons();
      parent.postMessage({ pluginMessage: { type: "scan-frame", isAudit: handoffData.step2.isAuditEnabled, referenceTokens: handoffData.step2.auditReferenceTokens } }, "*");
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
        visBtn.className = "px-3 py-3 text-[#005ca9] hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors shrink-0 border-l border-gray-100 dark:border-dark-line";
        visBtn.innerHTML = `<i data-lucide="eye" class="w-4 h-4"></i>`;
        let isVisible = true;
        visBtn.onclick = (e) => {
          e.stopPropagation();
          isVisible = !isVisible;
          visBtn.innerHTML = isVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
          visBtn.classList.toggle("text-[#005ca9]", isVisible);
          visBtn.classList.toggle("text-gray-300", !isVisible);
          if (item.nodeId) {
            parent.postMessage({ pluginMessage: { type: 'hide-node', id: item.nodeId } }, '*');
          }
          lucide.createIcons();
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
    }


    // ── Ocultar Tudo helpers ───────────────────────────────────────
    let _measuresHidden = false;
    function toggleAllMeasuresVisibility() {
      _measuresHidden = !_measuresHidden;
      const container = document.getElementById('measurements-results');
      if (!container) return;
      const items = container.querySelectorAll('.border.rounded-xl.overflow-hidden');
      items.forEach(item => {
        // toggle visibility annotation on Figma canvas
        const nodeIdMatch = item.querySelector('[data-node-id]');
        if (nodeIdMatch) {
          parent.postMessage({ pluginMessage: { type: _measuresHidden ? 'hide-node' : 'show-node', id: nodeIdMatch.dataset.nodeId } }, '*');
        }
      });
      const btn = document.getElementById('btn-hide-all-measures');
      if (btn) {
        btn.innerHTML = _measuresHidden
          ? '<i data-lucide="eye" class="w-3.5 h-3.5"></i> Mostrar tudo'
          : '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i> Ocultar tudo';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }

    let _specsHidden = false;
    function toggleAllSpecsVisibility() {
      _specsHidden = !_specsHidden;
      const container = document.getElementById('specs-results');
      if (!container) return;
      const cards = container.querySelectorAll('[data-spec-id]');
      cards.forEach(card => {
        const nodeId = card.dataset.nodeId;
        if (nodeId) {
          parent.postMessage({ pluginMessage: { type: _specsHidden ? 'hide-node' : 'show-node', id: nodeId } }, '*');
        }
      });
      const btn = document.getElementById('btn-hide-all-specs');
      if (btn) {
        btn.innerHTML = _specsHidden
          ? '<i data-lucide="eye" class="w-3.5 h-3.5"></i> Mostrar tudo'
          : '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i> Ocultar tudo';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }

    function createAccordionSection(section) {
      const div = document.createElement("div");
      div.className = "mb-3 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl overflow-hidden shadow-sm";

      const count = section.items.length;
      
      let issuesCount = 0;
      let adjustmentsCount = 0;

      if (handoffData.step2.isAuditEnabled) {
        section.items.forEach(item => {
           if (item.properties && item.properties.length > 0) {
             const totalProps = item.properties.length;
             const irregulars = item.properties.filter(p => p.isDS === false).length;
             
             if (irregulars === 0) {
               item.componentStatus = "ok";
             } else {
               // Refined User Rule:
               // 1. If total < 3 properties, any error makes it "Fora do Padrão" (Red)
               // 2. If total >= 3 properties:
               //    - If irregulars is a minority (e.g. 1 in 3, 1 in 4, 2 in 5 -> roughly < 50%), it's an "Ajuste" (Yellow)
               //    - Otherwise it's "Fora do Padrão" (Red)
               
               if (totalProps < 3) {
                 issuesCount++;
                 item.componentStatus = "error";
               } else {
                 // Threshold for "Ajuste": less than half the properties are wrong
                 if (irregulars < (totalProps / 2)) {
                   adjustmentsCount++;
                   item.componentStatus = "warning";
                 } else {
                   issuesCount++;
                   item.componentStatus = "error";
                 }
               }
             }
           } else {
             // For items without specific audit properties (like some icons or frames)
             if (item.isDS === false) {
               issuesCount++;
               item.componentStatus = "error";
             } else if (item.isDS === "warning") {
               adjustmentsCount++;
               item.componentStatus = "warning";
             } else {
               item.componentStatus = "ok";
             }
           }
        });
      }

      const issuesBadge = issuesCount > 0 ? `<span class="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 text-[10px] font-bold">${issuesCount} Irregulares</span>` : "";
      const adjustmentsBadge = adjustmentsCount > 0 ? `<span class="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-500 text-[10px] font-bold">${adjustmentsCount} Ajustes</span>` : "";
      const badges = (issuesBadge || adjustmentsBadge) ? `<div class="flex gap-1.5">${issuesBadge}${adjustmentsBadge}</div>` : "";

      const SEARCH_THRESHOLD = 10;
      const showSearch = count > SEARCH_THRESHOLD;
      const uid = `${section.type}-${Math.random().toString(36).slice(2, 8)}`;
      const searchId = `search-${uid}`;
      const gridId = `grid-${uid}`;
      const emptyId = `empty-${uid}`;

      const searchHtml = showSearch ? `
        <div class="px-3 pb-2 pt-3 border-b border-gray-50 dark:border-dark-line">
          <div class="relative">
            <i data-lucide="search" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none"></i>
            <input
              id="${searchId}"
              type="text"
              placeholder="Buscar em ${section.title}..."
              class="w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-line rounded-lg text-[11px] text-slate-700 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-[#0070af]/30 focus:border-[#0070af] transition-all"
              oninput="filterSpecItems('${gridId}', '${emptyId}', this.value)"
            />
          </div>
        </div>
      ` : "";

      div.innerHTML = `
        <button onclick="toggleAccordion(this)" title="Expandir/Recolher" aria-label="Expandir seção" class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-[#0070af] dark:text-blue-400">
              <i data-lucide="${section.icon}" class="w-4 h-4"></i>
            </div>
            <div class="text-left">
              <div class="flex items-center gap-2">
                <p class="text-[13px] font-bold text-slate-800 dark:text-white">${section.title}</p>
                ${badges}
              </div>
              <p class="text-[10px] text-gray-400">${count} elementos encontrados</p>
            </div>
          </div>
          <i data-lucide="chevron-down" class="w-4 h-4 text-gray-300 transition-transform"></i>
        </button>
        <div data-accordion-content class="accordion-content hidden border-t border-gray-50 dark:border-dark-line">
          ${searchHtml}
          <div id="${gridId}" class="p-2 grid grid-cols-2 gap-2">
            ${section.items.map(item => `<div class="spec-item-wrapper col-span-2" data-name="${(item.name || '').toLowerCase().replace(/"/g, '&quot;')}">${createSpecItem(item, section.type)}</div>`).join("")}
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

      const term = (query || '').toLowerCase().trim();
      const wrappers = grid.querySelectorAll('.spec-item-wrapper');
      let visible = 0;

      wrappers.forEach(wrapper => {
        const name = wrapper.getAttribute('data-name') || '';
        const match = !term || name.includes(term);
        wrapper.style.display = match ? '' : 'none';
        if (match) visible++;
      });

      if (emptyMsg) {
        emptyMsg.classList.toggle('hidden', visible > 0 || !term);
      }
    }
    window.filterSpecItems = filterSpecItems;


    function createSpecItem(item, type) {
      let preview = "";
      if (item.preview) {
        const base64 = bytesToBase64(item.preview);
        preview = `<img src="data:image/png;base64,${base64}" class="w-8 h-8 object-contain bg-gray-50 dark:bg-dark-bg rounded p-1" />`;
      } else {
        const iconName = type === "components" ? "box" : type === "icons" ? "image" : type === "typography" ? "type" : type === "frames" ? "layout" : "pen-tool";
        preview = `<div class="w-8 h-8 flex items-center justify-center bg-gray-50 dark:bg-dark-bg rounded text-gray-300"><i data-lucide="${iconName}" class="w-4 h-4"></i></div>`;
      }

      // Use the calculated componentStatus
      const status = item.componentStatus || (item.isDS === true ? "ok" : (item.isDS === "warning" ? "warning" : "error"));

      const dsStatus = handoffData.step2.isAuditEnabled ? (status === "ok" ?
        `<span class="flex items-center gap-1 text-[#10b981]"><i data-lucide="check-circle" class="w-2.5 h-2.5"></i>DSC</span>` :
        (status === "warning" ? 
          `<span class="flex items-center gap-1 text-amber-500 font-bold"><i data-lucide="help-circle" class="w-2.5 h-2.5"></i>AJUSTES</span>` :
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

      Object.keys(data).forEach(cat => {
        if (cat === "frameJson") return;
        if (Array.isArray(data[cat])) {
          data[cat].forEach(element => {
            if (element.properties && element.properties.length > 0) {
              const totalProps = element.properties.length;
              const irregulars = element.properties.filter(p => p.isDS === false).length;

              // Consistency Rule:
              // - If total < 3: any error is an issue (Red)
              // - If total >= 3: errors < 50% is adjustment (Yellow), else issue (Red)
              const isAdjustmentGroup = (totalProps >= 3 && irregulars > 0 && irregulars < (totalProps / 2));

              element.properties.forEach(p => {
                total++;
                if (p.isDS === true) {
                  dsCount++;
                } else if (isAdjustmentGroup || p.isDS === "warning") {
                  adjustments.push({ cat: cat.toUpperCase(), name: `${element.name} -> ${p.name}` });
                } else {
                  issues.push({ cat: cat.toUpperCase(), name: `${element.name} -> ${p.name}` });
                }
              });
            } else if (cat === "components" || cat === "icons") {
              total++;
              if (element.isDS === true) dsCount++;
              else if (element.isDS === "warning") adjustments.push({ cat: cat.toUpperCase(), name: element.name });
              else issues.push({ cat: cat.toUpperCase(), name: element.name });
            }
          });
        }
      });

      return {
        total,
        dsCount,
        adoption: total > 0 ? Math.round((dsCount / total) * 100) : 0,
        issues,
        adjustments
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
            <p class="text-[9px] text-slate-500 dark:text-slate-400">Irregulares</p>
            <p class="text-[13px] font-bold text-red-500">${issues.length}</p>
          </div>
          <div class="bg-white/50 dark:bg-black/20 p-2 rounded-xl">
            <p class="text-[9px] text-slate-500 dark:text-slate-400">Ajustes</p>
            <p class="text-[13px] font-bold text-amber-500">${adjustments.length}</p>
          </div>
        </div>

        ${issues.length > 0 ? `
          <div class="flex items-center gap-2 text-red-500 text-[11px] font-bold py-2">
            <i data-lucide="alert-circle" class="w-4 h-4"></i>
            <span>Itens Fora do Padrão detectados</span>
          </div>
        ` : (adjustments.length > 0 ? `
           <div class="flex items-center gap-2 text-amber-500 text-[11px] font-bold py-2">
            <i data-lucide="help-circle" class="w-4 h-4"></i>
            <span>Existem ajustes leves pendentes</span>
          </div>
        ` : `
          <div class="flex items-center gap-2 text-[#10b981] text-[11px] font-bold py-2">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Parabéns! Design 100% aderente ao padrão.</span>
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
      Object.keys(handoffData.step3).forEach(key => {
        if (key.startsWith("excecao-") && key.endsWith("_title")) {
          const id = key.replace("_title", "");
          excecoes.push({
            title: handoffData.step3[`${id}_title`] || "Sem título",
            link: handoffData.step3[`${id}_link`] || "#",
            notes: handoffData.step3[`${id}_notes`] || "",
            type: handoffData.step3[`${id}_type`] || "Geral"
          });
        }
        if (key.startsWith("regras-") && key.endsWith("_link")) {
          const id = key.replace("_link", "");
          regras.push({
            link: handoffData.step3[`${id}_link`] || "#",
            notes: handoffData.step3[`${id}_notes`] || ""
          });
        }
      });

      handoffData.excecoes = excecoes;
      handoffData.regras = regras;

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

    function generateTechnicalSheet() {
      const btn = document.getElementById("btn-final-ficha");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span>Gerando Ficha...</span>';
      }
      lucide.createIcons();

      collectHandoffData();

      // Automatic Versioning
      const s1Versao = document.getElementById("s1-versao");
      if (s1Versao) {
        const newV = incrementVersion(s1Versao.value);
        s1Versao.value = newV;
        handoffData.step1.versao = newV;
      }

      // Get setup options from UI
      const g = id => document.getElementById(id);
      handoffData.setup = {
        incluirBriefing: g("setup-briefing") ? g("setup-briefing").checked : true,
        ficha: g("setup-ficha") ? g("setup-ficha").checked : true,
        componentes: g("setup-specs") ? g("setup-specs").checked : true,
        checklist: g("setup-checklist") ? g("setup-checklist").checked : true
      };

      parent.postMessage({ 
        pluginMessage: { 
          type: "create-handoff", 
          data: {
            ...handoffData,
            isAudit: handoffData.step2.isAuditEnabled,
            auditSummary: handoffData.step2.isAuditEnabled ? getAuditSummary(lastAuditResults) : null
          } 
        } 
      }, "*");

      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Gerar Ficha Técnica</span> <i data-lucide="layout" class="w-4 h-4"></i>';
          lucide.createIcons();
        }
      }, 1000);
    }

    function exportHandoff() {
      const btn = document.getElementById("btn-final-export");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span>Exportando...</span>';
      }
      lucide.createIcons();

      collectHandoffData();

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
        const safeName = handoffData.step1.fluxo ? handoffData.step1.fluxo.replace(/\s+/g, '_') : 'handoff';
        zip.file(safeName + ".md", mdContent);
        zip.file(safeName + ".pdf", pdfBlob);

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
          } catch (e) {
            console.error("Erro no download:", e);
          }
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Exportar Handoff</span> <i data-lucide="download" class="w-4 h-4"></i>';
            lucide.createIcons();
          }
        }).catch(err => {
          console.error("ZIP Generation error", err);
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Exportar Handoff</span> <i data-lucide="download" class="w-4 h-4"></i>';
            lucide.createIcons();
          }
        });
      } catch (err) {
        console.error("PDF/ZIP setup error", err);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Exportar Handoff</span> <i data-lucide="download" class="w-4 h-4"></i>';
          lucide.createIcons();
        }
      }
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

          const saveNewName = () => {
            const newVal = input.value.trim() || `Grupo Tag ${letter}`;
            if (!handoffData.tagNames) handoffData.tagNames = {};
            handoffData.tagNames[letter] = newVal;
            saveToStorage();
            renderSpecsList();
          };

          input.onblur = saveNewName;
          input.onkeydown = (ev) => {
            if (ev.key === 'Enter') saveNewName();
            if (ev.key === 'Escape') renderSpecsList();
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
        groupVisBtn.className = "p-2 text-[#005ca9] hover:bg-white/50 dark:hover:bg-slate-700 rounded-lg transition-colors";
        let groupVisible = true;
        groupVisBtn.innerHTML = `<i data-lucide="eye" class="w-4 h-4"></i>`;
        groupVisBtn.onclick = (e) => {
          e.stopPropagation();
          groupVisible = !groupVisible;
          groupVisBtn.innerHTML = groupVisible ? `<i data-lucide="eye" class="w-4 h-4"></i>` : `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
          groupVisBtn.classList.toggle('text-gray-400', !groupVisible);
          
          // Ocultar/Exibir todos os itens do grupo
          specs.forEach(s => {
            if (s.id) {
              parent.postMessage({ pluginMessage: { type: 'hide-node', id: s.id, forceState: groupVisible } }, '*');
            }
          });
          lucide.createIcons();
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
          visBtn.className = "p-2.5 text-[#005ca9] hover:bg-blue-50 dark:hover:bg-slate-600 transition-colors";
          let isVisible = true;
          visBtn.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5"></i>`;
          visBtn.onclick = (e) => {
            e.stopPropagation();
            isVisible = !isVisible;
            visBtn.innerHTML = isVisible ? `<i data-lucide="eye" class="w-3.5 h-3.5"></i>` : `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`;
            visBtn.classList.toggle("text-[#005ca9]", isVisible);
            visBtn.classList.toggle("text-gray-300", !isVisible);
            parent.postMessage({ pluginMessage: { type: 'hide-node', id: spec.id, forceState: isVisible } }, '*');
            lucide.createIcons();
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

      // 6. Audit state
      const chkAudit = document.getElementById('toggle-audit');
      if (chkAudit && handoffData.step2) {
        chkAudit.checked = !!handoffData.step2.isAuditEnabled;
        toggleAuditSection(chkAudit.checked);
        
        if (handoffData.step2.auditReferenceTokens) {
          const btn = document.getElementById('btn-perform-audit');
          if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
          }
        }
      }

      // 7. Docs Links Visibility
      const researchField = document.getElementById("research-field");
      if (researchField) researchField.classList.toggle("hidden", !handoffData.docs.research.checked);
      const protoField = document.getElementById("proto-field");
      if (protoField) protoField.classList.toggle("hidden", !handoffData.docs.proto.checked);
      const a11yField = document.getElementById("a11y-field");
      if (a11yField) a11yField.classList.toggle("hidden", !handoffData.docs.a11y.checked);

      // 8. Audit File Display
      if (handoffData.step2.auditFilename) {
        const fileDisplay = document.getElementById('audit-file-display');
        const filenameSpan = document.getElementById('audit-filename');
        const btnPerform = document.getElementById('btn-perform-audit');
        
        if (fileDisplay && filenameSpan) {
          filenameSpan.innerText = handoffData.step2.auditFilename;
          fileDisplay.classList.remove('hidden');
        }
        if (btnPerform) {
          btnPerform.disabled = false;
          btnPerform.classList.remove('opacity-50', 'cursor-not-allowed');
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

