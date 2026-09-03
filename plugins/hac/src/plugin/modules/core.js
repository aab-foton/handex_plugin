// ============================================================
// core.js — hac
//
// ADAPTAÇÃO do Handex Beta (src/plugin/modules/core.js) para o schema
// enxuto do hac — 2026-08-24. hac não tem frames/wizard/briefing/
// specs normais/export de ficha: só Marcar Área + Specs de A11y (5
// categorias) + Detecção Automática + Ordem de Tabulação, sobre um único
// schema `hacData` sem duplicação avulso/por-frame (essa duplicação é
// a causa raiz de um bug documentado no Handex — specs "sumindo" por ter
// duas fontes de verdade divergentes; o hac nasce sem esse padrão).
// ============================================================

// --- SECURITY: escape user/canvas data before inserting into innerHTML ---
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// --- PERFORMANCE: debounced icon refresh (must be first — called at top-level during init) ---
let _lucideTimer = null;
function _refreshIcons(container) {
  if (!window.lucide) return;
  clearTimeout(_lucideTimer);
  _lucideTimer = setTimeout(function() {
    try {
      if (container) {
        const els = Array.from(container.querySelectorAll('[data-lucide]'));
        if (els.length) { lucide.createIcons({ nodes: els }); return; }
      }
      lucide.createIcons();
    } catch(e) { try { lucide.createIcons(); } catch(_) {} }
  }, 30);
}
window._refreshIcons = _refreshIcons;

// --- GLOBAL STATE ---
// Únicas fontes de verdade — sem espelhamento avulso/por-frame (não existe
// conceito de frame no hac).
let a11yAreas = [];
let a11ySpecs = [];
let tabOrderItems = [];

let hacData = {
  _schemaVersion: 1,
  a11yAreas: [],
  a11ySpecs: [],
  tabOrderItems: [],
  currentUser: null,
  // Origem (web/mobile) do PROJETO/ARQUIVO inteiro — não por-área. Decisão
  // de produto de 2026-09-02: reverte a pergunta bloqueante repetida (que
  // rodava em Marcar Área, Detecção Automática E Ordem de Tabulação,
  // gerando a impressão de loop quando essas ações rodam em sequência).
  // O designer confirma "web ou mobile" UMA VEZ por arquivo; a resposta
  // persiste aqui (mesmo hacData, mesmo save-storage/clientStorage escopado
  // por fileKey já usado por tudo mais) e é reaproveitada por todo ponto que
  // precisar da origem. null = ainda não perguntado (inclusive hacData de
  // arquivos salvos antes desta versão, que não têm o campo — migração é
  // automática por ausência, sem precisar tocar em _schemaVersion).
  // Editável a qualquer momento na modal "Sobre o hac" (ver
  // setProjectOrigin/openA11yProjectOriginPrompt em accessibility.js).
  projectOrigin: null
};

// Expose functions to window IMMEDIATELY
Object.assign(window, {
  toggleTheme,
  toggleUiScale,
  toggleCollapse,
  navigate,
  toggleAccordion,
  collapseAllAccordions,
  scrollToTop,
  handleScroll,
  showToast,
  focusNode,
  saveToStorage,
  openModal,
  closeModal,
  ensureExpanded,
  clearPluginCache
});

function clearPluginCache() {
  const confirmed = window.confirm(
    'Limpar todo o cache do plugin?\n\nIsso removerá: áreas marcadas, especificações de acessibilidade e ordem de tabulação.\n\nEssa ação não pode ser desfeita.'
  );
  if (!confirmed) return;
  parent.postMessage({ pluginMessage: { type: 'clear-cache' } }, '*');
}

// ── Storage ────────────────────────────────────────────────────────────
function saveToStorage() {
  hacData.a11yAreas = a11yAreas;
  hacData.a11ySpecs = a11ySpecs;
  hacData.tabOrderItems = tabOrderItems;
  parent.postMessage({ pluginMessage: { type: 'save-storage', data: hacData } }, '*');
}

// Mostra toast de salvo ao adicionar qualquer item relevante
function _toastSaved() {
  showToast('Salvo automaticamente', 'success');
}
window._toastSaved = _toastSaved;

function removeA11ySpecById(specId) {
  if (!specId) return;
  a11ySpecs = a11ySpecs.filter(s => s.id !== specId);
  saveToStorage();
}
window.removeA11ySpecById = removeA11ySpecById;

