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
  // mb-4 (2026-09-16, pedido do usuário com print real: botão colado na
  // borda inferior do plugin quando a aba tem conteúdo longo o bastante
  // pra rolar — o pb-10 do container pai #a11y-workspace-scroll-container
  // dá respiro só quando o conteúdo é curto o bastante pra não estourar a
  // altura visível; com scroll ativo esse padding fica fora da área
  // percebida como "fim da lista", então o respiro real precisa vir do
  // próprio botão, não só do container). Era mb-1 (4px), insuficiente.
  return `
    <button type="button" onclick="_fichaInsertSection('${escapeHtml(sectionKey)}')"
      class="w-full flex items-center justify-center gap-dsc-nano h-9 mt-auto mb-4 pt-1 rounded-dsc-medium text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-white dark:bg-dark-surface text-blue-700 dark:text-blue-400 shadow-sm hover:shadow active:scale-[0.99] shrink-0">
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
  const meta = A11Y_CATEGORIES[spec.a11yType] || { label: 'Acessibilidade', color: '#005ca9', fill: '#EBF4FB' };
  // categoryLabel por ORIGEM DA SPEC (spec.a11yOrigin), não meta.label cru —
  // a Ficha é o documento final consumido pelo dev; uma spec 'titulo' criada
  // em contexto mobile precisa chegar lá como "Títulos", nunca "Nível de
  // Título" (RN não tem hierarquia H1-H6). Ver getA11yCategoryLabel.
  const categoryLabel = spec.a11yType
    ? (getA11yCategoryLabel(spec.a11yType, spec.a11yOrigin) || meta.label)
    : meta.label;
  return {
    letter: spec.letter || '',
    targetNodeName: spec.targetNodeName || spec.name || '',
    categoryLabel,
    categoryColor: meta.color,
    categoryFill: meta.fill,
    fields: _fichaBuildSpecFields(spec),
  };
}

// Clique em "Inserir na ficha"/"Atualizar ficha" nas abas de trabalho —
// monta o payload da seção pedida (itens de tabOrderItems já persistidos,
// a trilha de hacData.a11ySwipePaths já resolvida, ou specs de a11ySpecs
// Incremento de versão da Section de sessão — UMA entrega = UM incremento
// (2026-09-22, bug real: "tudo que eu mexo começa na versão 1.3"). O backend
// costumava subir 0.1 dentro de insert-ficha-section, que roda uma vez POR
// SEÇÃO: um "Gerar Handoff" com 3 seções pendentes saltava v1.0 → v1.3.
// Agora o bump é explícito e disparado daqui, exatamente uma vez por
// entrega concluída (ver handler bump-a11y-session-version em onmessage.js).
//
// `kind`: 'minor' (default, disparado a cada entrega) ou 'major' (só por
// "Finalizar", ver _fichaConfirmFinalize abaixo).
//
// REVISÃO 2026-09-24: 'minor' virou NO-OP no backend (ver comentário
// completo no handler bump-a11y-session-version, onmessage.js) — pedido do
// usuário, "o versionamento final deve acontecer apenas quando finalizado".
// Continua sendo chamado daqui a cada entrega (não vale a pena remover
// esses call-sites só porque o efeito colateral do lado backend mudou),
// mas não sobe número nenhum enquanto o handoff está em "rascunho". Só
// 'major' (Finalizar) consolida uma versão real — sempre v1.0 na 1ª vez,
// depois v2.0/v3.0/... Existiu um botão de bump major dentro do dashboard
// de CADA TELA — removido em 2026-09-22, versão é propriedade do projeto
// inteiro, não de uma tela.
function _fichaBumpSessionVersion(kind) {
  parent.postMessage({
    pluginMessage: {
      type: 'bump-a11y-session-version',
      kind: kind === 'major' ? 'major' : 'minor',
      designerName: getA11yDesignerName(),
      designerId: getA11yDesignerId(),
    }
  }, '*');
}
window._fichaBumpSessionVersion = _fichaBumpSessionVersion;

// já persistidas) e dispara insert-ficha-section.
// sectionKey ∈ 'tabulacao'|'swipe'|'leitor'.
//
// Versionamento (2026-09-22): esta função NÃO decide se a versão sobe — quem
// decide é _fichaHandleSectionInserted, na resposta de sucesso, checando se
// existe um resolver pendente daquela sectionKey (= chamada veio do laço de
// "Gerar handoff completo", que sobe a versão uma vez só ao final). Clique
// avulso numa seção é uma entrega própria e sobe 0.1 normalmente.
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

  // Lido ANTES de sobrescrever o estado (linha abaixo): se esta seção já
  // tinha insertedAt, esta inserção é uma REINSERÇÃO (edição do que já
  // estava no handoff); se não tinha, é conteúdo ENTRANDO no handoff pela
  // primeira vez. É o que distingue bump minor de nenhum bump — ver
  // comentário na decisão de versão, mais abaixo nesta função.
  const _sectionWasAlreadyInserted = !!(_fichaSectionState(area, msg.sectionKey) || {}).insertedAt;

  const countKey = msg.sectionKey === 'leitor' ? 'specCount' : 'itemCount';
  area.handoffFicha.sections[msg.sectionKey] = {
    insertedAt: new Date().toISOString(),
    [countKey]: msg.itemCount || 0,
  };

  saveToStorage();
  if (window._toastSaved) _toastSaved();
  showToast('Handoff de Acessibilidade atualizado.');

  if (typeof _renderA11yWorkspaceTab === 'function') _renderA11yWorkspaceTab();

  // Incremento de versão (2026-09-22, regra revista no mesmo dia após o
  // usuário observar "a cada nova tela roda um bump de versão"):
  //
  //   - MENOR (v1.0 → v1.1): só quando há EDIÇÃO — uma seção que já estava
  //     no handoff sendo reinserida com conteúdo atualizado.
  //   - Tela/seção ENTRANDO no handoff pela primeira vez NÃO versiona.
  //     Montar o handoff inicial é construir a v1.0, não produzir v1.1,
  //     v1.2, v1.3... — era esse o comportamento errado: documentar 3 telas
  //     novas levava a v1.3 sem nenhuma edição ter acontecido.
  //   - MAIOR (v1.x → v2.0): ação explícita do designer ao finalizar o
  //     handoff do projeto (_fichaConfirmFinalize).
  //
  // O laço de "Gerar handoff completo" continua tratado como UMA entrega:
  // com resolver registrado (_fichaPendingResolvers) o bump não sai daqui,
  // e _fichaGenerateCompleteHandoff decide uma única vez ao final. Roda
  // antes de resolver a promise (a checagem precisa enxergar o resolver
  // ainda registrado).
  const _isPartOfBatch = !!_fichaPendingResolvers[msg.sectionKey];
  if (!_isPartOfBatch && _sectionWasAlreadyInserted) _fichaBumpSessionVersion('minor');

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

// ── Completude do HANDOFF DO PROJETO (2026-09-22) ───────────────────────
// Distinção conceitual pedida pelo usuário: o status "3/3 seções inseridas"
// que o card de cada tela mostra é completude DAQUELA TELA — não de um
// "Handoff de Acessibilidade completo", que é do PROJETO e só existe quando
// TODAS as telas documentadas têm o checklist fechado. Antes desta entrega o
// produto usava o mesmo nome para as duas coisas, o que sugeria que uma tela
// pronta bastava.
//
// Critério de "tela completa" (decisão do usuário, opção mais rigorosa) —
// as seções aplicáveis precisam cumprir TRÊS condições:
//   1. estar INSERIDAS (insertedAt presente);
//   2. ter CONTEÚDO REAL (_fichaCurrentSectionCount > 0);
//   3. estar em dia (não _fichaSectionIsStale — a contagem documentada não
//      divergiu do que foi pro canvas).
//
// A condição 2 foi acrescentada em 2026-09-22 por bug real (print do
// usuário: card com "Tabulação pendente / Ordem de Leitura pendente /
// Leitor de Tela pendente" e "0 especificações", mas "3/3 seções
// inseridas" e o projeto declarado COMPLETO). Causa: inserir uma seção
// VAZIA grava insertedAt com itemCount/specCount = 0, e _fichaSectionIsStale
// compara `currentCount !== grantedCount` — com os dois zerados a
// comparação dá false (em dia), então "inserida + em dia" bastava para
// contar como completa. Uma seção inserida vazia está genuinamente em dia
// e genuinamente não documenta nada: "em dia" nunca foi sinônimo de
// "documentada", e tratar os dois como a mesma coisa é o que produzia um
// "handoff completo" sem uma única spec dentro.
//
// Seções aplicáveis variam por origem: Swipe (Ordem de Leitura) só existe em
// mobile — mesma regra de _fichaDashboardHtml/_fichaGenerateCompleteHandoff,
// nunca duplicada por conta própria aqui.
function _fichaSectionKeysForProject() {
  return isA11yMobileProject() ? ['tabulacao', 'swipe', 'leitor'] : ['tabulacao', 'leitor'];
}

function _fichaAreaIsComplete(area) {
  if (!area) return false;
  return _fichaSectionKeysForProject().every(key => {
    const state = _fichaSectionState(area, key);
    if (!state || !state.insertedAt) return false;
    if (_fichaCurrentSectionCount(area, key) === 0) return false;
    return !_fichaSectionIsStale(area, key);
  });
}
window._fichaAreaIsComplete = _fichaAreaIsComplete;

// Resumo de completude do projeto inteiro — consumido pelo bloco de
// finalização ao final da lista de telas (_fichaProjectSummaryHtml) e pela
// modal de finalização. `pending` traz as telas que faltam, já com o motivo
// legível de cada uma (o designer precisa saber O QUE fazer, não só que
// "falta algo").
// Telas que CONTAM para a completude do projeto (2026-09-22, pedido do
// usuário: "ele tem que verificar isso na página criada, não no arquivo
// todo"). O handoff é o que está na página dedicada do HAC — uma Área
// avulsa criada em outra página do arquivo (fluxo antigo, ou trabalho
// paralelo do designer) não deve fazer o projeto parecer incompleto, nem
// entrar na conta de "X de Y telas".
//
// Só filtra quando SABE qual é a página do handoff (hacData.hacPageId,
// gravado por _openHacPageInstructionModal a partir de 'hac-page-ready').
// Sem esse dado — arquivo que nunca passou pela jornada nova — devolve
// todas as áreas, preservando o comportamento anterior.
//
// Área sem `pageId` (criada antes desta versão) CONTA mesmo com o filtro
// ativo: excluí-la esconderia trabalho real já feito, que é pior do que
// incluir uma tela que talvez esteja fora da página. Campo aditivo, mesma
// política de migração do resto do schema.
function _fichaAreasInScope() {
  const areas = (a11yAreas || []).filter(Boolean);
  const hacPageId = hacData && hacData.hacPageId;
  if (!hacPageId) return areas;
  return areas.filter(a => !a.pageId || a.pageId === hacPageId);
}
window._fichaAreasInScope = _fichaAreasInScope;

function _fichaProjectCompletion() {
  const areas = _fichaAreasInScope();
  const keys = _fichaSectionKeysForProject();
  const pending = [];

  for (const area of areas) {
    if (_fichaAreaIsComplete(area)) continue;
    const missing = [];
    for (const key of keys) {
      const state = _fichaSectionState(area, key);
      if (!state || !state.insertedAt) missing.push(`${_fichaSectionDisplayName(key)} não inserida`);
      else if (_fichaSectionIsStale(area, key)) missing.push(`${_fichaSectionDisplayName(key)} desatualizada`);
    }
    pending.push({ id: area.id, number: area.number, label: area.label || '', missing });
  }

  const total = areas.length;
  const complete = total - pending.length;
  return {
    total,
    complete,
    pending,
    // Um projeto sem nenhuma tela documentada não é "completo" — é vazio.
    isComplete: total > 0 && pending.length === 0,
  };
}
window._fichaProjectCompletion = _fichaProjectCompletion;

// Renderiza o bloco de finalização ao final da lista de telas
// (#a11y-project-handoff-summary, specifications.html) — chamado ao final de
// renderA11yGroupedList (accessibility.js), toda vez que a lista é
// reconstruída. Fica OCULTO enquanto não houver nenhuma tela documentada
// (projeto vazio não é "incompleto", é vazio — mesmo critério de
// _fichaProjectCompletion.isComplete).
function _fichaRenderProjectSummary() {
  const el = document.getElementById('a11y-project-handoff-summary');
  if (!el) return;

  const completion = _fichaProjectCompletion();
  if (completion.total === 0) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');

  // Botão "Finalizar" SEMPRE presente (2026-09-24, revisão do usuário —
  // antes só existia quando completion.isComplete, o que deixava o card
  // "Handoff do projeto" sem nenhuma ação visível enquanto incompleto,
  // ambíguo sobre o que falta pra chegar lá). Agora ele é desabilitado
  // (disabled, sem onclick funcional) até isComplete ficar true — mesmo
  // padrão de "mostrar a ação e explicar por que ela ainda não pode ser
  // usada" já adotado noutros pontos do plugin (ex. botão Confirmar de
  // Ordem de Tabulação, disabled até o Tag ser válido).
  const corDeStatus = completion.isComplete
    ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40'
    : 'bg-gray-50/60 dark:bg-dark-bg/40 border-gray-100 dark:border-dark-line';
  const corDoIcone = completion.isComplete ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-dark-muted';
  const corDoTexto = completion.isComplete ? 'text-green-700 dark:text-green-400' : 'text-slate-500 dark:text-dark-muted';
  const titulo = completion.isComplete ? 'Handoff de Acessibilidade completo' : 'Handoff de Acessibilidade do projeto';
  const icone = completion.isComplete ? 'check-circle-2' : 'circle-dashed';

  el.innerHTML = `
    <div class="flex items-center gap-2.5 px-dsc-micro py-2.5 rounded-dsc-medium border ${corDeStatus}">
      <i data-lucide="${icone}" class="w-4 h-4 shrink-0 ${corDoIcone}" aria-hidden="true"></i>
      <div class="flex-1 min-w-0">
        <p class="text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-700 dark:text-white">${titulo}</p>
        <p class="text-dsc-label-tiny normal-case tracking-normal ${corDoTexto}">${completion.complete} de ${completion.total} tela${completion.total === 1 ? '' : 's'} com o checklist fechado</p>
      </div>
      <button type="button" onclick="_fichaOpenFinalizeModal()"
        data-tooltip="${completion.isComplete ? '' : 'Todas as telas precisam ter o checklist fechado antes de finalizar'}"
        class="shrink-0 inline-flex items-center gap-dsc-quark h-8 px-dsc-nano rounded-dsc-circ text-dsc-label-tiny normal-case tracking-normal font-bold transition-all ${completion.isComplete
          ? 'tooltip-bottom bg-[#005ca9] text-white hover:bg-blue-700 active:scale-95'
          : 'tooltip-bottom tooltip-left bg-gray-200 dark:bg-dark-line text-gray-400 dark:text-dark-muted cursor-not-allowed'}">
        <i data-lucide="flag" class="w-3.5 h-3.5"></i> Finalizar
      </button>
    </div>
  `;
  _refreshIcons();
}
window._fichaRenderProjectSummary = _fichaRenderProjectSummary;

// ── Modal de finalização do Handoff de Acessibilidade (2026-09-22) ──────
// Só abre quando _fichaProjectCompletion().isComplete é true (o botão
// "Finalizar" só existe nesse estado, ver _fichaRenderProjectSummary acima).
// Conteúdo: resumo do que foi documentado + confirmação. Não bloqueia nada
// no canvas — é uma confirmação/registro para o designer, não um gate
// técnico (o handoff já está completo antes de a modal abrir).
function _fichaOpenFinalizeModal() {
  const completion = _fichaProjectCompletion();
  if (!completion.isComplete) return;

  const countEl = document.getElementById('a11y-finalize-handoff-count');
  if (countEl) countEl.textContent = `${completion.total} tela${completion.total === 1 ? '' : 's'} documentada${completion.total === 1 ? '' : 's'}, checklist fechado em todas.`;

  openModal('a11y-finalize-handoff-modal');
}
window._fichaOpenFinalizeModal = _fichaOpenFinalizeModal;

// Confirmar finalização: sobe a versão MAIOR — finalizar o handoff é, por
// definição, fechar uma geração de documentação. Único gatilho de bump
// major hoje (o botão que existia por tela foi removido, ver comentário
// em _fichaBumpSessionVersion acima).
//
// Sem toast otimista aqui (2026-09-24) — antes mostrava "Handoff finalizado"
// de imediato, e a resposta assíncrona de bump-a11y-session-version
// (messages.js) mostrava um SEGUNDO toast com o número da versão, os dois
// pra mesma ação. Agora o único toast é o de lá, que já carrega o número
// real consolidado (vN.0) — informação que este ponto síncrono não tem
// ainda (a versão só existe depois da resposta do backend).
function _fichaConfirmFinalize() {
  _fichaBumpSessionVersion('major');
  closeModal('a11y-finalize-handoff-modal');
}
window._fichaConfirmFinalize = _fichaConfirmFinalize;

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
        class="shrink-0 inline-flex items-center gap-dsc-quark h-7 px-dsc-nano rounded-dsc-circ border border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-400 text-dsc-label-tiny normal-case tracking-normal font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-95 transition-all">
        <i data-lucide="pencil" class="w-3 h-3"></i> Editar
      </button>
    </div>
  `;
}

