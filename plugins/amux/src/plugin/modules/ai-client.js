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
  setTimeout(() => renderScore(), 50);
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
  amuxData.aiAnalysis.lastRunAt = new Date().toISOString();
  amuxData.aiAnalysis.agentResponses = result.agentResponses || {};
  amuxData.aiAnalysis.scoreBreakdown = result.scoreBreakdown || {};
  amuxData.score = {
    numeric: result.score?.numeric || 0,
    stars: result.score?.stars || 0,
    computedAt: new Date().toISOString()
  };
  saveState();
  _renderAiStatus();
  renderScore();
  renderScoreBreakdown();
  updateHomeBadges();
  showToast('Análise de IA concluída.', 'success');
}

function _onAiAnalysisError(error) {
  amuxData.aiAnalysis.status = 'error';
  saveState();
  _renderAiStatus();
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

function renderScoreBreakdown() {
  const container = document.getElementById('score-breakdown');
  if (!container) return;
  const breakdown = amuxData.aiAnalysis.scoreBreakdown || {};
  const responses = amuxData.aiAnalysis.agentResponses || {};
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
    designSystem: 'Design System', acessibilidade: 'Acessibilidade'
  };

  container.innerHTML = dims.map(dim => {
    const nota = breakdown[dim];
    const comentario = responses[dim]?.comentario || '';
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
      </div>`;
  }).join('');

  try { lucide.createIcons(); } catch(e) {}
}

Object.assign(window, {
  navigateToScore, runAiAnalysis, renderScoreBreakdown,
  _onAiAnalysisComplete, _onAiAnalysisError, _renderAiStatus
});
