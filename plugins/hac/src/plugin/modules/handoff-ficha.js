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
// independentemente. Existiu um botão único "Gerar handoff" antigo (removido
// em 2026-09-04) que reprocessava as 4 seções incondicionalmente — não é o
// mesmo botão: "Gerar handoff completo" (2026-09-09, ver
// _fichaGenerateCompleteHandoff no fim deste arquivo) só REINSERE as seções
// pendentes ou desatualizadas (_fichaSectionIsStale), nunca as 4 de uma vez.
// Estado "Inserir"→"Atualizar" é PERSISTIDO em
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

// Label do botão — "Atualizar Handoff Completo" só depois que aquela seção
// já foi inserida ao menos uma vez (insertedAt presente), "Inserir no
// Handoff Completo" caso contrário. Nunca inferido do canvas.
// Nome interno da função/campos permanece "ficha" (convenção de código,
// nunca visível) — só o TEXTO exibido usa "Handoff Completo" (2026-09-09,
// renomeação pura pedida pelo usuário, sem mudança de arquitetura; texto
// deste botão específico ficou pendente na renomeação original e foi
// reconciliado na auditoria de 2026-09-09).
function _fichaButtonLabel(area, sectionKey) {
  const state = _fichaSectionState(area, sectionKey);
  return (state && state.insertedAt) ? 'Atualizar Handoff Completo' : 'Inserir no Handoff Completo';
}

// Botão usado dentro das 3 abas de trabalho (Tabulação/Swipe/Leitor de
// Tela) — mesmo estilo "outline" já usado pelos outros botões secundários
// dessas abas (ex.: "Gerar Automaticamente").
function _fichaInsertButtonHtml(area, sectionKey) {
  const label = _fichaButtonLabel(area, sectionKey);
  const icon = label === 'Atualizar Handoff Completo' ? 'refresh-cw' : 'file-plus-2';
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
    designerId: getA11yDesignerId(),
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
    const isMobile = isA11yMobileProject();
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
    // 2 blocos novos (2026-09-09) — hierarquia de títulos e itens
    // decorativos, dado 100% real já rastreado em a11ySpecs (sem checklist
    // fixo de contraste/toque/valores, que não existe como dado real hoje).
    // Mesma ordenação por camada já usada na seção "leitor" acima, pra
    // refletir a ordem de leitura real, não a ordem de criação da spec.
    // Hierarquia de títulos só existe de fato na origem web — a lib "Design
    // Acessível" só distingue H1-H6 (property "nivel") nesse fluxo; no
    // mobile o selo é sempre "H" fixo sem sub-nível, então não há hierarquia
    // real pra mostrar. Em mobile o bloco inteiro é omitido (nem entra na
    // payload), mesmo padrão de "não desenha bloco vazio" do resto do card.
    if (!isMobile) {
      const titleSpecs = _a11ySortSpecsByLayerOrder(
        areaSpecsRaw.filter(s => s && s.a11yType === 'titulo'),
        area.id
      );
      const tituloMeta = A11Y_CATEGORIES.titulo || { color: '#AFCA0B' };
      payload.titleHierarchy = titleSpecs.map(s => ({
        letter: s.letter || '',
        targetNodeName: s.targetNodeName || s.name || '',
        targetNodeId: s.targetNodeId || null,
        color: tituloMeta.color,
        componentName: s.a11yDscComponentName ? _cleanDscContainingFrameName(s.a11yDscComponentName) : null,
      }));
    }
    const decorativeSpecs = _a11ySortSpecsByLayerOrder(
      areaSpecsRaw.filter(s => s && s.a11yType === 'decorativo'),
      area.id
    );
    const decorativoMeta = A11Y_CATEGORIES.decorativo || { color: '#D93636', badge: 'Ø' };
    payload.decorativeItems = decorativeSpecs.map(s => ({
      targetNodeName: s.targetNodeName || s.name || '',
      color: decorativoMeta.color,
      badge: decorativoMeta.badge,
      componentName: s.a11yDscComponentName ? _cleanDscContainingFrameName(s.a11yDscComponentName) : null,
    }));
  }

  showToast('Inserindo no Handoff Completo…');
  parent.postMessage({ pluginMessage: Object.assign({ type: 'insert-ficha-section' }, payload) }, '*');
}
window._fichaInsertSection = _fichaInsertSection;

// Fila de espera usada só por _fichaGenerateCompleteHandoff (disparo em
// SEQUÊNCIA, uma seção de cada vez) — mapa sectionKey→{resolve} da promise
// pendente daquela chamada em curso. Não interfere no clique manual de
// "Inserir/Atualizar ficha" (que não registra resolver nenhum, os handlers
// abaixo simplesmente não encontram nada pra resolver e seguem como sempre).
const _fichaPendingResolvers = {};

