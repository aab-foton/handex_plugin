import { exportToZip } from './utils/zipExporter';

const themeToggleBtn = document.getElementById('theme-toggle') as HTMLButtonElement;
const htmlElement = document.documentElement;

themeToggleBtn.addEventListener('click', () => {
  htmlElement.classList.toggle('figma-dark');
});

// Tab Logic
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Styling buttons
    tabBtns.forEach(b => {
      b.classList.remove('text-blue-600', 'border-blue-600');
      b.classList.add('text-zinc-400', 'dark:text-zinc-500', 'border-transparent');
    });
    btn.classList.add('text-blue-600', 'border-blue-600');
    btn.classList.remove('text-zinc-400', 'dark:text-zinc-500', 'border-transparent');

    // Toggling panes
    const target = btn.getAttribute('data-target');
    tabPanes.forEach(pane => {
      if (pane.id === target) {
        pane.classList.remove('hidden');
        pane.classList.add('flex');
      } else {
        pane.classList.add('hidden');
        pane.classList.remove('flex');
      }
    });
  });
});

// Config Logic
const geminiInput = document.getElementById('gemini-key') as HTMLInputElement;
const btnSaveGemini = document.getElementById('btn-save-gemini');

btnSaveGemini?.addEventListener('click', () => {
  const key = geminiInput.value.trim();
  parent.postMessage({ pluginMessage: { type: 'save-gemini-key', key } }, '*');
  const ogText = btnSaveGemini.innerText;
  btnSaveGemini.innerText = 'Salvo!';
  setTimeout(() => { btnSaveGemini.innerText = ogText; }, 2000);
});

const repoTypeSelect = document.getElementById('repoType') as HTMLSelectElement;
repoTypeSelect.addEventListener('change', () => {});

const viewInitial = document.getElementById('view-initial')!;
const viewPages = document.getElementById('view-pages')!;
const viewLoading = document.getElementById('view-loading')!;
const viewReport = document.getElementById('view-report')!;
const pagesListContainer = document.getElementById('pages-list')!;
const accordionsContainer = document.getElementById('accordions')!;
const loadingText = document.getElementById('loading-text')!;
const reportTitle = document.getElementById('report-title')!;

let projectData: any = null;
let selectedPageIds: string[] = [];
let attachedFiles: File[] = [];
let finalAiTextDump = '';

document.getElementById('projectFiles')?.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.files) {
    Array.from(target.files).forEach(file => attachedFiles.push(file));
  }
  renderFileList();
  target.value = ''; // reset so same files can be added if deleted
});

function renderFileList() {
  const container = document.getElementById('file-list');
  if (!container) return;
  container.innerHTML = attachedFiles.map((file, idx) => `
    <div class="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-2 rounded-lg">
      <span class="text-xs text-zinc-600 dark:text-zinc-300 truncate pr-2">${file.name}</span>
      <button onclick="window.removeAttachedFile(${idx})" class="text-red-500 hover:text-red-600 transition-colors" title="Excluir">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    </div>
  `).join('');
}

(window as any).removeAttachedFile = (idx: number) => {
  attachedFiles.splice(idx, 1);
  renderFileList();
};

// ======= IA CHAT STATE E LOGIC =======
let pendingUserPrompt = '';
let currentAiLoadingBubble: HTMLElement | null = null;
let selectedPersona = 'designer';

const chatForm = document.getElementById('ia-chat-form') as HTMLFormElement;
const chatInput = document.getElementById('ia-message-input') as HTMLTextAreaElement;
const chatHistoryContainer = document.getElementById('ia-chat-history')!;
const personaSelect = document.getElementById('ia-persona') as HTMLSelectElement;

personaSelect?.addEventListener('change', (e) => {
  selectedPersona = (e.target as HTMLSelectElement).value;
});

chatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

chatForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const key = geminiInput.value.trim();
  if (!key) {
    alert("Vá na aba 'Configs' e insira sua chave da API do Google Gemini antes de usar o Assistente.");
    return;
  }

  // Add User message
  addChatBubble(text, 'user');
  chatInput.value = '';
  pendingUserPrompt = text;

  // Add Loading Bubble
  currentAiLoadingBubble = addChatBubble('', 'ai', true);
  
  // Ask backend for context (image + tokens)
  parent.postMessage({ pluginMessage: { type: 'generate-ai-context' } }, '*');
});

