// ============================================================
// usability-test.js — Teste de Usabilidade: planejar, rodar,
// coletar e analisar sessões de teste (PRISMA)
// Não é um framework (não desenha algo estático no canvas) nem um
// artefato simples de evidência — é um processo com fases próprias,
// múltiplas sessões por teste, e achados sintetizados ao final.
// A ponte com a Auditoria (evidencias.validacao) vive em
// usability-test-bridge, mais abaixo neste mesmo arquivo.
// ============================================================

let _activeTestId = null;
let _activeTestTab = 'planejar';

function _findTest(id) {
  return (prismaData.usabilityTests || []).find(t => t.id === id);
}

// _activeTestId é privado ao módulo (closure) — onclick inline no HTML
// não alcança variáveis de módulo diretamente, por isso este getter.
function getActiveUsabilityTestId() {
  return _activeTestId;
}

// ── Lista de testes (tela inicial do card) ──────────────────────
function navigateToUsabilityTests() {
  navigate('view-usability-test-list');
  renderUsabilityTestList();
}

function renderUsabilityTestList() {
  const container = document.getElementById('ux-test-list');
  if (!container) return;
  const tests = prismaData.usabilityTests || [];

  if (tests.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-slate-400 dark:text-dark-muted">
        <i data-lucide="users-round" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
        <p class="text-[12px]">Nenhum teste de usabilidade criado ainda.</p>
        <p class="text-[11px] mt-1 opacity-70">Crie um teste para planejar tarefas e registrar sessões.</p>
      </div>`;
    try { lucide.createIcons(); } catch(e) {}
    return;
  }

  container.innerHTML = tests.map(t => {
    const m = _testMetrics(t);
    const statusCls = t.status === 'concluido' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
      : t.status === 'em-andamento' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-dark-muted';
    const statusLabel = t.status === 'concluido' ? 'Concluído' : t.status === 'em-andamento' ? 'Em andamento' : 'Planejamento';
    return `
    <div class="relative group bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-2xl p-3.5 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
      <button onclick="removeUsabilityTest('${t.id}')" title="Apagar teste" aria-label="Apagar teste"
        class="absolute top-2.5 right-2.5 p-1 text-slate-300 hover:text-red-400 transition-colors z-10">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
      <button onclick="openUsabilityTest('${t.id}')" class="w-full text-left">
        <div class="flex items-center gap-2 mb-1.5 pr-6">
          <p class="font-extrabold text-[12px] text-slate-800 dark:text-white truncate flex-1">${t.nome || 'Teste sem nome'}</p>
          <span class="shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded-full ${statusCls}">${statusLabel}</span>
        </div>
        <p class="text-[10px] text-slate-400 dark:text-dark-muted truncate mb-2">${t.objetivo || 'Sem objetivo definido.'}</p>
        <div class="flex items-center gap-3 text-[10px] text-slate-500 dark:text-dark-muted">
          <span class="flex items-center gap-1"><i data-lucide="list-checks" class="w-3 h-3"></i> ${t.tarefas.length} tarefa(s)</span>
          <span class="flex items-center gap-1"><i data-lucide="users" class="w-3 h-3"></i> ${t.sessoes.length} sessão(ões)</span>
          ${t.sessoes.length > 0 ? `<span class="flex items-center gap-1"><i data-lucide="check-circle-2" class="w-3 h-3"></i> ${m.taxaSucessoGeral}% sucesso</span>` : ''}
        </div>
      </button>
    </div>`;
  }).join('');

  try { lucide.createIcons(); } catch(e) {}
}

let _editingTestId = null;

function createUsabilityTest() {
  const nome = (document.getElementById('ux-test-new-nome')?.value || '').trim();
  if (!nome) {
    showToast('Informe um nome para o teste.', 'error');
    return;
  }
  const objetivo = (document.getElementById('ux-test-new-objetivo')?.value || '').trim();

  // Modal é compartilhada entre criar e editar (ver openEditUsabilityTestModal)
  // — _editingTestId marcado indica que é edição, não criação nova.
  if (_editingTestId) {
    const test = _findTest(_editingTestId);
    if (test) {
      test.nome = nome;
      test.objetivo = objetivo;
      saveState();
      renderUsabilityTestDetail();
      if (document.getElementById('view-usability-test-list')?.classList.contains('active')) renderUsabilityTestList();
    }
    _editingTestId = null;
    closeNewUsabilityTestModal();
    showToast('Teste atualizado.', 'success');
    return;
  }

  const test = {
    id: _generateId(),
    nome,
    objetivo,
    criadoEm: new Date().toISOString(),
    status: 'planejamento',
    tarefas: [],
    sessoes: [],
    achados: []
  };
  prismaData.usabilityTests.push(test);
  saveState();
  updateHomeBadges();
  closeNewUsabilityTestModal();
  openUsabilityTest(test.id);
}

function openEditUsabilityTestModal(id) {
  const test = _findTest(id);
  if (!test) return;
  _editingTestId = id;
  document.getElementById('ux-test-new-modal-title').textContent = 'Editar teste';
  document.getElementById('ux-test-new-confirm-btn').textContent = 'Salvar';
  const nomeEl = document.getElementById('ux-test-new-nome');
  const objEl = document.getElementById('ux-test-new-objetivo');
  if (nomeEl) nomeEl.value = test.nome || '';
  if (objEl) objEl.value = test.objetivo || '';
  document.getElementById('modal-new-usability-test')?.classList.remove('hidden');
}

let _pendingDeleteTestId = null;

// Apagar é destrutivo e não tem "desfazer" — passa por confirmação antes
// de aplicar, mesmo padrão bottom-sheet já usado para concluir teste (não
// confirm() nativo do browser, que dentro do iframe do Figma pode não se
// comportar de forma confiável entre plataformas).
function removeUsabilityTest(id) {
  const test = _findTest(id);
  if (!test) return;
  _pendingDeleteTestId = id;
  const nameEl = document.getElementById('delete-usability-test-name');
  if (nameEl) nameEl.textContent = test.nome || 'Teste sem nome';
  document.getElementById('modal-delete-usability-test')?.classList.remove('hidden');
}

function closeDeleteUsabilityTestModal() {
  document.getElementById('modal-delete-usability-test')?.classList.add('hidden');
  _pendingDeleteTestId = null;
}

function confirmDeleteUsabilityTest() {
  const id = _pendingDeleteTestId;
  closeDeleteUsabilityTestModal();
  if (!id) return;
  const wasActive = _activeTestId === id;
  prismaData.usabilityTests = (prismaData.usabilityTests || []).filter(t => t.id !== id);
  saveState();
  updateHomeBadges();
  showToast('Teste removido.', 'success');
  // Se apagado de dentro do próprio detalhe (não da lista), volta pra
  // lista — o detalhe não tem mais teste nenhum pra mostrar.
  if (wasActive) backToUsabilityTestList();
  else renderUsabilityTestList();
}

function openNewUsabilityTestModal() {
  _editingTestId = null;
  document.getElementById('ux-test-new-modal-title').textContent = 'Novo teste de usabilidade';
  document.getElementById('ux-test-new-confirm-btn').textContent = 'Criar teste';
  const nomeEl = document.getElementById('ux-test-new-nome');
  const objEl = document.getElementById('ux-test-new-objetivo');
  if (nomeEl) nomeEl.value = '';
  if (objEl) objEl.value = '';
  document.getElementById('modal-new-usability-test')?.classList.remove('hidden');
}

function closeNewUsabilityTestModal() {
  document.getElementById('modal-new-usability-test')?.classList.add('hidden');
  _editingTestId = null;
}

// ── Detalhe de um teste (planejar / rodar / coletar / analisar) ─
function openUsabilityTest(id) {
  const test = _findTest(id);
  if (!test) return;
  _activeTestId = id;
  navigate('view-usability-test-detail');
  selectUsabilityTestTab('planejar');
  renderUsabilityTestDetail();
}

function backToUsabilityTestList() {
  _activeTestId = null;
  navigateToUsabilityTests();
}

function selectUsabilityTestTab(tab) {
  _activeTestTab = tab;
  document.querySelectorAll('[data-ux-test-tab]').forEach(btn => {
    const active = btn.dataset.uxTestTab === tab;
    btn.className = `px-3 py-1.5 text-[11px] font-bold rounded-full transition-all flex items-center gap-1.5 ${
      active ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-dark-muted hover:bg-slate-200'
    }`;
  });
  document.querySelectorAll('[data-ux-test-panel]').forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.uxTestPanel !== tab);
  });
  renderUsabilityTestDetail();
}

// Ponto ao lado de cada rótulo de aba: verde quando a fase já tem conteúdo,
// cinza quando está vazia — evita que o usuário clique em "Rodar" ou
// "Analisar" sem saber de antemão se há pré-requisito faltando (tarefas
// definidas em Planejar, sessões registradas em Rodar).
function _updateUsabilityTabDots() {
  const test = _findTest(_activeTestId);
  if (!test) return;
  const done = {
    planejar: test.tarefas.length > 0,
    rodar: test.sessoes.length > 0,
    coletar: test.sessoes.length > 0,
    analisar: test.achados.length > 0
  };
  document.querySelectorAll('[data-ux-test-tab-dot]').forEach(dot => {
    const tab = dot.getAttribute('data-ux-test-tab-dot');
    const active = dot.closest('[data-ux-test-tab]')?.dataset.uxTestTab === _activeTestTab;
    dot.className = `w-1.5 h-1.5 rounded-full shrink-0 ${
      done[tab]
        ? (active ? 'bg-white' : 'bg-emerald-500')
        : (active ? 'bg-white/40' : 'bg-slate-300 dark:bg-slate-600')
    }`;
  });
}

function renderUsabilityTestDetail() {
  const test = _findTest(_activeTestId);
  if (!test) return;

  const titleEl = document.getElementById('ux-test-detail-title');
  if (titleEl) titleEl.textContent = test.nome;
  const subEl = document.getElementById('ux-test-detail-subtitle');
  if (subEl) subEl.textContent = test.objetivo || 'Sem objetivo definido.';
  _updateUsabilityTabDots();

  if (_activeTestTab === 'planejar') _renderPlanejar(test);
  if (_activeTestTab === 'rodar') _renderRodar(test);
  if (_activeTestTab === 'coletar') _renderColetar(test);
  if (_activeTestTab === 'analisar') _renderAnalisar(test);

  try { lucide.createIcons(); } catch(e) {}
}

// ── Planejar: tarefas + critério de sucesso ──────────────────────
function _renderPlanejar(test) {
  const container = document.getElementById('ux-test-tarefas-lista');
  if (!container) return;
  if (test.tarefas.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-slate-400 dark:text-dark-muted text-center py-4">Nenhuma tarefa definida ainda.</p>`;
    return;
  }
  container.innerHTML = test.tarefas.map((t, i) => `
    <div class="flex items-start gap-2 bg-slate-50 dark:bg-dark-bg/40 border border-gray-100 dark:border-dark-line rounded-xl px-3 py-2.5">
      <span class="shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center mt-0.5">${i + 1}</span>
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-bold text-slate-700 dark:text-white">${t.descricao}</p>
        ${t.criterioSucesso ? `<p class="text-[10px] text-slate-400 dark:text-dark-muted mt-0.5">Sucesso: ${t.criterioSucesso}</p>` : ''}
        ${(t.passos || []).length > 0 ? `
          <ol class="mt-1.5 space-y-0.5">
            ${t.passos.map((p, pi) => `<li class="text-[10px] text-slate-500 dark:text-dark-muted">${pi + 1}. ${p.descricao}</li>`).join('')}
          </ol>` : ''}
      </div>
      <button onclick="removeUsabilityTestTarefa('${test.id}', '${t.id}')" class="text-slate-300 hover:text-red-400 transition-colors shrink-0" aria-label="Remover tarefa">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `).join('');
}