// Resposta de insert-ficha-section (messages.js) — atualiza
// hacData.a11yAreas[i].handoffFicha (via a11yAreas, mesma referência que
// saveToStorage sincroniza) e persiste. Re-renderiza a tab ATIVA (o botão
// que acabou de ser clicado precisa trocar de label na hora).
function _fichaHandleSectionInserted(msg) {
  const area = _fichaLiveArea(msg.areaId);
  if (!area) {
    _fichaResolvePending(msg.sectionKey, false);
    return;
  }

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
  showToast('Handoff Completo atualizado.');

  if (typeof _renderA11yWorkspaceTab === 'function') _renderA11yWorkspaceTab();
  _fichaResolvePending(msg.sectionKey, true);
}
window._fichaHandleSectionInserted = _fichaHandleSectionInserted;

function _fichaHandleSectionInsertFailed(msg) {
  showToast(msg && msg.reason ? msg.reason : 'Não foi possível atualizar o Handoff Completo.', 'error');
  _fichaResolvePending(msg && msg.sectionKey, false);
}
window._fichaHandleSectionInsertFailed = _fichaHandleSectionInsertFailed;

// Resolve (se existir) a promise pendente de _fichaGenerateCompleteHandoff
// pra aquela sectionKey — nunca lança se não houver nenhuma registrada
// (fluxo manual normal, fora do botão "Gerar handoff completo").
function _fichaResolvePending(sectionKey, ok) {
  const resolver = sectionKey && _fichaPendingResolvers[sectionKey];
  if (!resolver) return;
  delete _fichaPendingResolvers[sectionKey];
  resolver(ok);
}

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
  showToast('O Handoff Completo desta área não foi encontrado no canvas — talvez tenha sido apagado. Insira uma seção novamente para recriá-lo.', 'error');
}
window._fichaHandleNodeNotFound = _fichaHandleNodeNotFound;

// Contagem ATUAL de uma seção (mesmas fontes já usadas em
// _fichaInsertSection, nunca fontes novas) — usada tanto por
// _fichaSectionIsStale quanto, se preciso, por diagnóstico futuro.
// sectionKey ∈ 'tabulacao'|'swipe'|'leitor' (review não tem contagem própria,
// ver _fichaEmptySectionsState).
function _fichaCurrentSectionCount(area, sectionKey) {
  if (sectionKey === 'tabulacao') {
    return typeof _currentTabOrderItems === 'function' ? _currentTabOrderItems(area.id).length : 0;
  }
  if (sectionKey === 'swipe') {
    const path = (hacData.a11ySwipePaths || []).find(p => p && p.areaId === area.id) || null;
    return path && Array.isArray(path.points) ? path.points.length : 0;
  }
  if (sectionKey === 'leitor') {
    return (a11ySpecs || []).filter(s => s && s.a11yAreaId === area.id).length;
  }
  return 0;
}

// Alerta de "desatualizado" (2026-09-09, pedido do usuário) — detecção por
// COMPARAÇÃO DE CONTAGEM (itemCount/specCount gravado no momento da inserção
// vs. contagem atual), nunca por timestamp de edição por item. Só se aplica
// depois de já ter sido inserida ao menos 1 vez (insertedAt presente) — antes
// disso o card já mostra "Ainda não inserida", sem alerta separado. Limitação
// aceita e intencional: editar o CONTEÚDO de um item já contado (sem mudar a
// quantidade) não dispara o alerta. Não se aplica a 'review' isoladamente
// (ver _fichaReviewIsStale).
function _fichaSectionIsStale(area, sectionKey) {
  const state = _fichaSectionState(area, sectionKey);
  if (!state || !state.insertedAt) return false;
  const grantedCount = sectionKey === 'leitor' ? (state.specCount || 0) : (state.itemCount || 0);
  const currentCount = _fichaCurrentSectionCount(area, sectionKey);
  return currentCount !== grantedCount;
}

// Chaves-fonte do Review — mesmo filtro por origem já usado em
// _fichaInsertSection (swipe só existe em projetos mobile).
function _fichaReviewSourceKeys() {
  const isMobile = isA11yMobileProject();
  return isMobile ? ['tabulacao', 'swipe', 'leitor'] : ['tabulacao', 'leitor'];
}

// O Review fica stale se qualquer seção-fonte estiver stale — o consolidado
// que ele mostra depende inteiramente dos números das outras 3.
function _fichaReviewIsStale(area) {
  return _fichaReviewSourceKeys().some(key => _fichaSectionIsStale(area, key));
}
window._fichaSectionIsStale = _fichaSectionIsStale;
window._fichaReviewIsStale = _fichaReviewIsStale;