function addChatBubble(text: string, sender: 'user' | 'ai', isLoading = false) {
  const bubble = document.createElement('div');
  
  if (sender === 'user') {
    bubble.className = "flex flex-col gap-1 items-start bg-zinc-100 dark:bg-zinc-800 p-3 rounded-xl rounded-tr-sm self-end max-w-[90%] border border-zinc-200 dark:border-zinc-700";
    bubble.innerHTML = `
      <span class="text-[10px] font-bold text-zinc-500 uppercase">Você</span>
      <p class="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed break-words">${escapeHtml(text)}</p>
    `;
  } else {
    bubble.className = "flex flex-col gap-1 items-start bg-blue-50 dark:bg-blue-900/10 p-3 rounded-xl rounded-tl-sm self-start max-w-[90%] border border-blue-100 dark:border-blue-900/30";
    if (isLoading) {
      bubble.innerHTML = `
        <span class="text-[10px] font-bold text-blue-800 dark:text-blue-400">Assistente IA</span>
        <div class="flex gap-1 py-1 text-blue-600 dark:text-blue-400">
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <span class="text-xs ml-1">Analisando o projeto no Figma...</span>
        </div>
      `;
    } else {
      bubble.innerHTML = `
        <span class="text-[10px] font-bold text-blue-800 dark:text-blue-400">Assistente IA</span>
        <div class="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed markdown-body w-full overflow-x-auto">
          ${formatMarkdownSimple(text)}
        </div>
      `;
    }
  }

  chatHistoryContainer.appendChild(bubble);
  chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
  return bubble;
}

