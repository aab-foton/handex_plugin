// ============================================================
// briefing.js — Briefing Estratégico (Step 2, dentro de Informações do Projeto)
//
// Inclui:
//   - eixos e perguntas sugeridas (BRIEFING_AXES)
//   - render dos accordions por eixo + cards de pergunta (renderBriefingAxisAccordions, _renderBriefingQuestionCards)
//   - modal de criar/editar pergunta (openBriefingQuestionModal, confirmBriefingQuestionModal)
//   - CRUD (addBriefingQuestion, removeBriefingQuestion, updateBriefingQuestion)
//   - import/export em .md com parser próprio (exportBriefingMD, exportBriefingTemplateMD, importBriefingMD, _parseBriefingMD)
//   - Guia de busca por perguntas sugeridas (openBriefingGuideModal e família _renderBriefingGuide*)
//
// Extraído de core.js em 2026-08-28 — funcionalidade coesa e grande o
// suficiente (~740 linhas) pra justificar módulo próprio, sem relação com
// nenhuma integração externa futura (essa não é a motivação da extração).
// exportBriefingMD é chamada também de fora deste módulo (handoff-summary.html),
// por isso continua exposta em window.*, como já era antes do split.
// renderBriefingAxisAccordions é chamada por restoreUIFromState() em core.js
// (repopula a UI ao trocar de projeto/importar JSON) — escopo global
// compartilhado entre módulos (arquitetura sem ES modules, ver CLAUDE.md),
// então a chamada cross-arquivo funciona normalmente.
//
// Depende de: handoffData, saveToStorage, showToast, openModal/closeModal,
// _refreshIcons, _updateCharCount, escapeHtml, autoScrollToNewItem
// ============================================================

window.pullBriefingFromCanvas = function(e) {
  if (e) e.stopPropagation();
  parent.postMessage({ pluginMessage: { type: 'pull-briefing-from-canvas' } }, '*');
  showToast('Buscando framework no canvas...');
};

// ── Briefing Suggestions ──────────────────────────────────────────────
// Eixos do Briefing Estratégico + perguntas sugeridas por eixo. Cada eixo é
// um accordion (renderBriefingAxisAccordions) com um <select> das perguntas
// sugeridas + "Pergunta customizada" no fim. Toda pergunta criada, sugerida
// ou customizada, herda o nome do eixo escolhido como tag (nunca mais uma
// categoria "Customizada" solta, sem vínculo com eixo).
const BRIEFING_AXES = [
  {
    id: 'contexto', name: 'Contexto do Projeto', icon: 'briefcase', color: 'text-blue-500',
    questions: [
      { label: 'Problema Central', text: 'Qual é o problema central que este projeto resolve?' },
      { label: 'Contexto de Negócio', text: 'Qual é o contexto de negócio ou estratégico que originou essa demanda?' },
      { label: 'Critério de Sucesso', text: 'Quais resultados-chave definem o sucesso deste projeto? Como vamos medir?' },
      { label: 'Público-Alvo', text: 'Qual o perfil socioeconômico/demográfico do público que esta solução atende?' },
      { label: 'Canais', text: 'Em quais plataformas ou canais a solução vai operar?' }
    ]
  },
  {
    id: 'escopo', name: 'Escopo e Riscos', icon: 'git-merge', color: 'text-orange-700',
    questions: [
      { label: 'No Escopo', text: 'O que está definitivamente incluído nesta entrega?' },
      { label: 'Pode Entrar', text: 'O que pode entrar no escopo, mas ainda precisa de validação?' },
      { label: 'Fora do Escopo', text: 'O que está explicitamente fora do escopo desta versão?' },
      { label: 'MVP', text: 'O que é estritamente essencial para a primeira entrega?' },
      { label: 'Riscos Técnicos', text: 'Quais os maiores riscos técnicos que podem impedir o sucesso do projeto?' },
      { label: 'Riscos de Negócio', text: 'Há riscos regulatórios, legais (ex: LGPD) ou de compliance envolvidos?' },
      { label: 'Dependências', text: 'Quais sistemas ou times externos este projeto depende?' },
      { label: 'Impacto Cruzado', text: 'Esta solução afeta outras jornadas, componentes ou produtos? Quais, e como?' }
    ]
  },
  {
    id: 'stakeholders', name: 'Usuários e Stakeholders', icon: 'users', color: 'text-teal-500',
    questions: [
      { label: 'Usuários Primários', text: 'Quem são os usuários primários deste produto ou fluxo?' },
      { label: 'Usuários Secundários', text: 'Quem são os usuários secundários ou indiretos?' },
      { label: 'Dores do Usuário', text: 'Quais são as principais dores ou frustrações relatadas por esses usuários?' },
      { label: 'Papéis de Decisão', text: 'Quem decide, quem precisa ser consultado e quem só precisa ser informado sobre este projeto?' }
    ]
  },
  {
    id: 'design', name: 'UX e Design', icon: 'compass', color: 'text-purple-500',
    questions: [
      { label: 'Jornada', text: 'Em qual etapa da jornada do usuário esta interface está inserida?' },
      { label: 'Sentimento e Tom de Voz', text: 'Que tom de voz e percepção (ex: segurança, agilidade) o design deve transmitir nesta interação?' },
      { label: 'Acessibilidade', text: 'Há requisitos específicos de acessibilidade ou inclusão para este público?' }
    ]
  },
  {
    id: 'pesquisa', name: 'Pesquisa e Evidências', icon: 'flask-conical', color: 'text-green-500',
    questions: [
      { label: 'Pesquisas Anteriores', text: 'Há pesquisas ou dados de uso anteriores que embasam este projeto?' },
      { label: 'Causa Raiz', text: 'Qual é a causa raiz do problema (5 Porquês)? Já foi investigada?' },
      { label: 'Certezas (CSD)', text: 'O que a equipe tem certeza sobre o problema ou a solução?' },
      { label: 'Suposições (CSD)', text: 'Quais suposições estão sendo feitas e ainda não foram validadas?' },
      { label: 'Dúvidas (CSD)', text: 'Quais dúvidas precisam ser respondidas antes de prosseguir?' }
    ]
  }
];