function removeA11yAreaById(areaId) {
  if (!areaId) return;
  a11yAreas = a11yAreas.filter(a => a.id !== areaId);
  saveToStorage();
}
window.removeA11yAreaById = removeA11yAreaById;

function removeTabOrderItemById(itemId) {
  if (!itemId) return;
  tabOrderItems = tabOrderItems.filter(i => i.id !== itemId);
  saveToStorage();
}
window.removeTabOrderItemById = removeTabOrderItemById;

document.addEventListener('DOMContentLoaded', () => {
  _refreshIcons();
});

// ── Plugin Collapse / Expand ──────────────────────────────────────────
let isCollapsed = false;
const FULL_W = 480, FULL_H = 750;
const MINI_H = 44;

function toggleCollapse() {
  isCollapsed = !isCollapsed;
  const mainContent = document.querySelector('body > div.flex-1');
  const collapseBtn = document.getElementById('btn-collapse');
  const btnTop = document.getElementById('btn-top');
  if (isCollapsed) {
    if (mainContent) mainContent.classList.add('hidden');
    if (collapseBtn) collapseBtn.innerHTML = '<i data-lucide="maximize-2" class="w-4 h-4" aria-hidden="true"></i>';
    if (btnTop) { btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10'); btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0'); }
  } else {
    if (mainContent) mainContent.classList.remove('hidden');
    if (collapseBtn) collapseBtn.innerHTML = '<i data-lucide="minimize-2" class="w-4 h-4" aria-hidden="true"></i>';
  }
  const _scale = window.currentUiScale || 1;
  const _collapsedH = Math.round(MINI_H * _scale);
  parent.postMessage({ pluginMessage: { type: 'resize-ui', width: FULL_W, height: isCollapsed ? _collapsedH : FULL_H } }, '*');
  _refreshIcons();
}

function ensureExpanded() {
  if (isCollapsed) toggleCollapse();
}

function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) { }
  document.querySelectorAll(".sun-icon").forEach(el => el.classList.toggle("hidden", isDark));
  document.querySelectorAll(".moon-icon").forEach(el => el.classList.toggle("hidden", !isDark));
  _refreshIcons();
}

function showToast(message, variant) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const isError = variant === 'error';
  const toast = document.createElement('div');
  // Variante de erro (bloqueio ativo, ex.: clique rejeitado na Ordem de
  // Tabulação) precisa ser visualmente distinta do toast padrão de
  // sucesso/informação — mesmo fundo escuro base do padrão do plugin, mas
  // com borda/ícone em vermelho (mesma paleta de erro usada em
  // modals.html, ex. text-red-500/border-red-500) em vez do check verde.
  toast.className = isError
    ? 'bg-slate-800 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-2 border border-red-500'
    : 'bg-slate-800 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-2';
  toast.innerHTML = isError
    ? `<i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-red-500"></i>`
    : `<i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-green-400"></i>`;
  const _tn = document.createTextNode(' ' + message);
  toast.appendChild(_tn);
  container.appendChild(toast);
  try { _refreshIcons(); } catch(e) {}
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// Snackbar — variante mais persistente do toast, para mensagens longas que
// precisam de mais tempo de leitura (ex.: instrução com múltiplas
// informações). Diferenças em relação a showToast: botão de fechar (X)
// explícito, sem timeout automático por padrão (permanece até o usuário
// fechar), largura maior para acomodar texto extenso, e cor de destaque do
// hac (cyan) em vez do check verde/erro vermelho do toast padrão — sinaliza
// visualmente que é uma instrução, não uma confirmação ou erro. Segue o
// padrão GOV.BR de snackbar: mensagem + ação/fechamento manual quando o
// conteúdo exige leitura mais atenta em vez de sumir sozinho.
// options.duration: se informado (ms), some sozinho após esse tempo (além
// do botão de fechar continuar disponível); default undefined = permanece
// até fechamento manual.
// options.actionLabel/options.onAction: botão de ação opcional entre o texto
// e o fechar (ex.: "Continuar revisão"). Clicar nele também fecha o
// snackbar — chama o mesmo dismiss() do botão de fechar, não só o callback.
function showSnackbar(message, options) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const duration = options && options.duration;
  const actionLabel = options && options.actionLabel;
  const onAction = options && options.onAction;
  const snackbar = document.createElement('div');
  snackbar.className = 'bg-slate-800 text-white px-4 py-3 rounded-2xl shadow-xl text-xs font-medium animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-start gap-2 border border-cyan-600 max-w-sm pointer-events-auto';
  snackbar.innerHTML = `<i data-lucide="info" class="w-3.5 h-3.5 text-cyan-400 mt-0.5 flex-shrink-0"></i>`;
  const dismiss = () => {
    snackbar.classList.add('fade-out');
    setTimeout(() => snackbar.remove(), 300);
  };
  const contentCol = document.createElement('div');
  contentCol.className = 'flex-1 min-w-0 flex flex-col gap-1.5';
  const textSpan = document.createElement('span');
  textSpan.className = 'leading-relaxed';
  textSpan.appendChild(document.createTextNode(message));
  contentCol.appendChild(textSpan);
  if (actionLabel && typeof onAction === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'self-start text-cyan-400 hover:text-cyan-300 font-bold underline transition-colors';
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener('click', () => {
      dismiss();
      onAction();
    });
    contentCol.appendChild(actionBtn);
  }
  snackbar.appendChild(contentCol);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Fechar aviso');
  closeBtn.className = 'flex-shrink-0 text-slate-400 hover:text-white transition-colors';
  closeBtn.innerHTML = `<i data-lucide="x" class="w-3.5 h-3.5"></i>`;
  closeBtn.addEventListener('click', dismiss);
  snackbar.appendChild(closeBtn);
  container.appendChild(snackbar);
  try { _refreshIcons(); } catch(e) {}
  if (duration) setTimeout(dismiss, duration);
}

