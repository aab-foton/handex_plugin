// ============================================================
// handoff-ficha.js — hac — Ficha de Handoff (2026-09-04)
//
// Módulo APARTADO (decisão do usuário, reforçada no plano) — toda a lógica
// de UI da Ficha de Handoff: os 3 botões "Inserir/Atualizar ficha" nas abas
// de trabalho (Tabulação/Swipe/Leitor de Tela), os 3 cards de status na aba
// Handoff (dashboard), e o atalho "Ver ficha no canvas". Prefixo `_ficha`
// em toda função própria, pra nunca colidir por nome com o resto do hac.
//
// Modelo de inserção INCREMENTAL: cada seção é inserida/atualizada
// independentemente — não existe mais um botão único "Gerar handoff" que
// monta tudo de uma vez (removido de accessibility.js nesta mesma
// entrega). Estado "Inserir"→"Atualizar" é PERSISTIDO em
// hacData.a11yAreas[i].handoffFicha (não inferido do canvas a cada
// render), mesmo trade-off já aceito pelo resto do hac com tabOrderItems/
// a11ySwipePaths: se a Ficha for apagada manualmente do canvas, o dado
// "mente" até o designer clicar em "Atualizar" de novo.
//
// A Ficha desenha DO ZERO, a partir dos itens/specs já persistidos — nunca
// lê/escreve em tabOrderItems/a11ySwipePaths/a11ySpecs além de LER pra
// montar o payload enviado ao backend (insert-ficha-section). O backend
// (code.js, bloco "Ficha de Handoff") é quem de fato desenha no canvas —
// este módulo só monta o payload, dispara a mensagem e trata a resposta.
// ============================================================

// Schema aditivo (sem bump de _schemaVersion, mesmo precedente de
// a11ySwipePaths/projectOrigin/activeSectionName): toda leitura de
// area.handoffFicha é defensiva (?.), nunca assume que o campo existe —
// áreas criadas antes desta entrega não têm esse campo.
function _fichaEmptySectionsState() {
  return {
    tabulacao: { insertedAt: null, itemCount: 0 },
    swipe: { insertedAt: null, itemCount: 0 },
    leitor: { insertedAt: null, specCount: 0 },
    // 4º bloco (2026-09-08) — consolidado, sem itemCount próprio real
    // (guardamos 0 por consistência de formato com os outros 3, mas
    // nunca é usado como métrica — o resumo em si já mostra os números
    // certos de cada seção).
    review: { insertedAt: null, itemCount: 0 },
  };
}

function _fichaSectionState(area, sectionKey) {
  return (area && area.handoffFicha && area.handoffFicha.sections && area.handoffFicha.sections[sectionKey]) || null;
}

// Label do botão — "Atualizar ficha" só depois que aquela seção já foi
// inserida ao menos uma vez (insertedAt presente), "Inserir na ficha" caso
// contrário. Nunca inferido do canvas.
function _fichaButtonLabel(area, sectionKey) {
  const state = _fichaSectionState(area, sectionKey);
  return (state && state.insertedAt) ? 'Atualizar ficha' : 'Inserir na ficha';
}

// Botão usado dentro das 3 abas de trabalho (Tabulação/Swipe/Leitor de
// Tela) — mesmo estilo "outline" já usado pelos outros botões secundários
// dessas abas (ex.: "Gerar Automaticamente").
function _fichaInsertButtonHtml(area, sectionKey) {
  const label = _fichaButtonLabel(area, sectionKey);
  const icon = label === 'Atualizar ficha' ? 'refresh-cw' : 'file-plus-2';
  return `
    <button type="button" onclick="_fichaInsertSection('${escapeHtml(sectionKey)}')"
      class="w-full flex items-center justify-center gap-2 h-9 mt-1 rounded-xl text-[11px] font-bold transition-all bg-white dark:bg-dark-surface text-cyan-700 dark:text-cyan-400 shadow-sm hover:shadow active:scale-[0.99]">
      <i data-lucide="${icon}" class="w-3.5 h-3.5" aria-hidden="true"></i>
      ${label}
    </button>
  `;
}
window._fichaInsertButtonHtml = _fichaInsertButtonHtml;