function _briefingAxisById(id) {
  return BRIEFING_AXES.find(a => a.id === id) || null;
}

// category salva é o nome do eixo (ex: "Contexto do Projeto") — perguntas
// salvas antes desta feature existir podem ter "Customizada" ou qualquer
// string livre, que não bate com nenhum eixo; nesse caso a pergunta some do
// agrupamento por eixo (fallback null, tratado por quem chama).
function _briefingAxisByName(name) {
  return BRIEFING_AXES.find(a => a.name === name) || null;
}

const BRIEFING_CUSTOM_VALUE = '__custom__';

// Um accordion por eixo, cada um com um <select> das perguntas sugeridas
// daquele eixo (+ "Pergunta customizada" no fim da lista), um botão
// "Adicionar" que confirma a escolha, e as perguntas já criadas daquele eixo
// logo abaixo — substitui os chips soltos antigos, mas mantém os eixos
// sempre visíveis na tela (não escondidos atrás de um popover/clique extra).
function renderBriefingAxisAccordions() {
  const container = document.getElementById('briefing-axes-container');
  if (!container) return;
  const openIds = new Set(
    Array.from(container.querySelectorAll('[id^="briefing-axis-body-"]:not(.hidden)'))
      .map(el => el.id.replace('briefing-axis-body-', ''))
  );
  container.innerHTML = '';
  BRIEFING_AXES.forEach(axis => {
    const selectId = `briefing-axis-select-${axis.id}`;
    const isOpen = openIds.has(axis.id);
    const wrap = document.createElement('div');
    wrap.className = 'border border-gray-100 dark:border-dark-line rounded-xl overflow-hidden bg-white dark:bg-dark-surface/30';
    wrap.innerHTML = `
      <button type="button" onclick="toggleBriefingAxisAccordion('${axis.id}')" class="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-dark-surface/50 hover:bg-slate-100 dark:hover:bg-dark-line/20 transition-all">
        <span class="flex items-center gap-2 text-[12px] font-bold text-slate-700 dark:text-white">
          <i data-lucide="${axis.icon}" class="w-4 h-4 ${axis.color}"></i>
          ${axis.name}
          <span id="briefing-axis-count-${axis.id}" class="hidden px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-dark-muted text-[10px] font-bold rounded-full leading-none"></span>
        </span>
        <i data-lucide="chevron-down" id="briefing-axis-arrow-${axis.id}" class="w-4 h-4 ${isOpen ? 'text-[#005ca9] dark:text-blue-300' : 'text-gray-500 dark:text-dark-muted'} transition-transform ${isOpen ? 'rotate-180' : ''}"></i>
      </button>
      <div id="briefing-axis-body-${axis.id}" class="${isOpen ? '' : 'hidden'} p-3 bg-white dark:bg-dark-bg/10 border-t border-gray-100 dark:border-dark-line">
        <div class="flex gap-2">
          <div class="relative flex-1 min-w-0">
            <select id="${selectId}" class="w-full appearance-none text-[12px] bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-dark-line rounded-xl pl-3 pr-8 py-2 text-slate-700 dark:text-white outline-none focus:border-[#005ca9]/50 transition-colors">
              <option value="${BRIEFING_CUSTOM_VALUE}">Pergunta customizada</option>
            </select>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-gray-500 dark:text-dark-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"></i>
          </div>
          <button type="button" onclick="confirmBriefingAxisSelection('${axis.id}')" title="Adicionar pergunta" aria-label="Adicionar pergunta deste eixo"
            class="shrink-0 px-3 py-2 bg-[#005ca9] hover:bg-blue-700 rounded-xl text-[11px] font-bold text-white transition-colors">
            Adicionar
          </button>
        </div>
        <div id="briefing-axis-questions-${axis.id}" class="space-y-3 mt-3"></div>
      </div>
    `;
    container.appendChild(wrap);
  });
  _refreshIcons();
  _renderBriefingQuestionCards();
}

function toggleBriefingAxisAccordion(axisId) {
  const body = document.getElementById(`briefing-axis-body-${axisId}`);
  const arrow = document.getElementById(`briefing-axis-arrow-${axisId}`);
  if (!body || !arrow) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden');
  arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  arrow.classList.toggle('text-[#005ca9]', isHidden);
  arrow.classList.toggle('dark:text-blue-300', isHidden);
}