function addUsabilityTestTarefa(testId) {
  const test = _findTest(testId);
  if (!test) return;
  const descEl = document.getElementById('ux-test-nova-tarefa-desc');
  const critEl = document.getElementById('ux-test-nova-tarefa-criterio');
  const passosEl = document.getElementById('ux-test-nova-tarefa-passos');
  const descricao = (descEl?.value || '').trim();
  if (!descricao) {
    showToast('Descreva a tarefa.', 'error');
    return;
  }
  // Passos são opcionais: um por linha, linhas vazias ignoradas. Tarefa
  // sem passos funciona exatamente como antes (só sucesso/parcial/falhou).
  const passos = (passosEl?.value || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(descricao => ({ id: _generateId(), descricao }));
  test.tarefas.push({ id: _generateId(), descricao, criterioSucesso: (critEl?.value || '').trim(), passos });
  if (descEl) descEl.value = '';
  if (critEl) critEl.value = '';
  if (passosEl) passosEl.value = '';
  saveState();
  _renderPlanejar(test);
  _updateUsabilityTabDots();
  try { lucide.createIcons(); } catch(e) {}
}

function removeUsabilityTestTarefa(testId, tarefaId) {
  const test = _findTest(testId);
  if (!test) return;
  test.tarefas = test.tarefas.filter(t => t.id !== tarefaId);
  saveState();
  _renderPlanejar(test);
  _updateUsabilityTabDots();
}

// ── Rodar / Coletar: sessões por participante ────────────────────
function _renderRodar(test) {
  const container = document.getElementById('ux-test-sessoes-lista');
  if (!container) return;
  if (test.tarefas.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-amber-600 dark:text-amber-400 text-center py-4">Defina ao menos uma tarefa na aba "Planejar" antes de registrar sessões.</p>`;
    return;
  }
  if (test.sessoes.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-slate-400 dark:text-dark-muted text-center py-4">Nenhuma sessão registrada ainda.</p>`;
    return;
  }
  container.innerHTML = test.sessoes.map(s => {
    const total = s.resultadosPorTarefa.length;
    const sucesso = s.resultadosPorTarefa.filter(r => r.sucesso === 'sim').length;
    return `
    <div class="flex items-center justify-between gap-2 bg-slate-50 dark:bg-dark-bg/40 border border-gray-100 dark:border-dark-line rounded-xl px-3 py-2.5">
      <div class="min-w-0">
        <p class="text-[11px] font-bold text-slate-700 dark:text-white truncate">${s.participante || 'Participante sem nome'}</p>
        <p class="text-[10px] text-slate-400 dark:text-dark-muted">${_formatDateBR(s.dataRealizacao) || '—'} · ${sucesso}/${total} tarefa(s) com sucesso</p>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button onclick="editUsabilitySession('${test.id}', '${s.id}')" class="text-slate-400 hover:text-blue-500 transition-colors" aria-label="Editar sessão">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="removeUsabilitySession('${test.id}', '${s.id}')" class="text-slate-300 hover:text-red-400 transition-colors" aria-label="Remover sessão">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

// Coletar reaproveita a mesma lista de sessões de "Rodar" — a distinção
// é de fluxo de trabalho (planejar sessão vs. registrar resultado), não
// de dado: os campos de resultado por tarefa já ficam abertos no mesmo
// formulário de sessão, então não há uma tela de coleta separada.
function _renderColetar(test) {
  const container = document.getElementById('ux-test-metricas');
  if (!container) return;
  if (test.sessoes.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-slate-400 dark:text-dark-muted text-center py-4">Registre sessões na aba "Rodar" para ver métricas agregadas aqui.</p>`;
    return;
  }
  const m = _testMetrics(test);
  container.innerHTML = `
    <div class="grid grid-cols-2 gap-2.5 mb-4">
      <div class="bg-slate-50 dark:bg-dark-bg/40 rounded-xl p-3 text-center">
        <p class="text-[18px] font-extrabold text-slate-800 dark:text-white">${test.sessoes.length}</p>
        <p class="text-[9px] text-slate-400 dark:text-dark-muted uppercase tracking-wide">Participantes</p>
      </div>
      <div class="bg-slate-50 dark:bg-dark-bg/40 rounded-xl p-3 text-center">
        <p class="text-[18px] font-extrabold text-slate-800 dark:text-white">${m.taxaSucessoGeral}%</p>
        <p class="text-[9px] text-slate-400 dark:text-dark-muted uppercase tracking-wide">Taxa de sucesso geral</p>
      </div>
    </div>
    <p class="text-[10px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wide mb-2">Taxa de sucesso por tarefa</p>
    <div class="space-y-3">
      ${test.tarefas.map(t => {
        const tm = m.porTarefa[t.id] || { total: 0, sucesso: 0, pct: 0, porPasso: null };
        const barCls = tm.pct >= 80 ? 'bg-emerald-500' : tm.pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
        return `
        <div>
          <div class="flex items-center justify-between text-[10px] text-slate-500 dark:text-dark-muted mb-1">
            <span class="truncate flex-1">${t.descricao}</span>
            <span class="shrink-0 font-bold ml-2">${tm.pct}% (${tm.sucesso}/${tm.total})</span>
          </div>
          <div class="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full ${barCls}" style="width: ${tm.pct}%"></div>
          </div>
          ${tm.porPasso && tm.porPasso.length > 0 ? `
            <div class="mt-2 ml-2 space-y-1 border-l-2 border-slate-100 dark:border-dark-line pl-2.5">
              ${tm.porPasso.map((p, pi) => `
                <div class="flex items-center justify-between text-[9px] text-slate-400 dark:text-dark-muted">
                  <span class="truncate flex-1">${pi + 1}. ${p.descricao}</span>
                  <span class="shrink-0 font-bold ml-2">${p.pct}% (${p.alcancaram}/${p.total})</span>
                </div>`).join('')}
            </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

let _editingSessionId = null;

function openNewSessionModal() {
  _editingSessionId = null;
  const test = _findTest(_activeTestId);
  if (!test) return;
  document.getElementById('ux-session-modal-title').textContent = 'Nova sessão';
  document.getElementById('ux-session-participante').value = '';
  document.getElementById('ux-session-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('ux-session-notas').value = '';
  _renderSessionTaskInputs(test, null);
  document.getElementById('modal-usability-session')?.classList.remove('hidden');
  try { lucide.createIcons(); } catch(e) {}
}

function editUsabilitySession(testId, sessionId) {
  const test = _findTest(testId);
  const session = test?.sessoes.find(s => s.id === sessionId);
  if (!test || !session) return;
  _editingSessionId = sessionId;
  document.getElementById('ux-session-modal-title').textContent = 'Editar sessão';
  document.getElementById('ux-session-participante').value = session.participante || '';
  document.getElementById('ux-session-data').value = (session.dataRealizacao || '').slice(0, 10);
  document.getElementById('ux-session-notas').value = session.notasGerais || '';
  _renderSessionTaskInputs(test, session);
  document.getElementById('modal-usability-session')?.classList.remove('hidden');
  try { lucide.createIcons(); } catch(e) {}
}

function closeUsabilitySessionModal() {
  document.getElementById('modal-usability-session')?.classList.add('hidden');
  _editingSessionId = null;
}

function _renderSessionTaskInputs(test, session) {
  const container = document.getElementById('ux-session-tarefas');
  if (!container) return;
  container.innerHTML = test.tarefas.map(t => {
    const prev = session?.resultadosPorTarefa.find(r => r.tarefaId === t.id);
    const passos = t.passos || [];
    // Sub-passos são opcionais por tarefa (definidos no Planejar). Quando
    // existem, o moderador marca até onde o participante chegou — dado
    // observado ao vivo numa sessão moderada, não capturado automaticamente
    // (o Figma não expõe eventos do modo de apresentação a plugins).
    const passosSelect = passos.length > 0 ? `
      <div>
        <label class="text-[9px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wide block mb-1">Chegou até o passo</label>
        <select id="ux-session-passo-${t.id}" class="w-full text-[11px]">
          <option value="">Não avaliado</option>
          ${passos.map((p, pi) => `<option value="${p.id}" ${prev?.passoAlcancadoId === p.id ? 'selected' : ''}>${pi + 1}. ${p.descricao}</option>`).join('')}
          <option value="_all" ${prev?.passoAlcancadoId === '_all' ? 'selected' : ''}>Concluiu todos os passos</option>
        </select>
      </div>` : '';
    return `
    <div class="border border-gray-100 dark:border-dark-line rounded-xl p-2.5 space-y-1.5" data-ux-session-tarefa="${t.id}">
      <p class="text-[11px] font-bold text-slate-700 dark:text-white">${t.descricao}</p>
      <div class="flex gap-1.5">
        <button type="button" data-ux-sucesso-btn="${t.id}" data-ux-sucesso-val="sim" onclick="setUsabilitySessionSucesso('${t.id}','sim')"
          class="flex-1 py-2 text-[10px] font-bold rounded-lg transition-colors ${prev?.sucesso === 'sim' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-dark-muted'}">Sucesso</button>
        <button type="button" data-ux-sucesso-btn="${t.id}" data-ux-sucesso-val="parcial" onclick="setUsabilitySessionSucesso('${t.id}','parcial')"
          class="flex-1 py-2 text-[10px] font-bold rounded-lg transition-colors ${prev?.sucesso === 'parcial' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-dark-muted'}">Parcial</button>
        <button type="button" data-ux-sucesso-btn="${t.id}" data-ux-sucesso-val="nao" onclick="setUsabilitySessionSucesso('${t.id}','nao')"
          class="flex-1 py-2 text-[10px] font-bold rounded-lg transition-colors ${prev?.sucesso === 'nao' ? 'bg-red-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-dark-muted'}">Falhou</button>
      </div>
      <input type="hidden" id="ux-session-sucesso-${t.id}" value="${prev?.sucesso || ''}" />
      ${passosSelect}
      <textarea id="ux-session-obs-${t.id}" rows="1" placeholder="Observações desta tarefa..." class="w-full resize-none text-[11px]" style="min-height: 40px;">${prev?.observacoes || ''}</textarea>
    </div>`;
  }).join('');
  _updateSessionTaskProgress();
}

// Contador fixo acima da lista de tarefas na modal de sessão — orienta o
// usuário de quantas tarefas já têm resultado marcado, já que a lista pode
// exigir scroll quando o teste tem muitas tarefas (a modal já tem scroll
// interno próprio, isto só ajuda a saber "quanto falta" sem precisar rolar).
function _updateSessionTaskProgress() {
  const wrap = document.getElementById('ux-session-tarefas');
  const counter = document.getElementById('ux-session-tarefas-progresso');
  if (!wrap || !counter) return;
  const blocks = wrap.querySelectorAll('[data-ux-session-tarefa]');
  const total = blocks.length;
  let avaliadas = 0;
  blocks.forEach(b => {
    const id = b.getAttribute('data-ux-session-tarefa');
    const val = document.getElementById(`ux-session-sucesso-${id}`)?.value;
    if (val) avaliadas++;
  });
  counter.textContent = total > 0 ? `${avaliadas} de ${total} tarefa(s) avaliada(s)` : '';
}

function setUsabilitySessionSucesso(tarefaId, valor) {
  const hidden = document.getElementById(`ux-session-sucesso-${tarefaId}`);
  if (hidden) hidden.value = valor;
  document.querySelectorAll(`[data-ux-sucesso-btn="${tarefaId}"]`).forEach(btn => {
    const val = btn.getAttribute('data-ux-sucesso-val');
    const active = val === valor;
    const activeCls = val === 'sim' ? 'bg-emerald-600 text-white' : val === 'parcial' ? 'bg-amber-500 text-white' : 'bg-red-500 text-white';
    btn.className = `flex-1 py-2 text-[10px] font-bold rounded-lg transition-colors ${active ? activeCls : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-dark-muted'}`;
  });
  _updateSessionTaskProgress();
}

function saveUsabilitySession() {
  const test = _findTest(_activeTestId);
  if (!test) return;
  const participante = (document.getElementById('ux-session-participante')?.value || '').trim();
  if (!participante) {
    showToast('Identifique o participante (nome ou código).', 'error');
    return;
  }
  const dataRealizacao = document.getElementById('ux-session-data')?.value || '';
  const notasGerais = (document.getElementById('ux-session-notas')?.value || '').trim();
  const resultadosPorTarefa = test.tarefas.map(t => ({
    tarefaId: t.id,
    sucesso: document.getElementById(`ux-session-sucesso-${t.id}`)?.value || '',
    // '' (não avaliado) | '_all' (concluiu todos os passos) | id de um
    // passo específico (onde travou/desistiu) — só existe se a tarefa
    // tiver passos definidos (ver t.passos em _renderSessionTaskInputs).
    passoAlcancadoId: document.getElementById(`ux-session-passo-${t.id}`)?.value || '',
    observacoes: (document.getElementById(`ux-session-obs-${t.id}`)?.value || '').trim()
  }));

  if (_editingSessionId) {
    const session = test.sessoes.find(s => s.id === _editingSessionId);
    if (session) Object.assign(session, { participante, dataRealizacao, notasGerais, resultadosPorTarefa });
  } else {
    test.sessoes.push({ id: _generateId(), participante, dataRealizacao, notasGerais, resultadosPorTarefa });
    if (test.status === 'planejamento') test.status = 'em-andamento';
  }
  saveState();
  updateHomeBadges();
  closeUsabilitySessionModal();
  renderUsabilityTestDetail();
  showToast('Sessão salva.', 'success');
}

function removeUsabilitySession(testId, sessionId) {
  const test = _findTest(testId);
  if (!test) return;
  test.sessoes = test.sessoes.filter(s => s.id !== sessionId);
  saveState();
  updateHomeBadges();
  renderUsabilityTestDetail();
}

// ── Métricas agregadas (usadas em Coletar e Analisar) ────────────
function _testMetrics(test) {
  const porTarefa = {};
  let totalRespostas = 0, totalSucesso = 0;
  test.tarefas.forEach(t => {
    const respostas = test.sessoes
      .map(s => s.resultadosPorTarefa.find(r => r.tarefaId === t.id))
      .filter(r => r && r.sucesso);
    const sucesso = respostas.filter(r => r.sucesso === 'sim').length;
    porTarefa[t.id] = { total: respostas.length, sucesso, pct: respostas.length > 0 ? Math.round((sucesso / respostas.length) * 100) : 0 };
    totalRespostas += respostas.length;
    totalSucesso += sucesso;

    // Funil de conclusão por passo: "chegou até o passo N" implica ter
    // passado pelos passos 1..N-1 — por isso cada passo conta quantas
    // respostas alcançaram ELE OU ALGUM POSTERIOR (índice >= o do passo),
    // incluindo "_all" (concluiu todos). Só calculado se a tarefa tem
    // passos definidos no Planejar; senão porTarefa[t.id].porPasso = null.
    if ((t.passos || []).length > 0) {
      const respostasComPasso = test.sessoes
        .map(s => s.resultadosPorTarefa.find(r => r.tarefaId === t.id))
        .filter(r => r && r.passoAlcancadoId);
      const totalAvaliado = respostasComPasso.length;
      porTarefa[t.id].porPasso = t.passos.map((p, pi) => {
        const alcancaram = respostasComPasso.filter(r => {
          if (r.passoAlcancadoId === '_all') return true;
          const idxAlcancado = t.passos.findIndex(x => x.id === r.passoAlcancadoId);
          return idxAlcancado >= pi;
        }).length;
        return { passoId: p.id, descricao: p.descricao, alcancaram, total: totalAvaliado, pct: totalAvaliado > 0 ? Math.round((alcancaram / totalAvaliado) * 100) : 0 };
      });
    } else {
      porTarefa[t.id].porPasso = null;
    }
  });
  return {
    porTarefa,
    taxaSucessoGeral: totalRespostas > 0 ? Math.round((totalSucesso / totalRespostas) * 100) : 0
  };
}

// ── Analisar: achados manuais + métricas de apoio ────────────────
function _renderAnalisar(test) {
  const metricsContainer = document.getElementById('ux-test-analise-metricas');
  if (metricsContainer) {
    if (test.sessoes.length === 0) {
      metricsContainer.innerHTML = `<p class="text-[11px] text-slate-400 dark:text-dark-muted text-center py-4">Registre sessões antes de sintetizar achados.</p>`;
    } else {
      const m = _testMetrics(test);
      const piorTarefa = test.tarefas.slice().sort((a, b) => (m.porTarefa[a.id]?.pct ?? 100) - (m.porTarefa[b.id]?.pct ?? 100))[0];
      metricsContainer.innerHTML = `
        <p class="text-[11px] text-slate-500 dark:text-dark-muted leading-relaxed mb-2">
          ${test.sessoes.length} participante(s), taxa de sucesso geral de <strong>${m.taxaSucessoGeral}%</strong>.
          ${piorTarefa ? `Tarefa com mais dificuldade: <strong>${piorTarefa.descricao}</strong> (${m.porTarefa[piorTarefa.id]?.pct ?? 0}% de sucesso).` : ''}
        </p>`;
    }
  }

  const container = document.getElementById('ux-test-achados-lista');
  if (!container) return;
  if (test.achados.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-slate-400 dark:text-dark-muted text-center py-4">Nenhum achado registrado ainda.</p>`;
    return;
  }
  const sevCls = { critica: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300', media: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300', baixa: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-dark-muted' };
  const sevLabel = { critica: 'Crítica', media: 'Média', baixa: 'Baixa' };
  container.innerHTML = test.achados.map(a => `
    <div class="flex items-start justify-between gap-2 bg-slate-50 dark:bg-dark-bg/40 border border-gray-100 dark:border-dark-line rounded-xl px-3 py-2.5">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="px-1.5 py-0.5 text-[9px] font-bold rounded-full ${sevCls[a.severidade] || sevCls.baixa}">${sevLabel[a.severidade] || 'Baixa'}</span>
          <p class="text-[11px] font-bold text-slate-700 dark:text-white truncate">${a.titulo}</p>
        </div>
        ${a.descricao ? `<p class="text-[10px] text-slate-400 dark:text-dark-muted">${a.descricao}</p>` : ''}
      </div>
      <button onclick="removeUsabilityAchado('${test.id}', '${a.id}')" class="text-slate-300 hover:text-red-400 transition-colors shrink-0" aria-label="Remover achado">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `).join('');
}

function addUsabilityAchado(testId) {
  const test = _findTest(testId);
  if (!test) return;
  const tituloEl = document.getElementById('ux-test-novo-achado-titulo');
  const descEl = document.getElementById('ux-test-novo-achado-desc');
  const sevEl = document.getElementById('ux-test-novo-achado-severidade');
  const titulo = (tituloEl?.value || '').trim();
  if (!titulo) {
    showToast('Descreva o achado em uma frase.', 'error');
    return;
  }
  test.achados.push({
    id: _generateId(),
    titulo,
    descricao: (descEl?.value || '').trim(),
    severidade: sevEl?.value || 'baixa'
  });
  if (tituloEl) tituloEl.value = '';
  if (descEl) descEl.value = '';
  if (sevEl) sevEl.value = 'baixa';
  saveState();
  _renderAnalisar(test);
  _updateUsabilityTabDots();
  try { lucide.createIcons(); } catch(e) {}
}

function removeUsabilityAchado(testId, achadoId) {
  const test = _findTest(testId);
  if (!test) return;
  test.achados = test.achados.filter(a => a.id !== achadoId);
  saveState();
  _renderAnalisar(test);
  _updateUsabilityTabDots();
}

// Concluir sincroniza com a Auditoria e não tem "reabrir" no fluxo atual
// — por isso passa por confirmação antes de aplicar. Usa a mesma modal
// bottom-sheet do resto do plugin em vez de confirm() nativo do browser,
// que dentro do iframe do Figma pode não se comportar de forma confiável
// entre plataformas (desktop/web).
function markUsabilityTestConcluded(testId) {
  const test = _findTest(testId);
  if (!test) return;
  document.getElementById('modal-conclude-usability-test')?.classList.remove('hidden');
}

function closeConcludeUsabilityTestModal() {
  document.getElementById('modal-conclude-usability-test')?.classList.add('hidden');
}

function confirmConcludeUsabilityTest() {
  closeConcludeUsabilityTestModal();
  const test = _findTest(_activeTestId);
  if (!test) return;
  test.status = 'concluido';
  saveState();
  updateHomeBadges();
  const synced = typeof syncUsabilityTestToEvidence === 'function' ? syncUsabilityTestToEvidence(test) : false;
  renderUsabilityTestDetail();
  showToast(synced ? 'Teste concluído — evidência atualizada na Auditoria.' : 'Teste concluído.', 'success');
}

// ── Importar resultados do Maze (teste não-moderado) ─────────────
// O Maze roda o protótipo dentro do próprio player dele (fora do Figma) e
// gera um CSV por tester/tela — não é possível capturar isso automaticamente
// de dentro de um plugin Figma (a Plugin API não expõe eventos do modo de
// apresentação/preview de protótipo a nenhum plugin). Este importador lê o
// CSV que o Maze já exporta (Help Center: "Exporting your results") e
// converte para sessões do PRISMA, evitando digitação manual de um relatório
// que já existe estruturado.
//
// Colunas relevantes do CSV do Maze (nomes reais, confirmados no export):
//   Tester ID, Block ID, Block title, Direct Success, Indirect Success,
//   Give up
// Cada linha do CSV é 1 (tester × bloco); um teste pode ter várias linhas
// por tester se o bloco tiver múltiplas telas (Screen ID) — agregamos por
// (Tester ID, Block ID), tratando qualquer ocorrência de sucesso na missão
// como sucesso direto/indireto, e "desistiu" só se NENHUMA linha daquele
// bloco/tester teve sucesso e ao menos uma teve Give up = true. Sub-passos
// (Screen ID) não são importados — exigiriam os "passos" da tarefa PRISMA
// corresponderem exatamente às telas do protótipo no Maze, o que não há
// como garantir automaticamente (ver refs/data-dictionary.md).

let _mazeImportRows = null; // linhas cruas do CSV, após parse
let _mazeImportBlocks = []; // [{ blockId, blockTitle }] únicos encontrados

// Parser CSV mínimo (RFC 4180: aspas duplas escapam vírgula/quebra de
// linha dentro de um campo). Não usa libs externas — o plugin não tem
// nenhuma dependência de terceiros no frontend além do que já é embutido.
function _parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // ignora — \n (ou \r\n) trata a quebra de linha
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];

  const header = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.length > 1 || r[0] !== '').map(r => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
    return obj;
  });
}