// Chamado por _a11yWorkspaceTabHandoffDashboard (accessibility.js) — monta
// os 3 cards de status. Havia um 4º card ("Consolidado"/Handoff Review) —
// removido em 2026-09-10, funcionalidade descontinuada (ver
// _buildFichaReviewSection em code.js).
//
// "Ver handoff no canvas" NÃO é mais renderizado aqui (2026-09-24, pedido
// do usuário: "pode ser um botão mais discreto ao lado do gerar handoff.
// pode ser um ícone de focus com o tooltip") — virou um ícone compacto na
// mesma linha de "Gerar Handoff", em
// _a11yWorkspaceTabHandoffDashboard (accessibility.js), em vez de um 2º
// botão largo empilhado abaixo dos cards de status.
function _fichaDashboardHtml(area) {
  const isMobile = isA11yMobileProject();

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
    // O resolver é registrado ANTES do disparo — é ele que
    // _fichaHandleSectionInserted usa pra saber que esta inserção faz parte
    // de um lote e, portanto, não deve incrementar a versão sozinha
    // (o lote inteiro sobe 0.1 uma vez só, ao final).
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

  // Avaliado ANTES do laço, enquanto o estado ainda reflete o que havia no
  // handoff: uma seção com insertedAt que entrou em pendingKeys só pode ter
  // entrado por estar STALE, ou seja, EDIÇÃO de conteúdo já documentado.
  // Seção sem insertedAt é conteúdo novo entrando pela primeira vez, que
  // não versiona (ver regra completa em _fichaHandleSectionInserted).
  const _hasEdit = pendingKeys.some(key => {
    const state = _fichaSectionState(area, key);
    return !!(state && state.insertedAt);
  });

  let anyOk = false;
  for (const key of pendingKeys) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await _fichaInsertSectionAwaitable(key);
    if (ok) anyOk = true;
  }

  // UMA entrega = UM incremento (2026-09-22, bug real: "tudo que eu mexo
  // começa na versão 1.3"). O laço acima pode ter inserido 1, 2 ou 3 seções
  // — todas fazem parte da MESMA geração de handoff, então a versão sobe
  // 0.1 uma única vez aqui, não uma vez por seção (cada
  // _fichaHandleSectionInserted do laço se abstém, ver checagem de
  // _fichaPendingResolvers lá).
  //
  // Duas condições, ambas necessárias (regra revista no mesmo dia):
  //   anyOk   — um lote inteiro que falhou não é uma entrega;
  //   _hasEdit — o lote precisa conter ao menos uma seção que JÁ estava no
  //              handoff e foi reinserida (edição). Um lote só de seções
  //              novas é a montagem inicial do handoff, que não versiona.
  if (anyOk && _hasEdit) _fichaBumpSessionVersion('minor');
}
window._fichaGenerateCompleteHandoff = _fichaGenerateCompleteHandoff;

// "Nova versão" (major, v1.x → v2.0) — decisão explícita do designer, nunca
// automática. Existiu como botão "Iniciar nova versão do handoff" no
// dashboard de CADA TELA (2026-09-22) — removido no mesmo dia: versão é uma
// propriedade da Section de sessão (o PROJETO inteiro), não de uma tela
// individual, e o botão ali sugeria o contrário. A única forma de subir a
// versão maior agora é finalizar o Handoff de Acessibilidade do projeto
// (_fichaConfirmFinalize, disparado pela modal de finalização no resumo
// geral da lista de telas) — mesma semântica de bumpVersion('major') no
// Handex (modules/core.js): sobe o maior e zera o menor.