const FOCUSABLE_SELECTOR = 'input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';
const _modalReturnFocus = {};

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // Fecha qualquer outro modal que já esteja visível antes de abrir este —
  // todo chamador do resto do código já fecha manualmente o modal anterior
  // antes de abrir o próximo (padrão consistente em accessibility.js), então
  // isso nunca deveria acionar em uso normal; é uma rede de segurança contra
  // dois modais nascendo empilhados por engano (ex: um clique perdido que
  // deixa um modal aberto sem feedback visual óbvio, seguido de outro clique
  // que abre um segundo por cima sem o usuário perceber que o primeiro já
  // estava lá).
  document.querySelectorAll('[id$="-modal"]:not(.hidden)').forEach(other => {
    if (other.id !== id) other.classList.add('hidden');
  });
  _modalReturnFocus[id] = document.activeElement;
  el.classList.remove("hidden");
  const focusTarget = el.querySelector(FOCUSABLE_SELECTOR);
  if (focusTarget) {
    focusTarget.focus();
  } else {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus();
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
  const returnEl = _modalReturnFocus[id];
  if (returnEl && document.contains(returnEl)) returnEl.focus();
  delete _modalReturnFocus[id];
}

// Fecha o modal visível com maior z-index ao pressionar Escape (topo em caso de sobreposição).
// Focus trap completo (ciclagem via Tab) não foi implementado — apenas foco
// inicial, devolução de foco e Escape.
//
// Portado do bug histórico do Handex (fix-toast-spec-fantasma-v2): chamar
// sempre closeModal(id) genérico (só esconde o elemento) pula a limpeza de
// estado que modais com fluxo próprio precisam — no hac isso é
// especialmente relevante pro modal de Ordem de Tabulação, cujo fluxo de
// captura de clique sequencial (equivalente a window._tabOrderCaptureMode
// no Handex) precisa ser cancelado ao fechar, senão o backend continua
// postando eventos de seleção para uma escuta que a UI já considera
// encerrada. Resolvido de forma genérica: lê o onclick do botão "Fechar"/
// "Cancelar" do cabeçalho do modal e invoca ela mesma em vez de
// closeModal(id) direto. Antes lia o backdrop clicável (div .absolute
// atrás do card) — os modais viraram tela cheia sem backdrop (2026-09), então
// a fonte da verdade do "fluxo de fechamento próprio" passou a ser esse botão.
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  const visibleModals = Array.from(document.querySelectorAll('[id$="-modal"]:not(.hidden)'));
  if (!visibleModals.length) return;
  let topModal = visibleModals[0];
  let topZ = parseInt(getComputedStyle(topModal).zIndex, 10) || 0;
  for (const m of visibleModals) {
    const z = parseInt(getComputedStyle(m).zIndex, 10) || 0;
    if (z >= topZ) { topZ = z; topModal = m; }
  }
  const closeBtn = topModal.querySelector(
    'button[title="Fechar"][onclick], button[title="Cancelar"][onclick], button[aria-label="Fechar"][onclick], button[aria-label="Cancelar"][onclick]'
  );
  const closeOnclick = closeBtn && closeBtn.getAttribute('onclick');
  const fnMatch = closeOnclick && closeOnclick.match(/^([A-Za-z_$][\w$]*)\(\)$/);
  if (fnMatch && typeof window[fnMatch[1]] === 'function') {
    window[fnMatch[1]]();
  } else {
    closeModal(topModal.id);
  }
});