function openMazeImportModal() {
  _mazeImportRows = null;
  _mazeImportBlocks = [];
  const fileEl = document.getElementById('maze-import-file');
  if (fileEl) fileEl.value = '';
  document.getElementById('maze-import-mapping')?.classList.add('hidden');
  document.getElementById('maze-import-confirm-btn')?.setAttribute('disabled', 'true');
  document.getElementById('modal-maze-import')?.classList.remove('hidden');
}

function closeMazeImportModal() {
  document.getElementById('modal-maze-import')?.classList.add('hidden');
}

function handleMazeCsvSelected(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = _parseCSV(String(reader.result || ''));
    if (rows.length === 0 || !('Tester ID' in rows[0])) {
      showToast('CSV não reconhecido — confirme que é um export de resultados do Maze.', 'error');
      return;
    }
    _mazeImportRows = rows;
    const seen = new Map();
    rows.forEach(r => {
      const blockId = r['Block ID'] || '';
      if (!blockId || seen.has(blockId)) return;
      seen.set(blockId, r['Block title'] || blockId);
    });
    _mazeImportBlocks = [...seen.entries()].map(([blockId, blockTitle]) => ({ blockId, blockTitle }));
    _renderMazeImportMapping();
  };
  reader.onerror = () => showToast('Não foi possível ler o arquivo.', 'error');
  reader.readAsText(file);
}