function confirmBriefingAxisSelection(axisId) {
  const axis = _briefingAxisById(axisId);
  const select = document.getElementById(`briefing-axis-select-${axisId}`);
  if (!axis || !select) return;
  const questionText = select.value === BRIEFING_CUSTOM_VALUE
    ? ""
    : (axis.questions.find(q => q.label === select.value)?.text || "");
  openBriefingQuestionModal(axis.name, questionText);
}

// Modal "Adicionar/Editar pergunta" — único ponto de criação/edição de
// conteúdo do briefing; o accordion de cada eixo é só vitrine (espelha
// pergunta+resposta em texto, com lápis pra reabrir aqui e editar). Sem
// editId é criação (addBriefingQuestion ao confirmar); com editId é edição
// in-place (updateBriefingQuestion). Cancelar nunca deixa card órfão nem
// perde edição — só fecha sem salvar.
let _briefingQuestionModalAxis = null;
let _briefingQuestionModalEditId = null;
// true quando este modal foi aberto a partir do Guia do Briefing Estratégico
// (busca+filtros, ver _renderBriefingGuideResults) -- nesse caso, fechar
// (cancelar OU confirmar) deve reabrir o Guia em vez de revelar a tela de
// trás. O Guia é um fluxo de seleção em lote (usuário tende a adicionar
// várias perguntas em sequência), então ejetar pra fora dele a cada
// pergunta adicionada quebra o ritmo -- mesmo padrão de "adicionar ao
// carrinho": o item ganha o badge "Já usada" e a busca/filtro continuam
// como estavam. Os outros dois pontos de entrada (accordion de eixo dentro
// de Dados do Projeto, e editar uma pergunta já criada) não usam essa
// flag -- lá, fechar deve mesmo revelar a tela de trás normalmente.
let _briefingQuestionModalReturnToGuide = false;

function openBriefingQuestionModal(axisName, questionText = "", answerText = "", editId = null, returnToGuide = false) {
  _briefingQuestionModalAxis = axisName;
  _briefingQuestionModalEditId = editId;
  _briefingQuestionModalReturnToGuide = returnToGuide;
  const title = document.getElementById('briefing-question-modal-title');
  if (title) title.textContent = editId ? 'Editar pergunta' : 'Adicionar pergunta';
  const axisLabel = document.getElementById('briefing-question-modal-axis');
  if (axisLabel) axisLabel.textContent = axisName;
  const qField = document.getElementById('briefing-question-modal-question');
  const aField = document.getElementById('briefing-question-modal-answer');
  if (qField) { qField.value = questionText; _updateCharCount(qField, 250); }
  if (aField) { aField.value = answerText; _updateCharCount(aField, 600); }
  openModal('briefing-question-modal');
  setTimeout(() => {
    const target = questionText ? aField : qField;
    if (target) target.focus();
  }, 80);
}
window.openBriefingQuestionModal = openBriefingQuestionModal;

function editBriefingQuestion(id) {
  const q = (handoffData.step2.briefingQuestions || []).find(q => q.id == id);
  if (!q) return;
  openBriefingQuestionModal(q.category, q.question, q.answer || '', q.id);
}
window.editBriefingQuestion = editBriefingQuestion;

function closeBriefingQuestionModal() {
  _briefingQuestionModalAxis = null;
  _briefingQuestionModalEditId = null;
  closeModal('briefing-question-modal');
  if (_briefingQuestionModalReturnToGuide) {
    _briefingQuestionModalReturnToGuide = false;
    _reopenBriefingGuideModal();
  }
}
window.closeBriefingQuestionModal = closeBriefingQuestionModal;

function confirmBriefingQuestionModal() {
  const qField = document.getElementById('briefing-question-modal-question');
  const aField = document.getElementById('briefing-question-modal-answer');
  const questionText = qField ? qField.value.trim().slice(0, 250) : '';
  if (!questionText) {
    showToast('Digite a pergunta antes de adicionar.', 'error');
    if (qField) qField.focus();
    return;
  }
  const axisName = _briefingQuestionModalAxis;
  const editId = _briefingQuestionModalEditId;
  const returnToGuide = _briefingQuestionModalReturnToGuide;
  const answerText = aField ? aField.value.slice(0, 600) : '';
  closeModal('briefing-question-modal');
  _briefingQuestionModalReturnToGuide = false;
  if (editId) {
    updateBriefingQuestion(editId, 'question', questionText);
    updateBriefingQuestion(editId, 'answer', answerText);
    _renderBriefingQuestionCards();
    showToast('Pergunta atualizada.', 'success');
  } else {
    addBriefingQuestion(questionText, axisName, answerText);
    showToast('Pergunta inserida no briefing.', 'success');
  }
  if (returnToGuide) _reopenBriefingGuideModal();
}
window.confirmBriefingQuestionModal = confirmBriefingQuestionModal;