function escapeHtml(unsafe: string) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMarkdownSimple(md: string) {
  let html = md;
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Lists
  html = html.replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');
  // Headers (h3)
  html = html.replace(/^### (.*$)/gim, '<h3 class="font-bold mt-2 mb-1 text-sm">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="font-bold mt-3 mb-1 text-sm border-b border-zinc-200 dark:border-zinc-700 pb-1">$1</h2>');
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-zinc-100 dark:bg-zinc-950 p-2 rounded text-zinc-800 dark:text-zinc-300 font-mono text-[10px] my-1 overflow-x-auto border border-zinc-200 dark:border-zinc-800"><code>$1</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-zinc-100 dark:bg-zinc-800 text-pink-600 dark:text-pink-400 px-1 py-0.5 rounded text-[11px]">$1</code>');
  // Line breaks
  html = html.replace(/\n\n/g, '<br><br>');
  return html;
}

async function geminiFetch(apiKey: string, promptText: string, persona: string, textContext: string, images: any[]) {
  const modelName = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const promptMap: Record<string, string> = {
    'designer': "Você é um UX/UI Designer Sênior avaliando telas figma da CAIXA. Foco em usabilidade, consistência visual e alinhamento do design system.",
    'dev': "Você é um Dev Front-end Especialista. Foco em traduzir essas telas e tokens matemáticos em diretrizes claras de código (arquitetura CSS, variáveis).",
    'software-architect': "Você é um Arquiteto de Software Sênior. Foco na componentização e estruturação dos dados em alto nível e microsserviços deduzidos a partir do front-end.",
    'po': "Você é um Product Owner Sênior. Foco em derivar fluxos lógicos e regras de negócio/histórias de usuário.",
    'research': "Você é um Especialista em UX Research. Foco em atritos no fluxo, viés cognitivo e acessibilidade.",
    'ux-writing': "Você é um Especialista Sênior em UX Writing. Foco no tom de voz, clareza, concisão e adequação dos microtextos ao usuário padrão da CAIXA.",
    'accessibility': "Você é um Especialista Sênior em Acessibilidade (a11y). Foco no contraste, hierarquia, leitores de tela e padrões WCAG."
  };

  const sysText = promptMap[persona] || "Você é um IA Assistente de Inteligência.";

  const parts: any[] = [];
  parts.push({ text: `[CONTEXTO TÉCNICO ENVIADO PELO PLUGIN]\n${textContext}\n\n[PERGUNTA DO USUÁRIO (Sua Ordem)]\n${promptText}` });

  for (const img of images) {
    parts.push({ inlineData: { mimeType: "image/png", data: img.base64 } });
  }

  parts.unshift({ text: `[INSTRUÇÃO DE SISTEMA/PERSONA]\n${sysText} Responda sempre em Português-BR (formato Markdown).\n\n` });

  const payload = {
    contents: [{ role: "user", parts }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.json();
    let errorMsg = err.error?.message || 'Erro na API do Google.';
    
    // Tenta puxar a lista de modelos suportados pela chave do usuário
    try {
      const listReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (listReq.ok) {
        const listRes = await listReq.json();
        const availableModels = listRes.models
          ?.map((m: any) => m.name.replace('models/', ''))
          .filter((n: string) => n.includes('gemini') && !n.includes('vision'))
          .slice(0, 5)
          .join(', ');
        errorMsg += `\nModelos Pemitidos na sua chave: ${availableModels || 'Nenhum'}`;
      }
    } catch(e) {}
    
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return rawText || 'Sem resposta detectada.';
}

// Custom file picker button triggers hidden input
document.getElementById('btn-pick-files')?.addEventListener('click', () => {
  document.getElementById('projectFiles')?.click();
});

  const footerIntro = document.getElementById('footer-intro')!;
  const footerSelection = document.getElementById('footer-selection')!;
  const footerLoading = document.getElementById('footer-loading')!;
  const footerReport = document.getElementById('footer-report')!;

  function showView(viewId: string) {
    // Hide all views
    viewInitial.classList.add('hidden');
    viewPages.classList.add('hidden');
    viewLoading.classList.add('hidden');
    viewReport.classList.add('hidden');

    // Hide all footer sections
    footerIntro.classList.add('hidden');
    footerSelection.classList.add('hidden');
    footerLoading.classList.add('hidden');
    footerReport.classList.add('hidden');

    // Show target view
    const targetView = document.getElementById(viewId)!;
    targetView.classList.remove('hidden');
    targetView.classList.add('flex');

    // Show target footer
    if (viewId === 'view-initial') footerIntro.classList.remove('hidden');
    if (viewId === 'view-pages') footerSelection.classList.remove('hidden');
    if (viewId === 'view-loading') footerLoading.classList.remove('hidden');
    if (viewId === 'view-report') footerReport.classList.remove('hidden');
  }

  // Initial State
  showView('view-initial');

  document.getElementById('btn-map-pages-footer')!.onclick = () => {
    loadingText.innerText = 'Mapeando páginas...';
    showView('view-loading');
    parent.postMessage({ pluginMessage: { type: 'get-pages' } }, '*');
  };

const btnOpenExtractModal = document.getElementById('btn-open-extract-modal') as HTMLButtonElement;
const modalExtraction = document.getElementById('modal-extraction')!;
const btnCloseExtractModal = document.getElementById('btn-close-extract-modal')!;
const btnStartScan = document.getElementById('btn-start-scan') as HTMLButtonElement;

btnOpenExtractModal.onclick = () => {
  modalExtraction.classList.remove('hidden');
  modalExtraction.classList.add('flex');
};

btnCloseExtractModal.onclick = () => {
  modalExtraction.classList.add('hidden');
  modalExtraction.classList.remove('flex');
};

const getExtractionChoices = () => ({
  screens: (document.getElementById('extract-screens') as HTMLInputElement).checked,
  tokens: (document.getElementById('extract-tokens') as HTMLInputElement).checked,
  context: (document.getElementById('extract-context') as HTMLInputElement).checked,
  specs: (document.getElementById('extract-specs') as HTMLInputElement).checked,
});

// --- Toggle de Anexos ---
const toggleAttachments = document.getElementById('toggle-attachments') as HTMLInputElement;
const sectionAttachments = document.getElementById('section-attachments')!;

toggleAttachments.onchange = () => {
  if (toggleAttachments.checked) {
    sectionAttachments.classList.remove('hidden');
    sectionAttachments.classList.add('flex');
  } else {
    sectionAttachments.classList.add('hidden');
    sectionAttachments.classList.remove('flex');
    // Limpa arquivos se desabilitar? Melhor não para não perder progresso acidental
  }
};

// --- Modal de Instruções IA ---
const modalInstructions = document.getElementById('modal-instructions')!;
const btnShowInstructions = document.getElementById('btn-show-instructions')!;
const btnCloseInstructions = document.getElementById('btn-close-instructions')!;
const btnUnderstandInstructions = document.getElementById('btn-understand-instructions')!;

const showInstructions = () => {
  modalInstructions.classList.remove('hidden');
  modalInstructions.classList.add('flex');
};

const hideInstructions = () => {
  modalInstructions.classList.add('hidden');
  modalInstructions.classList.remove('flex');
};

btnShowInstructions.onclick = showInstructions;
btnCloseInstructions.onclick = hideInstructions;
btnUnderstandInstructions.onclick = hideInstructions;
modalInstructions.onclick = (e) => { if (e.target === modalInstructions) hideInstructions(); };

const startScan = () => {
  const checkboxes = pagesListContainer.querySelectorAll('input[type="checkbox"]:checked') as NodeListOf<HTMLInputElement>;
  selectedPageIds = Array.from(checkboxes).map(cb => cb.value);
  
  if (selectedPageIds.length === 0) {
    alert('Selecione pelo menos uma página para extração.');
    return;
  }

  modalExtraction.classList.add('hidden');
  modalExtraction.classList.remove('flex');
  
    loadingText.innerText = 'Iniciando extração detalhada...';
    showView('view-loading');
    parent.postMessage({ pluginMessage: { type: 'scan-project', selectedPageIds } }, '*');
  };

btnStartScan.onclick = startScan;

// --- Atualiza visibilidade do botão Extrair ---
  function updateScanButton() {
    const checked = pagesListContainer.querySelectorAll('input[type="checkbox"]:checked').length;
    if (checked > 0) {
      btnOpenExtractModal.classList.remove('hidden');
    } else {
      btnOpenExtractModal.classList.add('hidden');
    }
  }

document.getElementById('btn-select-all')!.onclick = () => {
  pagesListContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb as HTMLInputElement).checked = true);
  updateScanButton();
};

document.getElementById('btn-select-none')!.onclick = () => {
  pagesListContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb as HTMLInputElement).checked = false);
  updateScanButton();
};