function _renderMazeImportMapping() {
  const test = _findTest(_activeTestId);
  const container = document.getElementById('maze-import-mapping-list');
  const wrap = document.getElementById('maze-import-mapping');
  if (!test || !container || !wrap) return;

  const testerCount = new Set(_mazeImportRows.map(r => r['Tester ID']).filter(Boolean)).size;
  container.innerHTML = `
    <p class="text-[10px] text-slate-400 dark:text-dark-muted mb-2">${testerCount} participante(s) encontrado(s) no CSV. Relacione cada missão do Maze a uma tarefa deste teste:</p>
    ${_mazeImportBlocks.map(b => `
      <div class="mb-2">
        <label class="text-[10px] font-bold text-slate-500 dark:text-dark-muted block mb-1 truncate">${b.blockTitle}</label>
        <select id="maze-block-map-${b.blockId}" class="w-full text-[11px]">
          <option value="">Ignorar esta missão</option>
          ${test.tarefas.map(t => `<option value="${t.id}">${t.descricao}</option>`).join('')}
        </select>
      </div>`).join('')}`;
  wrap.classList.remove('hidden');
  document.getElementById('maze-import-confirm-btn')?.removeAttribute('disabled');
}

// Direct/Indirect Success e Give up chegam como texto ("true"/"false" ou
// "TRUE"/"FALSE", conforme locale de export) — normaliza antes de comparar.
function _mazeBool(v) {
  return String(v || '').trim().toLowerCase() === 'true';
}