// Card-vitrine: só exibição (pergunta + resposta em texto), sem edição
// inline — lápis reabre o modal de criação/edição, lixeira exclui direto.
function _briefingCardHTML(q, index) {
  const hasAnswer = q.answer && q.answer.trim();
  return `
    <div class="flex items-start justify-between gap-3 mb-3">
      <span class="text-[#005ca9] font-bold text-[14px] shrink-0">#${index}</span>
      <div class="flex items-center gap-1 shrink-0">
        <button onclick="editBriefingQuestion('${q.id}')" title="Editar pergunta" aria-label="Editar pergunta" class="p-1.5 text-gray-400 hover:text-[#005ca9] transition-colors rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="removeBriefingQuestion('${q.id}')" title="Excluir pergunta" aria-label="Excluir pergunta" class="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-50 dark:hover:bg-red-900/20">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
    <div class="space-y-2">
      <p class="text-[12px] font-bold text-slate-700 dark:text-white leading-relaxed">${escapeHtml(q.question)}</p>
      <p class="text-[11px] leading-relaxed ${hasAnswer ? 'text-slate-600 dark:text-dark-muted' : 'text-slate-400 dark:text-dark-muted italic'}">${hasAnswer ? escapeHtml(q.answer) : 'Sem resposta ainda.'}</p>
    </div>
  `;
}

// Distribui handoffData.step2.briefingQuestions nos containers de cada
// accordion de eixo (por nome de eixo salvo em q.category), atualiza os
// badges de contagem por eixo, o contador total no topo, e o <select> de
// sugestões (esconde a que já foi usada — só volta a aparecer se o card
// correspondente for apagado ou o texto editado). Fonte única de
// renderização — chamada por renderBriefingAxisAccordions() (montagem do
// zero) e por addBriefingQuestion/removeBriefingQuestion (após mudar dados).
function _renderBriefingQuestionCards() {
  const all = handoffData.step2.briefingQuestions || [];
  BRIEFING_AXES.forEach(axis => {
    const list = document.getElementById(`briefing-axis-questions-${axis.id}`);
    if (!list) return;
    const axisQuestions = all.filter(q => q.category === axis.name);
    list.innerHTML = '';
    axisQuestions.forEach((q, i) => {
      const card = document.createElement('div');
      card.id = `briefing-card-${q.id}`;
      card.className = "bg-white dark:bg-dark-bg p-5 rounded-xl border border-gray-100 dark:border-dark-line shadow-sm relative";
      card.innerHTML = _briefingCardHTML(q, i + 1);
      list.appendChild(card);
    });
    const countBadge = document.getElementById(`briefing-axis-count-${axis.id}`);
    if (countBadge) {
      countBadge.textContent = String(axisQuestions.length);
      countBadge.classList.toggle('hidden', axisQuestions.length === 0);
    }
    const usedTexts = new Set(axisQuestions.map(q => q.question));
    const select = document.getElementById(`briefing-axis-select-${axis.id}`);
    if (select) {
      const currentValue = select.value;
      select.innerHTML = axis.questions
        .filter(q => !usedTexts.has(q.text))
        .map(q => `<option value="${escapeHtml(q.label)}">${escapeHtml(q.label)}</option>`)
        .join('') + `<option value="${BRIEFING_CUSTOM_VALUE}">Pergunta customizada</option>`;
      const stillValid = Array.from(select.options).some(o => o.value === currentValue);
      if (stillValid) select.value = currentValue;
    }
  });
  const totalEl = document.getElementById('briefing-total-count');
  if (totalEl) {
    totalEl.textContent = all.length === 1 ? '1 pergunta no briefing' : `${all.length} perguntas no briefing`;
    totalEl.classList.toggle('hidden', all.length === 0);
  }
  // Badge no header do accordion — visível mesmo com o accordion fechado.
  const headerCount = document.getElementById('briefing-header-count');
  if (headerCount) {
    headerCount.textContent = String(all.length);
    headerCount.classList.toggle('hidden', all.length === 0);
  }
  _refreshIcons();
}

function addBriefingQuestion(questionText = "", category = "", answerText = "") {
  if (typeof questionText !== 'string') questionText = "";
  if (typeof answerText !== 'string') answerText = "";
  const id = Date.now();
  if (!handoffData.step2.briefingQuestions) handoffData.step2.briefingQuestions = [];
  handoffData.step2.briefingQuestions.push({ id, question: questionText, answer: answerText, category });
  saveToStorage();
  _renderBriefingQuestionCards();

  const card = document.getElementById(`briefing-card-${id}`);

  // Auto-open briefing accordion if collapsed
  const briefingContent = document.getElementById('briefing-card');
  if (briefingContent && briefingContent.classList.contains('hidden')) {
    const accordionBtn = briefingContent.previousElementSibling;
    if (accordionBtn) accordionBtn.click();
  }

  // Abre o accordion do eixo correspondente se estiver fechado
  const axis = _briefingAxisByName(category);
  if (axis) {
    const body = document.getElementById(`briefing-axis-body-${axis.id}`);
    if (body && body.classList.contains('hidden')) toggleBriefingAxisAccordion(axis.id);
  }

  // A pergunta chega pronta (via modal, import ou guia) — só rola até o
  // card criado, sem forçar foco/edição imediata de nenhum campo.
  if (card) {
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
    autoScrollToNewItem('handoff-scroll-container', card);
  }
}