// --- Busca/Filtro de Páginas ---
document.getElementById('input-search-pages')?.addEventListener('input', (e) => {
  const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
  pagesListContainer.querySelectorAll<HTMLLabelElement>('label').forEach(label => {
    const name = label.textContent?.toLowerCase() || '';
    label.style.display = name.includes(query) ? '' : 'none';
  });
});

// --- Botão Voltar ao Topo ---
const tabExtrator = document.getElementById('tab-extrator')!;
const btnBackToTop = document.getElementById('btn-back-to-top') as HTMLButtonElement;
tabExtrator?.addEventListener('scroll', () => {
  if (tabExtrator.scrollTop > 120) {
    btnBackToTop.classList.remove('hidden');
    btnBackToTop.classList.add('flex');
  } else {
    btnBackToTop.classList.add('hidden');
    btnBackToTop.classList.remove('flex');
  }
});
btnBackToTop?.addEventListener('click', () => {
  tabExtrator.scrollTo({ top: 0, behavior: 'smooth' });
});

function createAccordion(title: string, contentHtml: string) {
  const id = Math.random().toString(36).substr(2, 9);
  return `
    <div class="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-800/30">
      <button class="w-full p-3 flex justify-between items-center text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onclick="window.toggleAccordion('${id}')">
        <span class="font-medium text-sm">${title}</span>
        <svg id="icon-${id}" class="w-4 h-4 accordion-icon text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
      </button>
      <div id="content-${id}" class="accordion-content bg-white dark:bg-zinc-900 px-3">
        <div class="py-3 text-sm flex flex-col gap-2">
          ${contentHtml}
        </div>
      </div>
    </div>
  `;
}

(window as any).toggleAccordion = (id: string) => {
  const content = document.getElementById(`content-${id}`)!;
  const icon = document.getElementById(`icon-${id}`)!;
  content.classList.toggle('open');
  icon.classList.toggle('open');
};

function performExport() {
  const choices = getExtractionChoices();
  const format = (document.getElementById('exportFormat') as HTMLSelectElement).value;
  
  viewReport.classList.add('hidden');
  viewReport.classList.remove('flex');
  viewLoading.classList.remove('hidden');
  viewLoading.classList.add('flex');
  
  if (choices.screens) {
    loadingText.innerText = 'Preparando exportação das telas...';
    parent.postMessage({ pluginMessage: { type: 'export-pages', format, selectedPageIds } }, '*');
  } else {
    // If no screens, go straight to zip
    loadingText.innerText = 'Gerando pacote de arquivos...';
    // Small delay to show loading
    setTimeout(async () => {
      const repoType = (document.getElementById('repoType') as HTMLSelectElement).value;
      await exportToZip(projectData, [], finalAiTextDump, attachedFiles, repoType, choices);
      
      viewLoading.classList.add('hidden');
      viewLoading.classList.remove('flex');
      viewReport.classList.remove('hidden');
      viewReport.classList.add('flex');
    }, 500);
  }
}