// Resolve a área ATUAL (objeto vivo de a11yAreas, com originalIndex) a
// partir da workspace aberta — as funções de render das tabs recebem uma
// CÓPIA rasa (Object.assign) de a11yAreas[i], então qualquer mutação
// persistente (handoffFicha) precisa mirar o array original, nunca a cópia
// recebida como parâmetro.
function _fichaLiveArea(areaId) {
  return (a11yAreas || []).find(a => a && a.id === areaId) || null;
}

// Monta os campos exibidos no card de uma spec na seção "Leitor de Tela",
// já resolvidos/limpos — o backend só desenha o que chega aqui, nunca
// decide o que mostrar por categoria. Campos ausentes na categoria da spec
// (ex.: "decorativo" não tem Componente/Nome Acessível) simplesmente não
// entram no array — nunca aparecem em branco no card.
function _fichaBuildSpecFields(spec) {
  const props = spec.properties || [];
  const getProp = key => { const p = props.find(x => x.key === key); return p ? p.value : ''; };

  const fields = [];
  const descricao = getProp('descricao');
  if (descricao) fields.push({ label: 'Descrição', value: descricao });

  const nomeAcessivel = getProp('nomeAcessivel');
  if (nomeAcessivel) fields.push({ label: 'Nome Acessível', value: nomeAcessivel });

  // Notas de Código: notaCodigo é o texto FIXO do catálogo da vertical
  // (não editável pelo designer); notas é o campo livre/editável. Exibidos
  // como blocos separados quando os dois existem (fica mais claro no card
  // do que decisão é da vertical e o que é anotação do designer) — quando
  // só um dos dois existe, aparece sozinho sob o mesmo rótulo.
  const notaCodigo = getProp('notaCodigo');
  const notas = getProp('notas');
  if (notaCodigo && notas) {
    fields.push({ label: 'Notas de Código', value: notaCodigo });
    fields.push({ label: 'Notas adicionais', value: notas });
  } else if (notaCodigo) {
    fields.push({ label: 'Notas de Código', value: notaCodigo });
  } else if (notas) {
    fields.push({ label: 'Notas de Código', value: notas });
  }

  const observacoes = getProp('observacoes');
  if (observacoes) fields.push({ label: 'Observações', value: observacoes });

  // Componente: nome cru do component set DSC, limpo (_cleanDscContainingFrameName)
  // — fallback pro campo digitado manualmente (properties.componente) quando
  // a spec não tem match de componente DSC real.
  const componenteRaw = spec.a11yDscComponentName
    ? _cleanDscContainingFrameName(spec.a11yDscComponentName)
    : getProp('componente');
  if (componenteRaw) fields.push({ label: 'Componente', value: componenteRaw });

  return fields;
}

// Monta o payload de UMA spec pro backend (_buildFichaLeitorSection,
// code.js) — cores já resolvidas em hex (mesmo padrão de opts.color/
// opts.fillColor já usado por create-unified-spec) porque A11Y_CATEGORIES
// só existe no frontend.
function _fichaBuildSpecPayload(spec) {
  const meta = A11Y_CATEGORIES[spec.a11yType] || { label: 'Acessibilidade', color: '#0891B2', fill: '#EBF4FB' };
  return {
    letter: spec.letter || '',
    targetNodeName: spec.targetNodeName || spec.name || '',
    categoryLabel: meta.label,
    categoryColor: meta.color,
    categoryFill: meta.fill,
    fields: _fichaBuildSpecFields(spec),
  };
}