function removeBriefingQuestion(id) {
  handoffData.step2.briefingQuestions = (handoffData.step2.briefingQuestions || []).filter(q => q.id != id);
  saveToStorage();
  _renderBriefingQuestionCards();
}

function updateBriefingQuestion(id, key, value) {
  const q = (handoffData.step2.briefingQuestions || []).find(q => q.id == id);
  if (q) q[key] = value;
  saveToStorage();
}

// ── Import/Export do Briefing Estratégico (.md) ──────────────────────────
// Formato próprio (não é o mesmo .md de "Exportar como Markdown" da Ficha):
// carrega uma assinatura de versão e uma chave estável [eixo-id/chave] em
// cada heading de pergunta, para que a reimportação (inclusive do MESMO
// arquivo depois de editado manualmente ou preenchido por uma IA fora do
// plugin) seja determinística — atualiza por chave, cria se a chave for
// nova, nunca remove o que não estiver no arquivo. Ver BUSINESS_RULES.md.
const BRIEFING_MD_SIGNATURE = '<!-- HANDEX-BRIEFING v1 -->';

function _briefingSuggestionKey(axisId, label) {
  const axis = _briefingAxisById(axisId);
  if (!axis) return null;
  const idx = axis.questions.findIndex(q => q.label === label);
  return idx === -1 ? null : `${axisId}/q${idx + 1}`;
}

function exportBriefingMD() {
  const all = handoffData.step2?.briefingQuestions || [];
  if (all.length === 0) { showToast('Nenhuma pergunta no briefing ainda.', 'error'); return; }

  const lines = [];
  lines.push(BRIEFING_MD_SIGNATURE);
  lines.push(`<!-- projeto: ${handoffData.step1?.titulo || 'Sem título'} -->`);
  lines.push(`<!-- gerado-em: ${new Date().toISOString()} -->`);
  lines.push('');
  lines.push('# Briefing Estratégico');

  BRIEFING_AXES.forEach(axis => {
    const axisQuestions = all.filter(q => q.category === axis.name);
    if (axisQuestions.length === 0) return;
    lines.push('');
    lines.push(`## ${axis.name}`);
    axisQuestions.forEach(q => {
      const suggestion = axis.questions.find(sq => sq.text === q.question);
      const key = suggestion ? _briefingSuggestionKey(axis.id, suggestion.label) : `${axis.id}/custom-${q.id}`;
      lines.push('');
      lines.push(`### [${key}] ${q.question || '(pergunta em branco)'}`);
      lines.push(q.answer && q.answer.trim() ? q.answer.trim() : '_(sem resposta)_');
    });
  });
  lines.push('');
  lines.push('---');

  const md = lines.join('\n');
  const name = `handex-briefing-${(handoffData.step1?.titulo || 'projeto').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.md`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  showToast('Briefing exportado!', 'success');
}
window.exportBriefingMD = exportBriefingMD;

// Molde em branco: todos os 5 eixos com TODAS as perguntas do catálogo
// (BRIEFING_AXES), independente de já terem sido usadas ou não — ponto de
// partida pra preencher fora do Figma (editor de texto, IA) e reimportar
// depois. Usa o mesmo formato/chaves de exportBriefingMD, então reimporta
// pelo mesmo parser (_parseBriefingMD) sem nenhum código extra.
function exportBriefingTemplateMD() {
  const lines = [];
  lines.push(BRIEFING_MD_SIGNATURE);
  lines.push(`<!-- projeto: ${handoffData.step1?.titulo || 'Sem título'} -->`);
  lines.push(`<!-- gerado-em: ${new Date().toISOString()} -->`);
  lines.push('');
  lines.push('# Briefing Estratégico');
  lines.push('');
  lines.push('_Preencha as respostas abaixo de cada pergunta e depois importe este arquivo de volta no Handex (botão "Importar", no accordion Briefing Estratégico). Não altere as linhas com colchetes [eixo/id] — elas identificam cada pergunta na hora de importar._');

  BRIEFING_AXES.forEach(axis => {
    lines.push('');
    lines.push(`## ${axis.name}`);
    axis.questions.forEach(q => {
      const key = _briefingSuggestionKey(axis.id, q.label);
      lines.push('');
      lines.push(`### [${key}] ${q.text}`);
      lines.push('_(sem resposta)_');
    });
  });
  lines.push('');
  lines.push('---');

  const md = lines.join('\n');
  const name = `handex-briefing-template-${(handoffData.step1?.titulo || 'projeto').replace(/\s+/g, '-')}.md`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  showToast('Molde do briefing baixado!', 'success');
}
window.exportBriefingTemplateMD = exportBriefingTemplateMD;

