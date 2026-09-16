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
// em 2026-09-04) que reprocessava todas as seções incondicionalmente — não
// é o mesmo botão: "Gerar handoff completo" (2026-09-09, ver
// _fichaGenerateCompleteHandoff no fim deste arquivo) só REINSERE as seções
// pendentes ou desatualizadas (_fichaSectionIsStale), nunca todas de uma
// vez. Houve também um 4º bloco de dashboard ("Handoff Review",
// consolidado) — removido em 2026-09-10, funcionalidade descontinuada
// (nunca finalizada, ver comentário de remoção em _buildFichaReviewSection,
// code.js).
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
  };
}

function _fichaSectionState(area, sectionKey) {
  return (area && area.handoffFicha && area.handoffFicha.sections && area.handoffFicha.sections[sectionKey]) || null;
}

// Nome de exibição de cada seção da Ficha — mesmo texto das abas de
// trabalho (specifications.html, #a11y-workspace-tabs: "Tabulação"/
// "Swipe"/"Leitor de Tela", pedido do usuário: "pode usar o mesmo nome das
// abas"), não o nome mais longo usado alhures ("Ordem de Tabulação"/
// "Trilha de Swipe"). Fonte única, reaproveitada pelo label do botão
// (_fichaButtonLabel) e pelo texto do loading de canvas em
// _fichaInsertSection (antes duplicado como ternário solto nos dois
// lugares, com o nome longo).
function _fichaSectionDisplayName(sectionKey) {
  return sectionKey === 'tabulacao' ? 'Tabulação' : sectionKey === 'swipe' ? 'Swipe' : 'Leitor de Tela';
}

// Label do botão — "Atualizar [Nome da Funcionalidade]" só depois que
// aquela seção já foi inserida ao menos uma vez (insertedAt presente),
// "Preencher [Nome da Funcionalidade]" caso contrário. Nunca inferido do
// canvas. Nome interno da função/campos permanece "ficha" (convenção de
// código, nunca visível) — só o TEXTO exibido muda. Renomeado de "Inserir/
// Atualizar Handoff Completo" pra "Preencher/Atualizar Handoff"
// (2026-09-11), e de "Preencher/Atualizar Handoff" (genérico, sem indicar
// QUAL seção) pra "Preencher/Atualizar [Ordem de Tabulação|Trilha de
// Swipe|Leitor de Tela]" (2026-09-15, pedido do usuário: "para que fique
// reconhecível o que está sendo levado pro handoff" — o botão aparece em 3
// lugares diferentes (abas Tabulação/Swipe/Leitor de Tela) e o texto
// genérico não deixava claro qual seção específica seria inserida/
// atualizada).
function _fichaButtonLabel(area, sectionKey) {
  const state = _fichaSectionState(area, sectionKey);
  const verb = (state && state.insertedAt) ? 'Atualizar' : 'Preencher';
  return `${verb} ${_fichaSectionDisplayName(sectionKey)}`;
}