// Clique em "Inserir na ficha"/"Atualizar ficha" nas abas de trabalho —
// monta o payload da seção pedida (itens de tabOrderItems já persistidos,
// a trilha de hacData.a11ySwipePaths já resolvida, ou specs de a11ySpecs
// já persistidas) e dispara insert-ficha-section.
// sectionKey ∈ 'tabulacao'|'swipe'|'leitor'|'review'.
function _fichaInsertSection(sectionKey) {
  const areaId = window._a11yWorkspaceAreaId;
  const area = _fichaLiveArea(areaId);
  if (!area) return;

  const payload = {
    area: Object.assign({}, area, { a11yOrigin: getA11yProjectOrigin() || 'web', sectionName: getA11yActiveSectionName() }),
    sectionKey,
    designerName: getA11yDesignerName(),
  };

  const areaSpecsRaw = (a11ySpecs || []).filter(s => s && s.a11yAreaId === area.id);

  if (sectionKey === 'tabulacao') {
    payload.items = _currentTabOrderItems(area.id);
  } else if (sectionKey === 'swipe') {
    // Trilha de Swipe (2026-09-08: voltou a ter réplica visual real na
    // Ficha, ver _buildFichaSwipeSection em code.js) — a lista de N
    // pontos em ordem, já persistida em hacData.a11ySwipePaths, com
    // nodeId (usado pra tradução clone→original no backend) e nodeName.
    const path = (hacData.a11ySwipePaths || []).find(p => p && p.areaId === area.id) || null;
    payload.points = path && Array.isArray(path.points) ? path.points : [];
  } else if (sectionKey === 'leitor') {
    const areaSpecs = _a11ySortSpecsByLayerOrder(areaSpecsRaw, area.id);
    payload.specs = areaSpecs.map(_fichaBuildSpecPayload);
  } else if (sectionKey === 'review') {
    // 4º bloco (2026-09-08) — consolidado do que já foi inserido nas
    // outras 3 seções. O backend não tem acesso a hacData/A11Y_CATEGORIES,
    // então o resumo chega pronto, mesmo padrão de items/points/specs
    // acima. Lê o estado ATUAL de area.handoffFicha.sections (o que já
    // existe até agora) — nunca bloqueia se alguma seção ainda não foi
    // inserida, o builder já trata isso mostrando só o que existe.
    const isMobile = getA11yProjectOrigin() === 'mobile';
    const sectionLabels = { tabulacao: 'Tabulação', swipe: 'Swipe', leitor: 'Leitor de Tela' };
    const sectionKeysForReview = isMobile ? ['tabulacao', 'swipe', 'leitor'] : ['tabulacao', 'leitor'];
    payload.sectionsSummary = sectionKeysForReview
      .map(key => {
        const state = _fichaSectionState(area, key);
        if (!state || !state.insertedAt) return null;
        const count = state.itemCount !== undefined ? state.itemCount : state.specCount;
        return { label: sectionLabels[key], countLabel: `${count || 0}` };
      })
      .filter(Boolean);
    payload.categoryBreakdown = _a11yComputeCategoryBreakdown(areaSpecsRaw)
      .map(({ meta, count }) => ({ label: meta.label, color: meta.color, count }));
  }

  showToast('Inserindo na Ficha de Handoff…');
  parent.postMessage({ pluginMessage: Object.assign({ type: 'insert-ficha-section' }, payload) }, '*');
}
window._fichaInsertSection = _fichaInsertSection;