// Parser estrito: qualquer ambiguidade estrutural aborta a importação
// inteira (nunca aplica parcial, nunca falha silenciosa). Retorna
// { ok: true, questions, warnings } ou { ok: false, error }.
function _parseBriefingMD(text) {
  const rawLines = text.split(/\r?\n/);
  let i = 0;
  while (i < rawLines.length && rawLines[i].trim() === '') i++;
  if (rawLines[i]?.trim() !== BRIEFING_MD_SIGNATURE) {
    return { ok: false, error: 'Este arquivo não é um briefing exportado pelo Handex (ou é de uma versão incompatível). Importação cancelada.' };
  }

  const axisIds = new Set(BRIEFING_AXES.map(a => a.id));
  const axisById = id => _briefingAxisById(id);
  const questions = [];
  const warnings = [];
  let currentAxisHeadingName = null;
  let current = null; // { axisId, key, question, answerLines }

  const flush = () => {
    if (!current) return;
    const answer = current.answerLines.join('\n').trim();
    questions.push({
      axisId: current.axisId,
      key: current.key,
      question: current.question,
      answer: answer === '_(sem resposta)_' ? '' : answer
    });
    current = null;
  };

  for (let lineNo = 0; lineNo < rawLines.length; lineNo++) {
    const line = rawLines[lineNo];
    if (/^<!--.*-->\s*$/.test(line) || (lineNo === i)) continue; // assinatura/metadados
    const axisMatch = line.match(/^##\s+(.+)$/);
    if (axisMatch) {
      flush();
      currentAxisHeadingName = axisMatch[1].trim();
      continue;
    }
    const qMatch = line.match(/^###\s+\[([a-z-]+)\/([a-z0-9-]+)\]\s+(.+)$/);
    if (qMatch) {
      flush();
      const [, axisId, chave, questionText] = qMatch;
      if (!axisIds.has(axisId)) {
        return { ok: false, error: `Linha ${lineNo + 1}: eixo "${axisId}" não reconhecido. Eixos válidos: ${Array.from(axisIds).join(', ')}.` };
      }
      const axis = axisById(axisId);
      if (currentAxisHeadingName && currentAxisHeadingName !== axis.name) {
        warnings.push(`Linha ${lineNo + 1}: pergunta categorizada como "${axis.name}" (pela chave), mas estava na seção "${currentAxisHeadingName}" do arquivo.`);
      }
      const questionTrimmed = questionText.trim();
      if (!questionTrimmed || questionTrimmed === '(pergunta em branco)') {
        return { ok: false, error: `Linha ${lineNo + 1}: pergunta vazia não é permitida na importação.` };
      }
      current = { axisId, key: chave, question: questionTrimmed, answerLines: [] };
      continue;
    }
    if (/^###\s/.test(line)) {
      return { ok: false, error: `Linha ${lineNo + 1}: heading de pergunta em formato inválido — chave [eixo/id] ausente ou malformada.` };
    }
    if (line.trim() === '---' || line.trim() === '# Briefing Estratégico') continue;
    if (current) current.answerLines.push(line);
  }
  flush();

  if (questions.length === 0) {
    return { ok: false, error: 'Nenhuma pergunta reconhecida no arquivo.' };
  }
  return { ok: true, questions, warnings };
}

// Resolve criar-vs-atualizar por chave estável: perguntas de catálogo (qN)
// batem por texto original da sugestão; customizadas (custom-{id}) batem
// pelo id existente. Nunca reaproveita um id vindo do arquivo para item
// novo — sempre gera id internamente, garantindo unicidade mesmo que o
// arquivo tenha sido editado manualmente com valores inventados.
function _applyBriefingImport(parsed) {
  if (!handoffData.step2.briefingQuestions) handoffData.step2.briefingQuestions = [];
  const existing = handoffData.step2.briefingQuestions;
  let created = 0, updated = 0;

  parsed.questions.forEach(pq => {
    const axis = _briefingAxisById(pq.axisId);
    if (!axis) return; // já validado no parser, defensivo
    const category = axis.name;
    const isCustomKey = pq.key.startsWith('custom-');

    let target = null;
    if (isCustomKey) {
      const customId = pq.key.slice('custom-'.length);
      target = existing.find(q => String(q.id) === customId && q.category === category);
    } else {
      const qIndex = parseInt(pq.key.slice(1), 10) - 1;
      const suggestion = axis.questions[qIndex];
      if (suggestion) {
        target = existing.find(q => q.category === category && q.question === suggestion.text);
      }
    }

    if (target) {
      target.question = String(pq.question || '');
      target.answer = String(pq.answer || '');
      target.category = category;
      updated++;
    } else {
      existing.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        question: String(pq.question || ''),
        answer: String(pq.answer || ''),
        category
      });
      created++;
    }
  });

  saveToStorage();
  renderBriefingAxisAccordions();
  return { created, updated };
}