// Botão usado dentro das 3 abas de trabalho (Tabulação/Swipe/Leitor de
// Tela) — mesmo estilo "outline" já usado pelos outros botões secundários
// dessas abas (ex.: "Gerar Automaticamente").
// Bug real corrigido (2026-09-11): o ícone comparava `label === 'Atualizar
// Handoff Completo'` — igualdade contra o TEXTO exibido, não um enum
// interno. Renomear o texto sem corrigir isso quebraria silenciosamente a
// troca de ícone (sempre cairia no else). Corrigido pra comparar
// `state.insertedAt` diretamente, a mesma fonte de verdade que já gera o
// label.
//
// `hasItems` (2026-09-15, pedido do usuário: "aparece apenas quando tiver
// itens para serem inseridos no handoff") — sem nada documentado na aba
// não há o que levar pro handoff, e o botão só ocuparia espaço oferecendo
// uma ação vazia. Quem sabe se há itens é cada aba (a fonte é diferente em
// cada uma: itens de Tabulação, trilha de Swipe, specs de Leitor de Tela),
// por isso a condição chega pronta em vez de ser recalculada aqui.
//
// `mt-auto` empurra o botão pra base do container flex-col da aba
// (_a11yWorkspaceTab*), mantendo-o na extremidade baixa do plugin mesmo
// quando o conteúdo acima é curto — sem precisar de um rodapé fixo real.
function _fichaInsertButtonHtml(area, sectionKey, hasItems) {
  if (!hasItems) return '';
  const state = _fichaSectionState(area, sectionKey);
  const already = !!(state && state.insertedAt);
  const label = _fichaButtonLabel(area, sectionKey);
  const icon = already ? 'refresh-cw' : 'file-plus-2';
  return `
    <button type="button" onclick="_fichaInsertSection('${escapeHtml(sectionKey)}')"
      class="w-full flex items-center justify-center gap-dsc-nano h-9 mt-auto mb-1 pt-1 rounded-dsc-medium text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-white dark:bg-dark-surface text-cyan-700 dark:text-cyan-400 shadow-sm hover:shadow active:scale-[0.99] shrink-0">
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
// sectionKey ∈ 'tabulacao'|'swipe'|'leitor'.
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
  }

  // Loading de canvas (2026-09-14, ver showA11yCanvasLoading em
  // accessibility.js) — esta função é chamada em SEQUÊNCIA pelo "Gerar
  // handoff completo" (_fichaGenerateCompleteHandoff, uma seção de cada
  // vez): reabrir com texto novo antes do fechamento da chamada anterior é
  // seguro (mesmo modal, só troca o texto), não pisca duas transições
  // visuais distintas.
  if (typeof showA11yCanvasLoading === 'function') showA11yCanvasLoading(`Consolidando ${_fichaSectionDisplayName(sectionKey)} no Handoff de Acessibilidade…`);
  showToast('Consolidando Handoff de Acessibilidade…');
  parent.postMessage({ pluginMessage: Object.assign({ type: 'insert-ficha-section' }, payload) }, '*');
}
window._fichaInsertSection = _fichaInsertSection;

// Botão "Editar" do card de status (2026-09-11, consolidação Section/
// Ficha) — quando a seção JÁ foi inserida (virou imagem no "[HAC]
// Documento Final"), prepara a réplica de trabalho de volta (recria o
// clone a partir do frame original na Zona de Rascunho, sinaliza o bloco
// final como desatualizado) antes de trocar de aba. Quando a seção NUNCA
// foi inserida, comportamento idêntico ao de antes desta mudança — só
// troca de aba, não há bloco final pra marcar/preparar nada.
function _fichaEditSection(sectionKey) {
  const areaId = window._a11yWorkspaceAreaId;
  const area = _fichaLiveArea(areaId);
  if (!area) return;

  const state = _fichaSectionState(area, sectionKey);
  const inserted = !!(state && state.insertedAt);
  if (!inserted) {
    switchA11yWorkspaceTab(sectionKey);
    return;
  }

  const payload = {
    area: Object.assign({}, area, { a11yOrigin: getA11yProjectOrigin() || 'web', sectionName: getA11yActiveSectionName() }),
    sectionKey,
    designerName: getA11yDesignerName(),
    designerId: getA11yDesignerId(),
  };
  // Loading de canvas (2026-09-14) — recriar a réplica de trabalho a partir
  // do frame original pode levar segundos, mesmo motivo de insert-ficha-section.
  if (typeof showA11yCanvasLoading === 'function') showA11yCanvasLoading('Preparando réplica de trabalho…');
  parent.postMessage({ pluginMessage: Object.assign({ type: 'prepare-ficha-section-edit' }, payload) }, '*');
  switchA11yWorkspaceTab(sectionKey);
}
window._fichaEditSection = _fichaEditSection;

// Resposta de prepare-ficha-section-edit (messages.js) — não mexe em
// area.handoffFicha (o dado só muda quando "Atualizar Handoff" for
// clicado de novo, mesmo trade-off já documentado no cabeçalho deste
// módulo: o estado "mente" até a próxima inserção real).
function _fichaHandleSectionEditReady(msg) {
  if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
  showToast('Réplica de trabalho pronta. Edite e clique em "Atualizar Handoff" quando terminar.');
}
window._fichaHandleSectionEditReady = _fichaHandleSectionEditReady;

// Resposta de falha de prepare-ficha-section-edit — mesmo padrão de
// _fichaHandleSectionInsertFailed.
function _fichaHandleSectionEditFailed(msg) {
  if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
  showToast(msg && msg.reason ? msg.reason : 'Não foi possível preparar a edição desta seção.', 'error');
}
window._fichaHandleSectionEditFailed = _fichaHandleSectionEditFailed;

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
  if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
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
  showToast('Handoff de Acessibilidade atualizado.');

  if (typeof _renderA11yWorkspaceTab === 'function') _renderA11yWorkspaceTab();
  _fichaResolvePending(msg.sectionKey, true);
}
window._fichaHandleSectionInserted = _fichaHandleSectionInserted;

function _fichaHandleSectionInsertFailed(msg) {
  if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
  showToast(msg && msg.reason ? msg.reason : 'Não foi possível atualizar o Handoff de Acessibilidade.', 'error');
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
  showToast('O Handoff de Acessibilidade desta tela não foi encontrado no canvas, talvez tenha sido apagado. Insira uma seção novamente para recriá-lo.', 'error');
}
window._fichaHandleNodeNotFound = _fichaHandleNodeNotFound;

// Contagem ATUAL de uma seção (mesmas fontes já usadas em
// _fichaInsertSection, nunca fontes novas) — usada tanto por
// _fichaSectionIsStale quanto, se preciso, por diagnóstico futuro.
// sectionKey ∈ 'tabulacao'|'swipe'|'leitor'.
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
// quantidade) não dispara o alerta.
function _fichaSectionIsStale(area, sectionKey) {
  const state = _fichaSectionState(area, sectionKey);
  if (!state || !state.insertedAt) return false;
  const grantedCount = sectionKey === 'leitor' ? (state.specCount || 0) : (state.itemCount || 0);
  const currentCount = _fichaCurrentSectionCount(area, sectionKey);
  return currentCount !== grantedCount;
}
window._fichaSectionIsStale = _fichaSectionIsStale;

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
    statusText = `${currentCount} agora, handoff tem ${count}. Clique Atualizar`;
  } else if (inserted) {
    icon = 'check-circle-2';
    colorState = 'inserted';
    statusText = countLabelFn(count);
  }
  const colorClass = _fichaStatusColorClass(colorState);

  return `
    <div class="flex items-center gap-2.5 px-dsc-micro py-2.5 bg-gray-50/60 dark:bg-dark-bg/40 rounded-dsc-medium border border-gray-100 dark:border-dark-line shadow-dsc-elevation-1">
      <i data-lucide="${icon}" class="w-4 h-4 shrink-0 ${colorClass}" aria-hidden="true"></i>
      <div class="flex-1 min-w-0">
        <p class="text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-700 dark:text-white">${label}</p>
        <p class="text-dsc-label-tiny normal-case tracking-normal ${colorClass}">${statusText}</p>
      </div>
      <button type="button" onclick="_fichaEditSection('${sectionKey === 'leitor' ? 'leitor' : sectionKey}')"
        class="shrink-0 inline-flex items-center gap-dsc-quark h-7 px-dsc-nano rounded-dsc-circ border border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-400 text-dsc-label-tiny normal-case tracking-normal font-bold hover:bg-cyan-50 dark:hover:bg-cyan-900/20 active:scale-95 transition-all">
        <i data-lucide="pencil" class="w-3 h-3"></i> Editar
      </button>
    </div>
  `;
}

// Chamado por _a11yWorkspaceTabHandoffDashboard (accessibility.js) — monta
// os 3 cards de status + o atalho "Ver ficha no canvas" (visível só quando
// pelo menos 1 seção já foi inserida, ou seja, handoffFicha.frameId existe).
// Havia um 4º card ("Consolidado"/Handoff Review) — removido em 2026-09-10,
// funcionalidade descontinuada (ver _buildFichaReviewSection em code.js).
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

  return `
    <div class="space-y-1.5">
      ${cards.join('')}
    </div>
    ${hasAnyInserted ? `
    <button type="button" onclick="_fichaViewOnCanvas()"
      class="w-full flex items-center justify-center gap-dsc-nano h-9 mt-3 rounded-dsc-large bg-[#0891B2] text-white text-dsc-label-tiny normal-case tracking-normal font-bold hover:bg-cyan-700 active:scale-95 shadow-sm shadow-cyan-500/20 transition-all">
      <i data-lucide="scan-eye" class="w-4 h-4" aria-hidden="true"></i>
      Ver handoff no canvas
    </button>` : ''}
  `;
}
window._fichaDashboardHtml = _fichaDashboardHtml;

// ── "Gerar handoff completo" (2026-09-09, pedido do usuário) ────────────
// Botão único no topo da aba Handoff do dashboard (accessibility.js,
// _a11yWorkspaceTabHandoffDashboard) — reinsere SÓ as seções pendentes
// (nunca inseridas) ou desatualizadas (_fichaSectionIsStale), nunca as 3
// incondicionalmente: mais rápido e evita retrabalho no canvas para seções
// já em dia. Havia um 4º bloco ("review", consolidado) com uma dependência
// própria de ordem/staleness — removido em 2026-09-10, funcionalidade
// descontinuada (ver comentário de remoção em _buildFichaReviewSection,
// code.js).
//
// Disparo SEQUENCIAL (uma seção por vez, aguardando a resposta do backend
// antes da próxima) — decisão deliberada, não só "mais simples":
// _fichaHandleSectionInserted (acima) faz saveToStorage() +
// _renderA11yWorkspaceTab() a cada resposta — disparar várias mensagens de
// uma vez faria o backend responder em qualquer ordem e essas reconstruções
// de DOM/storage se sobporiam sem necessidade.
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
  const candidateKeys = ['tabulacao', 'swipe', 'leitor'].filter(key => key !== 'swipe' || isMobile);

  const needsWork = key => {
    const state = _fichaSectionState(area, key);
    if (!state || !state.insertedAt) return true; // pendente, nunca inserida
    return _fichaSectionIsStale(area, key);
  };

  let pendingKeys = candidateKeys.filter(needsWork);

  // Ordem fixa de execução (mesma ordem visual/lógica de sempre).
  const order = ['tabulacao', 'swipe', 'leitor'];
  pendingKeys = order.filter(key => pendingKeys.includes(key));

  if (pendingKeys.length === 0) {
    showToast('O Handoff de Acessibilidade já está atualizado.');
    return;
  }

  for (const key of pendingKeys) {
    // eslint-disable-next-line no-await-in-loop
    await _fichaInsertSectionAwaitable(key);
  }
}
window._fichaGenerateCompleteHandoff = _fichaGenerateCompleteHandoff;