function confirmMazeImport() {
  const test = _findTest(_activeTestId);
  if (!test || !_mazeImportRows) return;

  const mapping = {}; // blockId -> tarefaId
  _mazeImportBlocks.forEach(b => {
    const val = document.getElementById(`maze-block-map-${b.blockId}`)?.value || '';
    if (val) mapping[b.blockId] = val;
  });
  if (Object.keys(mapping).length === 0) {
    showToast('Relacione ao menos uma missão a uma tarefa antes de importar.', 'error');
    return;
  }

  // Agrupa por (Tester ID, Block ID) — um bloco pode ter várias linhas
  // (uma por Screen ID visitada); qualquer sucesso no grupo conta como
  // sucesso da tarefa, "desistiu" só se nenhuma linha teve sucesso e ao
  // menos uma teve Give up.
  const grupos = new Map(); // "testerId|blockId" -> { direct, indirect, giveUp }
  _mazeImportRows.forEach(r => {
    const testerId = r['Tester ID'];
    const blockId = r['Block ID'];
    if (!testerId || !blockId || !mapping[blockId]) return;
    const key = testerId + '|' + blockId;
    const g = grupos.get(key) || { direct: false, indirect: false, giveUp: false };
    g.direct = g.direct || _mazeBool(r['Direct Success']);
    g.indirect = g.indirect || _mazeBool(r['Indirect Success']);
    g.giveUp = g.giveUp || _mazeBool(r['Give up']);
    grupos.set(key, g);
  });

  const porTester = new Map(); // testerId -> [{ blockId, sucesso }]
  grupos.forEach((g, key) => {
    const [testerId, blockId] = key.split('|');
    const sucesso = (g.direct || g.indirect) ? 'sim' : (g.giveUp ? 'nao' : 'parcial');
    if (!porTester.has(testerId)) porTester.set(testerId, []);
    porTester.get(testerId).push({ blockId, sucesso });
  });

  let sessoesCriadas = 0;
  porTester.forEach((resultadosBloco, testerId) => {
    const resultadosPorTarefa = test.tarefas.map(t => {
      const blockId = Object.keys(mapping).find(bId => mapping[bId] === t.id);
      const resultado = blockId ? resultadosBloco.find(r => r.blockId === blockId) : null;
      return { tarefaId: t.id, sucesso: resultado?.sucesso || '', passoAlcancadoId: '', observacoes: '' };
    });
    // Só cria sessão se ao menos uma tarefa mapeada teve resultado — testers
    // que não tocaram nenhum bloco mapeado não geram sessão vazia.
    if (!resultadosPorTarefa.some(r => r.sucesso)) return;
    test.sessoes.push({
      id: _generateId(),
      participante: `Maze #${testerId}`,
      dataRealizacao: '',
      notasGerais: 'Importado de relatório do Maze (teste não-moderado).',
      resultadosPorTarefa
    });
    sessoesCriadas++;
  });

  if (sessoesCriadas === 0) {
    showToast('Nenhuma sessão gerada — confira o mapeamento de missões.', 'error');
    return;
  }
  if (test.status === 'planejamento') test.status = 'em-andamento';
  saveState();
  updateHomeBadges();
  closeMazeImportModal();
  renderUsabilityTestDetail();
  showToast(`${sessoesCriadas} sessão(ões) importada(s) do Maze.`, 'success');
}

Object.assign(window, {
  navigateToUsabilityTests, renderUsabilityTestList, getActiveUsabilityTestId,
  closeConcludeUsabilityTestModal, confirmConcludeUsabilityTest,
  createUsabilityTest, openEditUsabilityTestModal,
  removeUsabilityTest, closeDeleteUsabilityTestModal, confirmDeleteUsabilityTest,
  openNewUsabilityTestModal, closeNewUsabilityTestModal,
  openUsabilityTest, backToUsabilityTestList, selectUsabilityTestTab,
  addUsabilityTestTarefa, removeUsabilityTestTarefa,
  openNewSessionModal, editUsabilitySession, closeUsabilitySessionModal,
  setUsabilitySessionSucesso, saveUsabilitySession, removeUsabilitySession,
  addUsabilityAchado, removeUsabilityAchado, markUsabilityTestConcluded,
  openMazeImportModal, closeMazeImportModal, handleMazeCsvSelected, confirmMazeImport
});