function importBriefingMD() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.txt';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const parsed = _parseBriefingMD(String(event.target.result || ''));
      if (!parsed.ok) {
        showToast(parsed.error, 'error');
        return;
      }
      const result = _applyBriefingImport(parsed);
      const parts = [];
      if (result.created) parts.push(`${result.created} nova(s)`);
      if (result.updated) parts.push(`${result.updated} atualizada(s)`);
      let msg = `Briefing importado — ${parts.join(', ') || 'nenhuma alteração'}.`;
      if (parsed.warnings.length) msg += ` ${parsed.warnings.length} aviso(s), ver console.`;
      if (parsed.warnings.length) console.warn('[Handex] Avisos na importação do briefing:', parsed.warnings);
      showToast(msg, 'success');
      // Importar com a seção desativada seria um beco sem saída -- o menu
      // "Mais ações" (onde fica o botão Importar) continua acessível mesmo
      // com o toggle desligado, mas o resultado ficaria invisível dentro do
      // card oculto. Reativa automaticamente sempre que a importação de fato
      // criou/atualizou alguma pergunta.
      if (result.created || result.updated) {
        const chk = document.getElementById('chk-briefing-enabled');
        if (chk && !chk.checked) {
          chk.checked = true;
          toggleBriefingSection(true);
        }
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
window.importBriefingMD = importBriefingMD;

// ── Guia do Briefing (modal de referência: eixos + perguntas, com busca e
// filtro por eixo) ─────────────────────────────────────────────────────
let _briefingGuideActiveAxis = null; // null = todos os eixos

function openBriefingGuideModal() {
  _briefingGuideActiveAxis = null;
  const search = document.getElementById('briefing-guide-search');
  if (search) search.value = '';
  _renderBriefingGuideAxisFilters();
  _renderBriefingGuideResults('');
  openModal('briefing-guide-modal');
}
window.openBriefingGuideModal = openBriefingGuideModal;

// Reabre o Guia depois de adicionar uma pergunta (ver
// confirmBriefingQuestionModal/closeBriefingQuestionModal com
// returnToGuide=true) SEM resetar busca/filtro -- diferente de
// openBriefingGuideModal (entrada "do zero"), aqui o usuário está no meio
// de uma sessão de seleção em lote e perder o que já tinha buscado/filtrado
// a cada pergunta adicionada obrigaria refazer tudo de novo.
function _reopenBriefingGuideModal() {
  const search = document.getElementById('briefing-guide-search');
  _renderBriefingGuideAxisFilters();
  _renderBriefingGuideResults(search ? search.value : '');
  openModal('briefing-guide-modal');
}

function _renderBriefingGuideAxisFilters() {
  const wrap = document.getElementById('briefing-guide-axis-filters');
  if (!wrap) return;
  wrap.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.textContent = 'Todos os eixos';
  allBtn.className = _briefingGuideChipClass(_briefingGuideActiveAxis === null);
  allBtn.onclick = () => { _briefingGuideActiveAxis = null; _refreshBriefingGuide(); };
  wrap.appendChild(allBtn);
  BRIEFING_AXES.forEach(axis => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = axis.name;
    btn.className = _briefingGuideChipClass(_briefingGuideActiveAxis === axis.id);
    btn.onclick = () => { _briefingGuideActiveAxis = axis.id; _refreshBriefingGuide(); };
    wrap.appendChild(btn);
  });
}

function _briefingGuideChipClass(active) {
  return active
    ? 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#005ca9] text-white transition-colors'
    : 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-dark-muted hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors';
}

function _refreshBriefingGuide() {
  _renderBriefingGuideAxisFilters();
  const search = document.getElementById('briefing-guide-search');
  _renderBriefingGuideResults(search ? search.value : '');
}

function filterBriefingGuide() {
  clearTimeout(filterBriefingGuide._t);
  filterBriefingGuide._t = setTimeout(() => {
    const search = document.getElementById('briefing-guide-search');
    _renderBriefingGuideResults(search ? search.value : '');
  }, 150);
}
window.filterBriefingGuide = filterBriefingGuide;