// ── Dashboard (aba Handoff) — 3 cards de status ─────────────────────────
// Mesmo padrão visual de ícone já usado pro status de Tabulação no card da
// listagem principal de áreas (_a11yAreaAccordionEl): check-circle-2 verde
// = já inserida, circle-dashed cinza = pendente. alert-circle âmbar = já
// inserida mas desatualizada (_fichaSectionIsStale), 2026-09-09.
//
// Cor por classe Tailwind com variante dark (auditoria 2026-09-09) — antes
// usava hex fixo via style="color:${hex}" sem variante dark, com contraste
// abaixo do mínimo WCAG AA no tema escuro (âmbar ~3,9:1, verde ~3,2:1,
// mínimo exigido 4,5:1). Mesmo vocabulário de classe já usado no resto do
// hac (accessibility.js, ex. text-amber-600 dark:text-amber-400 e
// text-slate-400 dark:text-dark-muted) — nunca hex solto.
function _fichaStatusColorClass(state) {
  if (state === 'stale') return 'text-amber-600 dark:text-amber-400';
  if (state === 'inserted') return 'text-green-600 dark:text-green-400';
  return 'text-slate-400 dark:text-dark-muted';
}

function _fichaStatusCardHtml(area, sectionKey, label, countLabelFn) {
  const state = _fichaSectionState(area, sectionKey);
  const inserted = !!(state && state.insertedAt);
  const count = state ? (state.itemCount || state.specCount || 0) : 0;
  const stale = inserted && _fichaSectionIsStale(area, sectionKey);
  const currentCount = stale ? _fichaCurrentSectionCount(area, sectionKey) : count;

  let icon = 'circle-dashed';
  let colorState = 'pending';
  let statusText = 'Ainda não inserida no handoff';
  if (stale) {
    icon = 'alert-circle';
    colorState = 'stale';
    statusText = `${currentCount} agora — handoff tem ${count}, clique Atualizar`;
  } else if (inserted) {
    icon = 'check-circle-2';
    colorState = 'inserted';
    statusText = countLabelFn(count);
  }
  const colorClass = _fichaStatusColorClass(colorState);

  return `
    <div class="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50/60 dark:bg-dark-bg/40 rounded-xl border border-gray-100 dark:border-dark-line">
      <i data-lucide="${icon}" class="w-4 h-4 shrink-0 ${colorClass}" aria-hidden="true"></i>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-slate-700 dark:text-white">${label}</p>
        <p class="text-[10px] ${colorClass}">${statusText}</p>
      </div>
      <button type="button" onclick="switchA11yWorkspaceTab('${sectionKey === 'leitor' ? 'leitor' : sectionKey}')"
        class="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full border border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-400 text-[9.5px] font-bold hover:bg-cyan-50 dark:hover:bg-cyan-900/20 active:scale-95 transition-all">
        <i data-lucide="pencil" class="w-3 h-3"></i> Editar
      </button>
    </div>
  `;
}