// ── Navigation ─────────────────────────────────────────────────────────
// O hac tem só duas views (view-home, view-specifications) — build.cjs
// monta ambas dentro do mesmo container e alterna via classe `.active`,
// igual ao padrão de múltiplas views do Handex (não colapsado em view
// única porque a tela de especificações precisa de espaço próprio para
// as listas agrupadas por área, e Home funciona como painel de entrada/
// resumo). Mantém a mesma guarda de segurança do Handex: trocar de view
// com uma captura de clique de Ordem de Tabulação pendente precisa
// cancelá-la, senão o backend segue postando seleções para uma escuta
// que a UI já abandonou.
function navigate(viewId) {
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.scrollTop = 0;
    targetView.querySelectorAll('.overflow-y-auto').forEach(c => { c.scrollTop = 0; });
    targetView.classList.add("active");
  }
  const btnTop = document.getElementById('btn-top');
  if (btnTop) {
    btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
    btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
  }
  if (window._tabOrderCaptureMode && typeof cancelTabOrderReview === 'function') {
    cancelTabOrderReview();
  }
  if (viewId === 'view-specifications') {
    if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
    if (typeof maybeShowOnboardingBanner === 'function') maybeShowOnboardingBanner('especificar');
  }
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

  // Accordions com nodeId são exclusivos: abrir um fecha os irmãos,
  // mantendo o item expandido na lista sempre sincronizado com o highlight no canvas.
  if (nodeId && isHidden) {
    const list = btn.closest('ul, [data-accordion-list]');
    if (list) {
      list.querySelectorAll('[data-accordion-toggle]').forEach(otherBtn => {
        if (otherBtn === btn) return;
        const otherParent = otherBtn.closest('.border, .rounded-xl, .mb-3');
        const otherContent = otherParent ? otherParent.querySelector('.accordion-content, [data-accordion-content]') : null;
        if (otherContent && !otherContent.classList.contains('hidden')) {
          otherContent.classList.add('hidden');
          otherBtn.setAttribute('aria-expanded', 'false');
          const otherIcon = otherBtn.querySelector('[data-lucide="chevron-down"]');
          if (otherIcon) otherIcon.style.transform = "rotate(0deg)";
        }
      });
    }
  }

  content.classList.toggle("hidden");
  btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  if (icon) icon.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
  if (nodeId) {
    if (isHidden) {
      parent.postMessage({ pluginMessage: { type: 'highlight-node', id: nodeId, highlight: false, shouldScroll: true } }, '*');
    } else {
      parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
    }
  }
}

