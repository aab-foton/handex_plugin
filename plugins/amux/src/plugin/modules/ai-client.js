// ============================================================
// ai-client.js — Ponte com a análise de IA (AMUX)
// Isola toda a lógica de "chamar a IA" do frontend: monta o
// payload a partir de amuxData, dispara a mensagem para o
// backend e trata a resposta (ou erro). Ver src/plugin/ai/
// foundry-client.js para o lado backend (hoje mock, desenhado
// para receber o orquestrador Microsoft Foundry no futuro).
// ============================================================

function navigateToScore() {
  navigate('view-score');
  setTimeout(() => { renderScore(); _renderScoreProvenance(); renderHistory(); }, 50);
}

function runAiAnalysis() {
  if (amuxData.aiAnalysis.status === 'processing') return;

  amuxData.aiAnalysis.status = 'processing';
  _renderAiStatus();
  saveState();

  const payload = {
    projectId: amuxData.projectId,
    briefing: amuxData.briefing,
    evidencias: amuxData.evidencias,
    auditoria: amuxData.auditoria
  };

  parent.postMessage({ pluginMessage: { type: 'analyze-with-ai', payload } }, '*');
}

function _onAiAnalysisComplete(result) {
  amuxData.aiAnalysis.status = 'done';
  amuxData.aiAnalysis.fonte = result.fonte || 'mock';
  amuxData.aiAnalysis.lastRunAt = new Date().toISOString();
  amuxData.aiAnalysis.agentResponses = result.agentResponses || {};
  amuxData.aiAnalysis.scoreBreakdown = result.scoreBreakdown || {};
  amuxData.aiAnalysis.checklistResults = result.checklistResults || {};
  amuxData.score = {
    numeric: result.score?.numeric || 0,
    stars: result.score?.stars || 0,
    computedAt: new Date().toISOString()
  };
  saveState();
  _renderAiStatus();
  _renderScoreProvenance();
  renderScore();
  renderScoreBreakdown();
  renderHistory();
  updateHomeBadges();
  showToast('Análise de IA concluída.', 'success');
}

function _onAiAnalysisError(error) {
  amuxData.aiAnalysis.status = 'error';
  amuxData.aiAnalysis.lastErrorAt = new Date().toISOString();
  saveState();
  _renderAiStatus();
  _renderScoreProvenance();
  showToast('Não foi possível concluir a análise de IA.', 'error');
}

function _renderAiStatus() {
  const el = document.getElementById('ai-status');
  if (!el) return;
  const status = amuxData.aiAnalysis.status;
  const map = {
    idle:       { text: 'Pronto para analisar', icon: 'sparkles', cls: 'text-slate-400' },
    processing: { text: 'Analisando com IA...', icon: 'loader-circle', cls: 'text-blue-500 animate-spin' },
    done:       { text: 'Análise concluída', icon: 'check-circle-2', cls: 'text-emerald-500' },
    error:      { text: 'Falha na análise — tente novamente', icon: 'alert-circle', cls: 'text-red-500' }
  };
  const s = map[status] || map.idle;
  el.innerHTML = `<i data-lucide="${s.icon}" class="w-4 h-4 ${s.cls}"></i><span class="text-[12px] font-bold ${s.cls.replace('animate-spin','')}">${s.text}</span>`;

  const btn = document.getElementById('btn-run-ai');
  if (btn) btn.disabled = status === 'processing';

  try { lucide.createIcons(); } catch(e) {}
}

function _renderScoreProvenance() {
  const banner = document.getElementById('score-provenance-banner');
  if (banner) {
    const fonte = amuxData.aiAnalysis.fonte;
    const map = {
      mock: {
        cls: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300',
        icon: 'flask-conical',
        title: 'Avaliação simulada — ainda não é uma análise real de IA',
        body: 'As notas abaixo usam uma simulação para fins de demonstração do AMUX. Quando a integração com o motor de IA da CAIXA estiver disponível, este aviso sai automaticamente.'
      },
      foundry: {
        cls: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
        icon: 'shield-check',
        title: 'Avaliação gerada pelo motor de IA da CAIXA',
        body: 'Estas notas vêm de uma análise real via Azure AI Foundry.'
      }
    };
    const p = map[fonte];
    if (p) {
      banner.className = `mb-3 p-3 rounded-xl border flex gap-2.5 ${p.cls}`;
      banner.innerHTML = `
        <i data-lucide="${p.icon}" class="w-4 h-4 shrink-0 mt-0.5"></i>
        <div class="space-y-0.5">
          <p class="text-[11px] font-extrabold leading-tight">${p.title}</p>
          <p class="text-[10px] leading-snug opacity-90">${p.body}</p>
        </div>`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
      banner.innerHTML = '';
    }
  }

  const stale = document.getElementById('score-stale-banner');
  if (stale) {
    const { status, lastErrorAt } = amuxData.aiAnalysis;
    const computedAt = amuxData.score?.computedAt;
    if (status === 'error' && computedAt && lastErrorAt) {
      const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      stale.innerHTML = `
        <i data-lucide="clock-alert" class="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400"></i>
        <p class="text-[10px] leading-snug text-slate-400 dark:text-dark-muted">
          Última nota válida: ${fmt(computedAt)}. A tentativa mais recente (${fmt(lastErrorAt)}) falhou — o score exibido acima ainda é o anterior.
        </p>`;
      stale.classList.remove('hidden');
    } else {
      stale.classList.add('hidden');
      stale.innerHTML = '';
    }
  }

  try { lucide.createIcons(); } catch(e) {}
}

