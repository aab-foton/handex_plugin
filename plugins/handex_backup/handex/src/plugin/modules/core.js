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
  step1: { files: [], versao: "v1.0", gerente: "", gerenteEmail: "" },
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
  _activateAuditSection,
  resetAuditCache,
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
  createHandoffOnCanvas,
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
  toggleUiScale,
  clearPluginCache
});

function clearPluginCache() {
  const confirmed = window.confirm(
    'Limpar todo o cache do plugin?\n\nIsso removerá: formulário, scan, auditoria, medidas, fluxos e histórico de versões.\n\nEssa ação não pode ser desfeita.'
  );
  if (!confirmed) return;
  parent.postMessage({ pluginMessage: { type: 'clear-cache' } }, '*');
}

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
      if (!v) return 'v1.1';
      // Two-segment versioning: vX.Y
      const match = v.match(/v?(\d+)\.(\d+)/);
      if (!match) return v + '.1';
      const major = parseInt(match[1]);
      const minor = parseInt(match[2]);
      return `v${major}.${minor + 1}`;
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


    // restoreUIFromState (canonical version) is defined below at the end of the module.




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
      const s1GerenteEmail = document.getElementById("s1-gerente-email");
      if (s1GerenteEmail) s1GerenteEmail.value = handoffData.step1.gerenteEmail || "";

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