// Card do 4º bloco (rótulo exibido "Consolidado", nome interno/sectionKey
// segue "review" desde 2026-09-08 — só o texto de UI foi reconciliado para
// português na auditoria de 2026-09-09, mesmo padrão já aplicado a
// _fichaButtonLabel) — diferente dos outros 3 (_fichaStatusCardHtml), não
// tem botão "Editar" (não existe uma aba "review" pra editar — o conteúdo
// é só o consolidado das outras 3) e o botão de ação já é
// "Inserir/Atualizar" direto, reaproveitando _fichaInsertButtonHtml
// (genérica por sectionKey).
function _fichaReviewCardHtml(area) {
  const state = _fichaSectionState(area, 'review');
  const inserted = !!(state && state.insertedAt);
  // Stale por tabela (2026-09-09): mesmo que o Review em si tenha sido
  // inserido corretamente da última vez, o consolidado que ele mostra fica
  // desatualizado se qualquer seção-fonte (tabulacao/leitor/swipe-só-mobile)
  // mudou de contagem desde então.
  const stale = inserted && _fichaReviewIsStale(area);

  let icon = 'circle-dashed';
  let colorState = 'pending';
  let statusText = 'Ainda não inserido no handoff';
  if (stale) {
    icon = 'alert-circle';
    colorState = 'stale';
    statusText = 'Dados de origem mudaram — clique Atualizar';
  } else if (inserted) {
    icon = 'check-circle-2';
    colorState = 'inserted';
    statusText = 'Consolidado no handoff';
  }
  const colorClass = _fichaStatusColorClass(colorState);

  return `
    <div class="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50/60 dark:bg-dark-bg/40 rounded-xl border border-gray-100 dark:border-dark-line">
      <i data-lucide="${icon}" class="w-4 h-4 shrink-0 ${colorClass}" aria-hidden="true"></i>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-slate-700 dark:text-white">Consolidado</p>
        <p class="text-[10px] ${colorClass}">${statusText}</p>
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
  const isMobile = isA11yMobileProject();
  const hasAnyInserted = !!(area.handoffFicha && area.handoffFicha.frameId);

  const cards = [
    _fichaStatusCardHtml(area, 'tabulacao', 'Tabulação', n => `${n} selo${n === 1 ? '' : 's'} no handoff`),
  ];
  if (isMobile) {
    // Swipe volta a ter "quantidade" (3ª reformulação, 2026-09-04) — mas
    // agora é contagem de PONTOS da trilha (persistida como itemCount na
    // resposta de insert-ficha-section, ver _fichaHandleSectionInserted),
    // não de itens de sequência dentro da área (conceito da v1 original,
    // também removido).
    cards.push(_fichaStatusCardHtml(area, 'swipe', 'Swipe', n => `${n} ${n === 1 ? 'ponto' : 'pontos'} no handoff`));
  }
  cards.push(_fichaStatusCardHtml(area, 'leitor', 'Leitor de Tela', n => `${n} especificaç${n === 1 ? 'ão' : 'ões'} no handoff`));
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
      Ver handoff no canvas
    </button>` : ''}
  `;
}
window._fichaDashboardHtml = _fichaDashboardHtml;

// ── "Gerar handoff completo" (2026-09-09, pedido do usuário) ────────────
// Botão único no topo da aba Handoff do dashboard (accessibility.js,
// _a11yWorkspaceTabHandoffDashboard) — reinsere SÓ as seções pendentes
// (nunca inseridas) ou desatualizadas (_fichaSectionIsStale), nunca as 4
// incondicionalmente: mais rápido e evita retrabalho no canvas para seções
// já em dia. Se qualquer uma de tabulacao/swipe/leitor entrar na lista,
// 'review' é forçado a entrar também — o consolidado precisa refletir os
// dados novos que serão reinseridos nesta mesma rodada, mesmo que o Review
// isoladamente não estivesse stale.
//
// Disparo SEQUENCIAL (uma seção por vez, aguardando a resposta do backend
// antes da próxima) — decisão deliberada, não só "mais simples":
// 1) _fichaHandleSectionInserted (acima) faz saveToStorage() +
//    _renderA11yWorkspaceTab() a cada resposta — disparar as 4 mensagens de
//    uma vez faria o backend responder em qualquer ordem e essas
//    reconstruções de DOM/storage se sobporiam sem necessidade.
// 2) 'review' DEPENDE do estado already-persisted das outras 3 seções (lê
//    area.handoffFicha.sections em _fichaInsertSection) — se disparado em
//    paralelo com 'tabulacao'/'leitor', corre risco real de montar o
//    resumo ANTES da resposta delas ter sido persistida. Sequencial
//    elimina esse risco por construção (review só dispara depois que as
//    seções anteriores já resolveram).
// Reaproveita a fila _fichaPendingResolvers (já usada só por este fluxo,
// o clique manual de "Inserir/Atualizar ficha" não passa por ela).
function _fichaInsertSectionAwaitable(sectionKey) {
  return new Promise(resolve => {
    _fichaPendingResolvers[sectionKey] = resolve;
    _fichaInsertSection(sectionKey);
  });
}

async function _fichaGenerateCompleteHandoff(areaId) {
  const area = _fichaLiveArea(areaId);
  if (!area) return;

  const isMobile = isA11yMobileProject();
  const candidateKeys = ['tabulacao', 'swipe', 'leitor', 'review'].filter(key => key !== 'swipe' || isMobile);

  const needsWork = key => {
    const state = _fichaSectionState(area, key);
    if (!state || !state.insertedAt) return true; // pendente, nunca inserida
    return key === 'review' ? _fichaReviewIsStale(area) : _fichaSectionIsStale(area, key);
  };

  let pendingKeys = candidateKeys.filter(needsWork);

  // Se qualquer seção-fonte do Review entrar na lista, força 'review'
  // junto (mesmo que isoladamente não estivesse pendente/stale) — o
  // consolidado precisa refletir os dados que serão reinseridos agora.
  const hasSourceSection = pendingKeys.some(key => key !== 'review');
  if (hasSourceSection && candidateKeys.includes('review') && !pendingKeys.includes('review')) {
    pendingKeys.push('review');
  }

  // Ordem fixa de execução (mesma ordem visual/lógica de sempre) — 'review'
  // sempre por último, depois que as seções-fonte já foram reinseridas.
  const order = ['tabulacao', 'swipe', 'leitor', 'review'];
  pendingKeys = order.filter(key => pendingKeys.includes(key));

  if (pendingKeys.length === 0) {
    showToast('O Handoff Completo já está atualizado.');
    return;
  }

  for (const key of pendingKeys) {
    // eslint-disable-next-line no-await-in-loop
    await _fichaInsertSectionAwaitable(key);
  }
}
window._fichaGenerateCompleteHandoff = _fichaGenerateCompleteHandoff;