// ── Histórico de auditorias ──────────────────────────────────
// "Fechar auditoria" é uma ação humana deliberada, distinta de
// rodar a análise de IA — evita que testes/cliques repetidos em
// "Analisar com IA" virem ruído no histórico de maturidade.
function closeAuditRound() {
  if (amuxData.aiAnalysis.status !== 'done') return;

  let closedBy = '';
  try { closedBy = window.__amuxCurrentUser || ''; } catch (e) {}

  const entry = {
    id: _generateId(),
    projectId: amuxData.projectId,
    closedAt: new Date().toISOString(),
    closedBy,
    label: '',
    score: { numeric: amuxData.score.numeric, stars: amuxData.score.stars },
    scoreBreakdown: { ...amuxData.aiAnalysis.scoreBreakdown }
  };

  amuxData.history = [entry, ...(amuxData.history || [])].slice(0, AMUX_HISTORY_CAP);
  saveState();
  renderHistory();
  showToast('Auditoria registrada no histórico.', 'success');
}

function renderHistory() {
  const container = document.getElementById('score-history');
  if (!container) return;
  const history = amuxData.history || [];

  const btn = document.getElementById('btn-close-audit');
  if (btn) btn.disabled = amuxData.aiAnalysis.status !== 'done';

  if (history.length === 0) {
    container.innerHTML = `<p class="text-[10px] text-slate-400 dark:text-dark-muted text-center py-3">Nenhuma auditoria registrada ainda.</p>`;
    return;
  }

  container.innerHTML = history.map((h, i) => {
    const prev = history[i + 1];
    const delta = prev ? h.score.numeric - prev.score.numeric : null;
    const deltaHtml = delta === null
      ? `<span class="text-[10px] text-slate-300 dark:text-dark-muted">—</span>`
      : delta > 0
        ? `<span class="text-[10px] font-bold text-emerald-600">+${delta}</span>`
        : delta < 0
          ? `<span class="text-[10px] font-bold text-red-500">${delta}</span>`
          : `<span class="text-[10px] font-bold text-slate-400">±0</span>`;
    const data = new Date(h.closedAt).toLocaleDateString('pt-BR');
    return `
      <div class="flex items-center justify-between gap-2 bg-slate-50 dark:bg-dark-bg/40 border border-gray-100 dark:border-dark-line rounded-xl px-3 py-2">
        <div class="min-w-0">
          <p class="text-[11px] font-bold text-slate-700 dark:text-white truncate">${h.label || `Auditoria de ${data}`}</p>
          <p class="text-[10px] text-slate-400">${data}${h.closedBy ? ` · ${h.closedBy}` : ''}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${deltaHtml}
          <span class="text-[11px] font-extrabold text-slate-700 dark:text-white">${h.score.numeric}/100</span>
        </div>
      </div>`;
  }).join('');
}

function renderScoreBreakdown() {
  const container = document.getElementById('score-breakdown');
  if (!container) return;
  const breakdown = amuxData.aiAnalysis.scoreBreakdown || {};
  const responses = amuxData.aiAnalysis.agentResponses || {};
  const checklistResults = amuxData.aiAnalysis.checklistResults || {};
  const dims = Object.keys(breakdown);

  if (dims.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400 dark:text-dark-muted">
        <i data-lucide="bar-chart-3" class="w-6 h-6 mx-auto mb-1.5 opacity-40"></i>
        <p class="text-[11px]">Rode a análise de IA para ver o detalhamento por dimensão.</p>
      </div>`;
    try { lucide.createIcons(); } catch(e) {}
    return;
  }

  const dimLabels = {
    descoberta: 'Descoberta', definicao: 'Definição', ideacao: 'Ideação', validacao: 'Validação',
    posLancamento: 'Pós-lançamento', designSystem: 'Design System', acessibilidade: 'Acessibilidade'
  };

  container.innerHTML = dims.map((dim, idx) => {
    const nota = breakdown[dim];
    const comentario = responses[dim]?.comentario || '';
    const items = checklistResults[dim] || [];
    const detailId = `checklist-detail-${idx}`;
    return `
      <div class="bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl p-3 space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-700 dark:text-white">${dimLabels[dim] || dim}</span>
          <span class="text-[11px] font-extrabold text-blue-600">${nota}/100</span>
        </div>
        <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-blue-500 rounded-full" style="width:${nota}%"></div>
        </div>
        ${comentario ? `<p class="text-[10px] text-slate-400 leading-relaxed">${comentario}</p>` : ''}
        ${items.length > 0 ? `
          <button onclick="document.getElementById('${detailId}').classList.toggle('hidden')" class="text-[10px] font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1 pt-0.5">
            <i data-lucide="list-checks" class="w-3 h-3"></i> Ver checklist balizador (${items.filter(i => i.passed).length}/${items.length})
          </button>
          <div id="${detailId}" class="hidden space-y-1 pt-1">
            ${items.map(i => `
              <div class="flex items-start gap-1.5">
                <i data-lucide="${i.passed ? 'check-circle-2' : 'circle'}" class="w-3 h-3 shrink-0 mt-0.5 ${i.passed ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}"></i>
                <span class="text-[10px] leading-snug ${i.passed ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-dark-muted'}">${i.label}</span>
              </div>`).join('')}
          </div>` : ''}
      </div>`;
  }).join('');

  try { lucide.createIcons(); } catch(e) {}
}

Object.assign(window, {
  navigateToScore, runAiAnalysis, renderScoreBreakdown,
  _onAiAnalysisComplete, _onAiAnalysisError, _renderAiStatus, _renderScoreProvenance,
  closeAuditRound, renderHistory
});