// Resposta de insert-ficha-section (messages.js) — atualiza
// hacData.a11yAreas[i].handoffFicha (via a11yAreas, mesma referência que
// saveToStorage sincroniza) e persiste. Re-renderiza a tab ATIVA (o botão
// que acabou de ser clicado precisa trocar de label na hora).
function _fichaHandleSectionInserted(msg) {
  const area = _fichaLiveArea(msg.areaId);
  if (!area) return;

  if (!area.handoffFicha) area.handoffFicha = { frameId: null, sections: _fichaEmptySectionsState() };
  if (!area.handoffFicha.sections) area.handoffFicha.sections = _fichaEmptySectionsState();
  area.handoffFicha.frameId = msg.frameId || area.handoffFicha.frameId || null;

  const countKey = msg.sectionKey === 'leitor' ? 'specCount' : 'itemCount';
  area.handoffFicha.sections[msg.sectionKey] = {
    insertedAt: new Date().toISOString(),
    [countKey]: msg.itemCount || 0,
  };

  saveToStorage();
  if (window._toastSaved) _toastSaved();
  showToast('Ficha de Handoff atualizada.');

  if (typeof _renderA11yWorkspaceTab === 'function') _renderA11yWorkspaceTab();
}
window._fichaHandleSectionInserted = _fichaHandleSectionInserted;

function _fichaHandleSectionInsertFailed(msg) {
  showToast(msg && msg.reason ? msg.reason : 'Não foi possível atualizar a Ficha de Handoff.', 'error');
}
window._fichaHandleSectionInsertFailed = _fichaHandleSectionInsertFailed;

// "Ver ficha no canvas" — só aparece quando pelo menos 1 seção já foi
// inserida (frameId existe). Fire-and-forget, mesmo padrão de
// highlight-tab-order-copy-node.
function _fichaViewOnCanvas() {
  const areaId = window._a11yWorkspaceAreaId;
  const area = _fichaLiveArea(areaId);
  const frameId = area && area.handoffFicha && area.handoffFicha.frameId;
  if (!frameId) return;
  parent.postMessage({ pluginMessage: { type: 'highlight-ficha-node', areaId, frameId } }, '*');
}
window._fichaViewOnCanvas = _fichaViewOnCanvas;

// Resposta de highlight-ficha-node quando o frame não é mais encontrado no
// canvas (ex.: apagado manualmente) — sem isto, "Ver ficha no canvas" falha
// em silêncio (achado real de QA, 2026-09-04).
function _fichaHandleNodeNotFound(msg) {
  showToast('A Ficha de Handoff desta área não foi encontrada no canvas — talvez tenha sido apagada. Insira uma seção novamente para recriá-la.', 'error');
}
window._fichaHandleNodeNotFound = _fichaHandleNodeNotFound;

// ── Dashboard (aba Handoff) — 3 cards de status ─────────────────────────
// Mesmo padrão visual de ícone já usado pro status de Tabulação no card da
// listagem principal de áreas (_a11yAreaAccordionEl): check-circle-2 verde
// = já inserida, circle-dashed cinza = pendente.
function _fichaStatusCardHtml(area, sectionKey, label, countLabelFn) {
  const state = _fichaSectionState(area, sectionKey);
  const inserted = !!(state && state.insertedAt);
  const count = state ? (state.itemCount || state.specCount || 0) : 0;
  return `
    <div class="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50/60 dark:bg-dark-bg/40 rounded-xl border border-gray-100 dark:border-dark-line">
      <i data-lucide="${inserted ? 'check-circle-2' : 'circle-dashed'}" class="w-4 h-4 shrink-0" style="color:${inserted ? '#16a34a' : '#94a3b8'}" aria-hidden="true"></i>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-slate-700 dark:text-white">${label}</p>
        <p class="text-[10px]" style="color:${inserted ? '#16a34a' : '#94a3b8'}">${inserted ? countLabelFn(count) : 'Ainda não inserida na ficha'}</p>
      </div>
      <button type="button" onclick="switchA11yWorkspaceTab('${sectionKey === 'leitor' ? 'leitor' : sectionKey}')"
        class="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full border border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-400 text-[9.5px] font-bold hover:bg-cyan-50 dark:hover:bg-cyan-900/20 active:scale-95 transition-all">
        <i data-lucide="pencil" class="w-3 h-3"></i> Editar
      </button>
    </div>
  `;
}