document.getElementById('btn-copy-context')!.onclick = () => {
  if (!finalAiTextDump) {
    alert('Nenhum contexto disponível. Execute a extração primeiro.');
    return;
  }
  const textarea = document.getElementById('context-preview') as HTMLTextAreaElement;
  textarea.value = finalAiTextDump;
  textarea.select();
  const success = document.execCommand('copy');
  const label = document.getElementById('btn-copy-label')!;
  if (success) {
    label.innerText = '✓ Copiado!';
    setTimeout(() => { label.innerText = 'Copiar Contexto'; }, 2000);
  } else {
    label.innerText = 'Selecione o texto acima e Ctrl+C';
    setTimeout(() => { label.innerText = 'Copiar Contexto'; }, 3000);
  }
};

document.getElementById('btn-export')!.onclick = async () => {
  if (!projectData) return;
  performExport();
};

document.getElementById('btn-back-to-selection')!.onclick = () => {
  showView('view-pages');
};

document.getElementById('btn-back-to-intro')!.onclick = () => {
  showView('view-initial');
};

document.getElementById('btn-cancel-loading')!.onclick = () => {
  if (loadingText.innerText.includes('Mapeando')) {
    showView('view-initial');
  } else {
    showView('view-pages');
  }
};

onmessage = async (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;
  
  if (msg.type === 'init-gemini-key') {
    geminiInput.value = msg.key;
  }

  if (msg.type === 'selection-changed') {
    const statusEl = document.getElementById('ia-selection-status');
    if (statusEl) {
      if (msg.count === 0) {
        statusEl.innerText = '0 Selecionados (Contexto Geral)';
        statusEl.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400';
      } else {
        statusEl.innerText = `${msg.count} Selecionado${msg.count > 1 ? 's' : ''}`;
        statusEl.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      }
    }
  }

  if (msg.type === 'ai-context-error') {
     if (currentAiLoadingBubble) {
       currentAiLoadingBubble.outerHTML = '';
       addChatBubble(`❌ Erro: ${msg.message}`, 'ai');
       currentAiLoadingBubble = null;
     }
  }

  if (msg.type === 'ai-context-ready') {
    const key = geminiInput.value.trim();
    try {
      if (currentAiLoadingBubble) {
         currentAiLoadingBubble.querySelector('span:last-child')!.textContent = 'Consultando Cérebro Gemini...';
      }
      
      const responseMd = await geminiFetch(key, pendingUserPrompt, selectedPersona, msg.textDump, msg.images);
      
      if (currentAiLoadingBubble) {
        currentAiLoadingBubble.outerHTML = '';
        addChatBubble(responseMd, 'ai');
        currentAiLoadingBubble = null;
      }
    } catch (err: any) {
      if (currentAiLoadingBubble) {
        currentAiLoadingBubble.outerHTML = '';
        addChatBubble(`⚠️ **Falha de Conexão com API Gemini:**\n${err.message}`, 'ai');
        currentAiLoadingBubble = null;
      }
    }
  }

  if (msg.type === 'log') {
    loadingText.innerText = msg.message;
  }
  
  if (msg.type === 'pages-list') {
    pagesListContainer.innerHTML = msg.pages.map((page: any) => `
      <label class="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
        <input type="checkbox" value="${page.id}" checked class="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500">
        <span class="text-sm font-medium truncate">${page.name}</span>
      </label>
    `).join('');
    
    // Wires individual checkbox changes to show/hide Extrair button
    pagesListContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', updateScanButton);
    });
    updateScanButton(); // all checked by default → show button immediately
    
    showView('view-pages');
  }

  if (msg.type === 'scan-complete') {
    const choices = getExtractionChoices();
    projectData = msg.data;
    reportTitle.innerText = projectData.title;

    // Esconde formato de telas se não extraiu telas
    const sectionExportFormat = document.getElementById('section-export-format')!;
    if (choices.screens) {
      sectionExportFormat.classList.remove('hidden');
    } else {
      sectionExportFormat.classList.add('hidden');
    }
    
    finalAiTextDump = `========================================================\nRESUMO DE CONTEXTO DO PROJETO PARA IAs: ${projectData.title}\n========================================================\n`;
    finalAiTextDump += `Data de Geração: ${new Date().toLocaleString()}\n\n`;

    const compGroups: Record<string, string[]> = {};
    const otherComps: string[] = [];

    projectData.pages.forEach((page: any) => {
      page.instances.forEach((inst: any) => {
        const name = inst.componentName;
        const match = name.match(/^(\[[a-zA-Z0-9_-]+\])/);
        if (match) {
          const prefix = match[1];
          if (!compGroups[prefix]) compGroups[prefix] = [];
          if (!compGroups[prefix].includes(name)) compGroups[prefix].push(name);
        } else {
          if (!otherComps.includes(name)) otherComps.push(name);
        }
      });
    });

    finalAiTextDump += `=== COMPONENTES E PADRÕES UTILIZADOS (AGRUPADOS POR ORIGEM) ===\n`;
    Object.keys(compGroups).sort().forEach(prefix => {
       finalAiTextDump += `\nPacote Master ${prefix}:\n`;
       compGroups[prefix].sort().forEach(comp => finalAiTextDump += `  - ${comp}\n`);
    });
    if (otherComps.length > 0) {
       finalAiTextDump += `\nOutros Componentes Identificados:\n`;
       otherComps.sort().forEach(comp => finalAiTextDump += `  - ${comp}\n`);
    }

    finalAiTextDump += `\n\n=== CONTEÚDO DAS TELAS (LEITURA VISUAL PARA CONTEXTO) ===\n`;
    projectData.pages.forEach((page: any) => {
      finalAiTextDump += `\n>> PÁGINA ESCOPO: ${page.name}\n`;
      page.frames.forEach((frame: any) => {
        finalAiTextDump += `   > Frame Estrutural: [${frame.name}]\n`;
        if (frame.texts && frame.texts.length > 0) {
          finalAiTextDump += `     Textos Literais Encontrados na Tela:\n       "${frame.texts.join('" | "')}"\n`;
        }
        if (frame.annotations && frame.annotations.length > 0) {
          finalAiTextDump += `     Anotações Visuais/Comentários da Equipe:\n`;
          frame.annotations.forEach((ann: any) => {
            finalAiTextDump += `       * ${ann.label}: ${ann.text.replace(/\n/g, ' ')}\n`;
          });
        }
        finalAiTextDump += `\n`;
      });
    });

    let html = `
      <div class="grid grid-cols-3 gap-3 mb-2">
        <div class="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
          <div class="text-[10px] text-zinc-400 uppercase font-bold mb-1">Estrutura</div>
          <div class="flex items-baseline gap-1">
            <span class="text-xl font-bold">${projectData.summary.framesCount}</span>
            <span class="text-xs text-zinc-500">Frames</span>
          </div>
        </div>
        <div class="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
          <div class="text-[10px] text-zinc-400 uppercase font-bold mb-1">Componentes</div>
          <div class="flex items-baseline gap-1">
            <span class="text-xl font-bold">${projectData.summary.instancesCount}</span>
            <span class="text-xs text-zinc-500">Instâncias</span>
          </div>
        </div>
        <div class="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
          <div class="text-[10px] text-zinc-400 uppercase font-bold mb-1">Design System</div>
          <div class="flex items-baseline gap-1">
            <span class="text-xl font-bold">${projectData.summary.variablesCount}</span>
            <span class="text-xs text-zinc-500">Variáveis</span>
          </div>
        </div>
      </div>
    `;

    const totalAnnotations = projectData.pages.reduce((acc: number, p: any) => acc + p.annotations.length, 0);
    if (totalAnnotations > 0) {
      let annHtml = '';
      projectData.pages.forEach((page: any) => {
        if (page.annotations.length > 0) {
          annHtml += `<div class="text-[11px] font-bold text-zinc-400 mt-2 mb-1 uppercase">${page.name}</div>`;
          annHtml += page.annotations.map((a: any) => `<div class="text-[11px] p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg mb-1"><strong>${a.nodeName}:</strong> ${a.label}</div>`).join('');
        }
      });
      html += createAccordion('Anotações Detectadas', annHtml);
    }

    accordionsContainer.innerHTML = html;

    // Populate context preview textarea
    const contextPreview = document.getElementById('context-preview') as HTMLTextAreaElement;
    if (contextPreview) {
      contextPreview.value = finalAiTextDump;
    }

    showView('view-report');
  }

  if (msg.type === 'export-complete') {
    loadingText.innerText = 'Compactando arquivos em ZIP...';
    
    const choices = getExtractionChoices();
    const repoType = (document.getElementById('repoType') as HTMLSelectElement).value;

    await exportToZip(projectData, msg.exportData, finalAiTextDump, attachedFiles, repoType, choices);

    showView('view-report');
  }
};