function collapseAllAccordions(containerEl) {
  const root = containerEl || document;
  const allContent = root.querySelectorAll('.accordion-content, [data-accordion-content]');
  let anyOpen = false;
  allContent.forEach(c => { if (!c.classList.contains('hidden')) anyOpen = true; });
  // If any open → collapse all; if all closed → expand all
  allContent.forEach(c => {
    const isHidden = c.classList.contains('hidden');
    if (anyOpen ? !isHidden : isHidden) {
      c.classList.toggle('hidden');
      const parent = c.closest('.border, .rounded-xl, .mb-3');
      const btn = parent ? parent.querySelector('[onclick*="toggleAccordion"]') : null;
      if (btn) {
        btn.setAttribute('aria-expanded', anyOpen ? 'false' : 'true');
        const icon = btn.querySelector('[data-lucide="chevron-down"]');
        if (icon) icon.style.transform = anyOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    }
  });
  const toggleBtn = root.querySelector ? root.querySelector('[data-collapse-toggle]') : null;
  if (toggleBtn) {
    const icon = toggleBtn.querySelector('i[data-lucide]');
    if (icon) { icon.setAttribute('data-lucide', anyOpen ? 'chevrons-down' : 'chevrons-up'); if (typeof _refreshIcons === 'function') _refreshIcons(); }
  }
}

// ── Scroll ─────────────────────────────────────────────────────────────
function handleScroll(el) {
  const btnTop = document.getElementById('btn-top');
  if (!btnTop) return;
  if (!isCollapsed && el.scrollTop > 100) {
    btnTop.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
    btnTop.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
  } else {
    btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
    btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
  }
}

function scrollToTop() {
  const visibleModals = Array.from(document.querySelectorAll('[id$="-modal"]:not(.hidden)'));
  if (visibleModals.length > 0) {
    const modal = visibleModals[visibleModals.length - 1];
    const scrollable = modal.querySelector('.overflow-y-auto') || modal;
    scrollable.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const activeView = document.querySelector('.view.active');
  if (activeView) {
    const mainScroll = activeView.querySelector('.flex-1.overflow-y-auto') ||
                       activeView.querySelector('.overflow-y-auto') ||
                       document.querySelector('.flex-1.overflow-y-auto.relative');
    if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function autoScrollToNewItem(containerId, targetElement = null) {
  setTimeout(() => {
    const target = targetElement
      || document.getElementById(containerId)?.lastElementChild;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      target.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
      setTimeout(() => target.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2'), 2000);
    }
  }, 100);
}
window.autoScrollToNewItem = autoScrollToNewItem;

function focusNode(id) {
  parent.postMessage({ pluginMessage: { type: 'highlight-node', id, highlight: true, shouldScroll: true, color: '#0070af' } }, '*');
}

// Destaque transitório (retângulo HighlightStroke) pra qualquer lista que
// queira dar um preview do elemento no canvas ao passar o mouse — não
// seleciona nem rola a tela, e some assim que o mouse sai (clearHighlight).
function sendHighlight(figmaId) {
  if (figmaId) {
    parent.postMessage({ pluginMessage: { type: 'highlight-node', id: figmaId, highlight: true, shouldScroll: false, selectNode: false, color: '#0070af' } }, '*');
  }
}
function clearHighlight() {
  parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
}
window.sendHighlight = sendHighlight;
window.clearHighlight = clearHighlight;

// ── Initialization ─────────────────────────────────────────────────────
window.addEventListener('load', () => {
  try { _refreshIcons(); } catch(e) {}
  parent.postMessage({ pluginMessage: { type: 'ui-ready' } }, '*');
  if (typeof initResizable === 'function') initResizable();
  if (hacData && hacData.uiScale) setUiScale(hacData.uiScale);
});

function initResizable() {
  const handle = document.getElementById('resize-handle');
  if (!handle) return;
  let isResizing = false, startX, startY, startW, startH;
  handle.addEventListener('mousedown', (e) => {
    isResizing = true; startX = e.clientX; startY = e.clientY;
    startW = window.innerWidth; startH = window.innerHeight;
    document.body.style.cursor = 'nwse-resize'; e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    parent.postMessage({ pluginMessage: { type: 'resize', width: Math.round(Math.max(300, startW + (e.clientX - startX))), height: Math.round(Math.max(300, startH + (e.clientY - startY))) } }, '*');
  });
  window.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = 'default'; });
}
window.initResizable = initResizable;

window.currentUiScale = 1;
function setUiScale(scale) {
  window.currentUiScale = scale;
  document.documentElement.style.setProperty('--ui-scale', scale);
  document.body.classList.toggle('scale-high', scale > 1.1);
  if (typeof hacData !== 'undefined') { hacData.uiScale = scale; saveToStorage(); }
  const btnOut = document.getElementById('btn-zoom-out');
  const btnIn  = document.getElementById('btn-zoom-in');
  if (btnOut) btnOut.classList.toggle('hidden', scale <= 1);
  if (btnIn)  btnIn.classList.toggle('hidden', scale >= 1.3);
}
window.setUiScale = setUiScale;

const _ZOOM_STEPS = [1, 1.15, 1.3];

function zoomIn() {
  const idx = _ZOOM_STEPS.indexOf(window.currentUiScale);
  const next = idx === -1 ? _ZOOM_STEPS[0] : (_ZOOM_STEPS[idx + 1] || _ZOOM_STEPS[_ZOOM_STEPS.length - 1]);
  setUiScale(next);
  showToast(`Escala da UI: ${Math.round(next * 100)}%`);
}
window.zoomIn = zoomIn;

function zoomOut() {
  const idx = _ZOOM_STEPS.indexOf(window.currentUiScale);
  const prev = idx <= 0 ? _ZOOM_STEPS[0] : _ZOOM_STEPS[idx - 1];
  setUiScale(prev);
  showToast(`Escala da UI: ${Math.round(prev * 100)}%`);
}
window.zoomOut = zoomOut;

function toggleUiScale() { zoomIn(); }