// Card do 4º bloco (Handoff Review, 2026-09-08) — diferente dos outros
// 3 (_fichaStatusCardHtml), não tem botão "Editar" (não existe uma aba
// "review" pra editar — o conteúdo é só o consolidado das outras 3) e o
// botão de ação já é "Inserir/Atualizar" direto, reaproveitando
// _fichaInsertButtonHtml (genérica por sectionKey).
function _fichaReviewCardHtml(area) {
  const state = _fichaSectionState(area, 'review');
  const inserted = !!(state && state.insertedAt);
  return `
    <div class="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50/60 dark:bg-dark-bg/40 rounded-xl border border-gray-100 dark:border-dark-line">
      <i data-lucide="${inserted ? 'check-circle-2' : 'circle-dashed'}" class="w-4 h-4 shrink-0" style="color:${inserted ? '#16a34a' : '#94a3b8'}" aria-hidden="true"></i>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-slate-700 dark:text-white">Handoff Review</p>
        <p class="text-[10px]" style="color:${inserted ? '#16a34a' : '#94a3b8'}">${inserted ? 'Consolidado na ficha' : 'Ainda não inserido na ficha'}</p>
      </div>
      <button type="button" onclick="_fichaInsertSection('review')"
        class="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full border border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-400 text-[9.5px] font-bold hover:bg-cyan-50 dark:hover:bg-cyan-900/20 active:scale-95 transition-all">
        <i data-lucide="${inserted ? 'refresh-cw' : 'file-plus-2'}" class="w-3 h-3"></i> ${inserted ? 'Atualizar' : 'Inserir'}
      </button>
    </div>
  `;
}

// Chamado por _a11yWorkspaceTabHandoffDashboard (accessibility.js) — monta
// os 4 cards de status + o atalho "Ver ficha no canvas" (visível só quando
// pelo menos 1 seção já foi inserida, ou seja, handoffFicha.frameId existe).
function _fichaDashboardHtml(area) {
  const isMobile = hacData.projectOrigin === 'mobile';
  const hasAnyInserted = !!(area.handoffFicha && area.handoffFicha.frameId);

  const cards = [
    _fichaStatusCardHtml(area, 'tabulacao', 'Tabulação', n => `${n} selo${n === 1 ? '' : 's'} na ficha`),
  ];
  if (isMobile) {
    // Swipe volta a ter "quantidade" (3ª reformulação, 2026-09-04) — mas
    // agora é contagem de PONTOS da trilha (persistida como itemCount na
    // resposta de insert-ficha-section, ver _fichaHandleSectionInserted),
    // não de itens de sequência dentro da área (conceito da v1 original,
    // também removido).
    cards.push(_fichaStatusCardHtml(area, 'swipe', 'Swipe', n => `${n} ${n === 1 ? 'ponto' : 'pontos'} na ficha`));
  }
  cards.push(_fichaStatusCardHtml(area, 'leitor', 'Leitor de Tela', n => `${n} especificaç${n === 1 ? 'ão' : 'ões'} na ficha`));
  // 4º bloco (2026-09-08) — sempre por último, mesma ordem visual fixa
  // da Ficha real (FICHA_SECTION_ORDER, code.js).
  cards.push(_fichaReviewCardHtml(area));

  return `
    <div class="space-y-1.5">
      ${cards.join('')}
    </div>
    ${hasAnyInserted ? `
    <button type="button" onclick="_fichaViewOnCanvas()"
      class="w-full flex items-center justify-center gap-2 h-9 mt-3 rounded-2xl bg-[#0891B2] text-white text-[11px] font-bold hover:bg-cyan-700 active:scale-95 shadow-sm shadow-cyan-500/20 transition-all">
      <i data-lucide="scan-eye" class="w-4 h-4" aria-hidden="true"></i>
      Ver ficha no canvas
    </button>` : ''}
  `;
}
window._fichaDashboardHtml = _fichaDashboardHtml;