function _renderBriefingGuideResults(query) {
  const container = document.getElementById('briefing-guide-results');
  if (!container) return;
  const term = (query || '').trim().toLowerCase();
  const axes = _briefingGuideActiveAxis ? [_briefingAxisById(_briefingGuideActiveAxis)] : BRIEFING_AXES;

  container.innerHTML = '';
  let totalMatches = 0;

  axes.forEach(axis => {
    if (!axis) return;
    const matches = axis.questions.filter(q =>
      !term || q.label.toLowerCase().includes(term) || q.text.toLowerCase().includes(term)
    );
    if (matches.length === 0) return;
    totalMatches += matches.length;

    const section = document.createElement('div');
    section.innerHTML = `
      <div class="flex items-center gap-2 mb-2.5">
        <i data-lucide="${axis.icon}" class="w-4 h-4 ${axis.color} shrink-0"></i>
        <h4 class="text-[11px] font-bold text-slate-700 dark:text-white uppercase tracking-wider">${axis.name}</h4>
      </div>
      <ul class="space-y-2"></ul>
    `;
    const list = section.querySelector('ul');
    const usedTexts = new Set(
      (handoffData.step2?.briefingQuestions || [])
        .filter(bq => bq.category === axis.name)
        .map(bq => bq.question)
    );
    matches.forEach(q => {
      const alreadyUsed = usedTexts.has(q.text);
      const item = document.createElement('li');
      item.className = 'p-3 bg-gray-50 dark:bg-dark-surface rounded-xl border border-gray-100 dark:border-dark-line flex items-start gap-3';
      const textWrap = document.createElement('div');
      textWrap.className = 'flex-1 min-w-0';
      textWrap.innerHTML = `
        <p class="text-[11px] font-bold text-slate-700 dark:text-white">${escapeHtml(q.label)}</p>
        <p class="text-[10px] text-slate-500 dark:text-dark-muted leading-relaxed mt-0.5">${escapeHtml(q.text)}</p>
      `;
      item.appendChild(textWrap);
      if (alreadyUsed) {
        const badge = document.createElement('span');
        badge.className = 'shrink-0 text-[9px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wide mt-0.5';
        badge.textContent = 'Já usada';
        item.appendChild(badge);
      } else {
        const insertBtn = document.createElement('button');
        insertBtn.type = 'button';
        insertBtn.title = 'Inserir esta pergunta no briefing';
        insertBtn.setAttribute('aria-label', `Inserir "${q.label}" no briefing`);
        insertBtn.className = 'shrink-0 p-1.5 text-[#005ca9] hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors';
        insertBtn.innerHTML = '<i data-lucide="plus-circle" class="w-4 h-4"></i>';
        insertBtn.onclick = () => {
          // Não fecha o Guia -- só sobrepõe o modal "Adicionar pergunta" por
          // cima (ambos são modais de mesma camada visual, mas o de baixo
          // continua na DOM). returnToGuide=true reabre o Guia ao
          // cancelar/confirmar (ver closeBriefingQuestionModal/
          // confirmBriefingQuestionModal), preservando a busca/filtro
          // aplicados e permitindo adicionar várias perguntas em sequência
          // sem ser ejetado pra tela de trás a cada uma.
          openBriefingQuestionModal(axis.name, q.text, '', null, true);
        };
        item.appendChild(insertBtn);
      }
      list.appendChild(item);
    });
    container.appendChild(section);
  });

  if (totalMatches === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10">
        <i data-lucide="search-x" class="w-10 h-10 text-slate-200 dark:text-slate-700 mb-3" style="opacity:0.5"></i>
        <p class="text-[11px] font-bold text-slate-500 dark:text-dark-muted text-center">Nenhuma pergunta encontrada</p>
        <p class="text-[10px] text-slate-500 dark:text-dark-muted text-center mt-1">Tente outro termo ou remova o filtro de eixo.</p>
      </div>
    `;
  }
  _refreshIcons();
}

// Liga/desliga o card "Briefing Estratégico" inteiro dentro do grupo
// Contexto de Negócio — vem ativado por padrão. Desativado, o corpo (perguntas
// por eixo) fica oculto, mas o header com o próprio toggle continua visível
// para reativar. Não apaga nenhuma pergunta já respondida.
function toggleBriefingSection(checked) {
  handoffData.step2.briefingEnabled = checked;
  const card = document.getElementById('briefing-card');
  if (card) card.classList.toggle('hidden', !checked);
  saveToStorage();
}
window.toggleBriefingSection = toggleBriefingSection;

// Limpar Briefing — escopo menor que "Limpar Dados" do projeto (só
// handoffData.step2.briefingQuestions; frames, specs, medidas e fluxos não
// são tocados). Confirmação leve (modal com Cancelar/Confirmar), sem exigir
// digitar uma palavra — proporcional ao risco de um sub-conjunto de dados,
// diferente do apagar geral do projeto (ver clearAllData/requestClearAllData
// em design-data.js, que usa confirmação por digitação por afetar tudo).
function openClearBriefingModal() {
  const count = (handoffData.step2.briefingQuestions || []).length;
  if (count === 0) { showToast('O briefing já está vazio.'); return; }
  const desc = document.getElementById('clear-briefing-modal-desc');
  if (desc) {
    desc.textContent = count === 1
      ? 'Remove a única pergunta respondida. O restante do projeto (frames, specs, medidas, fluxos) não é afetado.'
      : `Remove as ${count} perguntas respondidas. O restante do projeto (frames, specs, medidas, fluxos) não é afetado.`;
  }
  openModal('clear-briefing-modal');
}
window.openClearBriefingModal = openClearBriefingModal;

function confirmClearBriefing() {
  handoffData.step2.briefingQuestions = [];
  saveToStorage();
  closeModal('clear-briefing-modal');
  renderBriefingAxisAccordions();
  showToast('Briefing limpo.', 'success');
}
window.confirmClearBriefing = confirmClearBriefing;

// Menu "Mais ações" do header do Briefing (Baixar template/Importar/
// Exportar/Limpar) -- mesmo padrão de toggleSpecsMoreActions em
// specifications.js (painel some ao clicar fora, fecha ao escolher uma ação).
function toggleBriefingMoreActions(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('briefing-more-actions-panel');
  const btn = document.querySelector('#briefing-more-actions-wrap button[aria-haspopup]');
  if (!panel) return;
  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) {
    closeBriefingMoreActions();
    return;
  }
  panel.classList.remove('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  const close = (ev) => {
    const wrap = document.getElementById('briefing-more-actions-wrap');
    if (wrap && !wrap.contains(ev.target)) {
      closeBriefingMoreActions();
      document.removeEventListener('click', close, true);
    }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}
window.toggleBriefingMoreActions = toggleBriefingMoreActions;

function closeBriefingMoreActions() {
  const panel = document.getElementById('briefing-more-actions-panel');
  const btn = document.querySelector('#briefing-more-actions-wrap button[aria-haspopup]');
  if (panel) panel.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
window.closeBriefingMoreActions = closeBriefingMoreActions;
