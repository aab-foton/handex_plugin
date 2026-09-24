// ============================================================
// messages.js — hac — dispatcher único de window.onmessage
//
// ADAPTAÇÃO do Handex Beta (src/plugin/modules/messages.js) para o
// schema enxuto do hac — 2026-08-24. Mantém só o roteamento de
// mensagens relacionado a acessibilidade (Marcar Área, Specs de A11y,
// Detecção Automática, Ordem de Tabulação); cortado tudo referente a
// frames, fluxos, medidas, briefing, specs normais e export de ficha.
//
// Recebe mensagens postadas pelo backend Figma (code.js) e despacha
// para as funções da UI. As funções chamadas vivem em core.js /
// accessibility.js.
// ============================================================

    function applyFigmaTheme(theme) {
      // Preferência manual do usuário tem prioridade sobre o tema do Figma
      let override = null;
      try { override = localStorage.getItem('theme'); } catch (e) { }
      const resolved = override || theme || 'light';
      const isDark = resolved === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      document.querySelectorAll('.sun-icon').forEach(el => el.classList.toggle('hidden', isDark));
      document.querySelectorAll('.moon-icon').forEach(el => el.classList.toggle('hidden', !isDark));
    }

    // --- MESSAGE HANDLING CONSOLIDATION ---
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === 'init-plugin') {
        applyFigmaTheme(msg.theme);
        // Versão exibida na modal "Sobre o hac" (aberta ao clicar em CAIXA|HAC
        // no header) — badge fixa no header foi removida em favor da modal.
        const aboutVersion = document.getElementById('about-hac-version');
        if (aboutVersion) aboutVersion.textContent = 'v' + msg.version;
        // Guardado globalmente (2026-09-22) para o backup .json registrar em
        // qual versão do plugin foi gerado — útil ao restaurar um arquivo
        // antigo e entender divergências de schema.
        window.PLUGIN_VERSION = msg.version || null;
        // Identificador do ARQUIVO Figma atual (2026-09-22) — gravado no
        // backup exportado (exportHacBackupJson) e comparado na restauração
        // (_handleHacBackupFileChosen): ver comentário completo em
        // onmessage.js, handler 'ui-ready'.
        window.PLUGIN_FILE_KEY = msg.fileKey || null;

        // Armazena o usuário Figma identificado automaticamente (sem login)
        if (msg.currentUser) {
          hacData.currentUser = msg.currentUser;
          const userSlot = document.getElementById('header-user-slot');
          if (userSlot) {
            const u = msg.currentUser;
            const avatarHtml = u.photoUrl
              ? `<img src="${u.photoUrl}" alt="${u.name}" class="w-5 h-5 rounded-dsc-circ object-cover border border-slate-200 dark:border-dark-line" />`
              : `<span class="w-5 h-5 rounded-dsc-circ bg-blue-500 flex items-center justify-center text-white text-dsc-label-tiny normal-case tracking-normal font-bold">${u.name.charAt(0).toUpperCase()}</span>`;
            userSlot.innerHTML = `
              <div class="flex items-center gap-1.5" title="${u.name}">
                ${avatarHtml}
                <span class="text-dsc-label-tiny normal-case tracking-normal font-medium text-slate-500 dark:text-dark-muted max-w-[80px] truncate">${u.name.split(' ')[0]}</span>
              </div>`;
          }
        }

        if (msg.savedState) {
          // Restaura hacData preservando currentUser recém-recebido do Figma
          const mergedState = { ...hacData, ...msg.savedState };
          mergedState.currentUser = hacData.currentUser;
          hacData = mergedState;
          a11yAreas = hacData.a11yAreas || [];
          a11ySpecs = hacData.a11ySpecs || [];
          // Migração silenciosa e aditiva (não sobe _schemaVersion): specs
          // "elemento" mobile criadas antes da introdução das 3 sub-variantes
          // (componente/link/texto alternativo) ganham a11ySubtype.variant
          // por inferência. Idempotente — specs já migradas ou de origem
          // desktop nunca são tocadas. Ver _migrateA11yElementoMobileVariants
          // em accessibility.js.
          if (typeof _migrateA11yElementoMobileVariants === 'function') {
            a11ySpecs = _migrateA11yElementoMobileVariants(a11ySpecs);
          }
          tabOrderItems = hacData.tabOrderItems || [];
          // a11ySwipePaths é array novo (2026-09-04, 3ª reformulação —
          // substitui o antigo a11ySwipeFlows, conexão entre 2 áreas por
          // dropdown) — migração por ausência, mesmo padrão de tabOrderItems
          // acima: hacData salvo antes desta versão simplesmente não tem o
          // campo. Vive só em hacData (não tem variável solta espelhada, ao
          // contrário de tabOrderItems/a11yAreas/a11ySpecs) — todo ponto de
          // leitura acessa hacData.a11ySwipePaths diretamente.
          hacData.a11ySwipePaths = hacData.a11ySwipePaths || [];
          if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
        }

        // O banner só é avaliado quando o usuário de fato navega para
        // view-specifications (ver navigate() em core.js) — não no boot,
        // que sempre abre em view-home.
        if (typeof setOnboardingSeenState === 'function') setOnboardingSeenState(msg.onboardingSeen);
        // window._a11ySpecModalInstructionShown removido em 2026-09-11 — a
        // instrução única de vida inteira virou orientação repetida no gate
        // de seleção (openA11yCategoryPickerModal, accessibility.js).

        // Zera hacData.projectOrigin/projectLib se o arquivo estiver
        // genuinamente em branco (nenhuma Área/Spec/Tabulação/Swipe
        // documentada) — único ponto onde este reset roda (2026-09-16, bug
        // real corrigido: antes rodava a cada _renderA11yHomeOriginPicker(),
        // inclusive o disparo indireto de dentro do próprio
        // setA11yProjectOrigin ao escolher a lib pela primeira vez, o que
        // zerava a escolha recém-feita antes do designer conseguir Marcar a
        // primeira Área). Precisa rodar ANTES de _renderA11yHomeOriginPicker
        // logo abaixo, e só aqui — uma vez por carregamento do arquivo,
        // nunca de novo durante o uso normal da sessão atual. Ver comentário
        // em _renderA11yHomeOriginPicker (accessibility.js) para o histórico
        // completo.
        if (typeof _resetA11yProjectOriginIfNothingDocumented === 'function') {
          _resetA11yProjectOriginIfNothingDocumented();
        }

        // A escolha de plataforma (picker Web/Mobile) vive na própria
        // view-home, que já nasce ativa no boot sem passar por navigate() —
        // diferente do banner acima, precisa ser avaliada aqui, assim que
        // hacData.projectOrigin (se já salvo) está disponível, senão a Home
        // mostraria a pergunta por uma fração de segundo mesmo em arquivo
        // já configurado.
        if (typeof _renderA11yHomeOriginPicker === 'function') _renderA11yHomeOriginPicker();

        return;
      }

      if (msg.type === 'toast') {
        showToast(msg.message);
      }

      // Resposta de check-other-designers-sections (2026-09-10), disparada
      // logo após a confirmação de origem (ver ensureA11yProjectOriginThen,
      // accessibility.js) — só abre o modal informativo se a varredura
      // encontrou handoff de outro designer; lista vazia não faz nada,
      // fluxo segue normal sem interrupção visual.
      if (msg.type === 'other-designers-sections-checked') {
        const otherSections = msg.otherDesignersSections || [];
        if (otherSections.length > 0 && typeof openA11yOtherDesignerModal === 'function') {
          openA11yOtherDesignerModal(otherSections);
        }
      }

      // Resposta de check-my-prior-session (2026-09-10), disparada no mesmo
      // momento que check-other-designers-sections — avisa o designer que ELE
      // MESMO já documentou telas neste arquivo antes (reabertura, troca de
      // máquina/sessão). priorSession null não faz nada, fluxo segue normal.
      if (msg.type === 'my-prior-session-checked') {
        if (msg.priorSession && typeof renderA11yPriorSessionAlert === 'function') {
          renderA11yPriorSessionAlert(msg.priorSession);
        }
      }

      // Página dedicada do handoff pronta (2026-09-22) — resposta de
      // 'ensure-hac-page', disparado ao escolher a lib. O designer já foi
      // levado até a página pelo backend; aqui só abre a instrução de
      // Ctrl+C/Ctrl+V. A própria função decide se deve abrir (página nova
      // ou vazia) ou ficar quieta.
      if (msg.type === 'hac-page-ready') {
        if (typeof _openHacPageInstructionModal === 'function') {
          _openHacPageInstructionModal(msg);
        }
        return;
      }

      if (msg.type === 'cache-cleared') {
        // Esconde o loading disparado por clearPluginCache (core.js,
        // 2026-09-24) — mesmo par showA11yCanvasLoading/hideA11yCanvasLoading
        // já usado noutras ações assíncronas do plugin.
        if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
        // msg.failed (2026-09-24): o backend não conseguiu completar a
        // limpeza (erro já mostrado via figma.notify nativo, fora do
        // iframe) — não resetar hacData local aqui, porque não dá pra saber
        // se a limpeza foi parcial. Só sai, com o loading já escondido.
        if (msg.failed) return;
        hacData = {
          _schemaVersion: 1,
          a11yAreas: [],
          a11ySpecs: [],
          tabOrderItems: [],
          a11ySwipePaths: [],
          currentUser: hacData.currentUser,
          // projectOrigin NÃO é preservado (decisão revisada): "Limpar Cache"
          // deve resetar o projeto ao estado zero, incluindo a plataforma
          // declarada do arquivo — o designer volta a responder Web/Mobile
          // na próxima ação. Omitido aqui de propósito; o default de
          // core.js prevalece. Diferente de currentUser, que continua
          // preservado por ser configuração de ambiente, não do projeto.
          // activeSectionName (2026-09-03) segue o mesmo raciocínio: também
          // omitido de propósito, volta a null — a próxima Área Marcada
          // depois de "Limpar Cache" nasce na Section fixa original, não
          // numa versionada que o designer possa ter escolhido antes.
          //
          // a11yLeitorInstructionSeen (2026-09-16-c) é explicitado como
          // false (em vez de omitido) — "Limpar Cache" reseta o projeto ao
          // estado zero, então a modal de instrução do Leitor de Tela deve
          // voltar a aparecer na próxima "+ Nova spec", mesmo comportamento
          // de um arquivo nunca usado.
          a11yLeitorInstructionSeen: false
        };
        a11yAreas = [];
        a11ySpecs = [];
        tabOrderItems = [];
        if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
        showToast('Cache limpo. Plugin reiniciado.');
        return;
      }

      // Resposta de "Limpeza completa" (clear-canvas-and-cache,
      // 2026-09-22) — mesmo reset de estado de 'cache-cleared' acima
      // (dado zerado), mais o resultado da remoção de nós no canvas
      // (_clearHacCanvasForCurrentUser, code.js). `blocked: true` (sem
      // figma.currentUser.id disponível) significa que o dado foi limpo
      // mas os nós do canvas NÃO foram tocados — avisar o designer em vez
      // de deixar parecer que a limpeza foi completa.
      if (msg.type === 'canvas-and-cache-cleared') {
        // Esconde o loading disparado por clearPluginCanvasAndCache
        // (core.js, 2026-09-24) — mesmo par de sempre.
        if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
        // msg.failed (2026-09-24) — mesmo raciocínio de 'cache-cleared'
        // acima: erro real no backend, não resetar hacData local sem saber
        // o estado verdadeiro do dado/canvas.
        if (msg.failed) return;
        hacData = {
          _schemaVersion: 1,
          a11yAreas: [],
          a11ySpecs: [],
          tabOrderItems: [],
          a11ySwipePaths: [],
          currentUser: hacData.currentUser,
          a11yLeitorInstructionSeen: false
        };
        a11yAreas = [];
        a11ySpecs = [];
        tabOrderItems = [];
        if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
        if (msg.blocked) {
          showToast('Cache limpo, mas não foi possível identificar seu usuário — os itens no canvas não foram removidos.');
        } else if (msg.removed > 0) {
          showToast('Handoff removido do canvas e cache limpo. Plugin reiniciado.');
        } else {
          showToast('Cache limpo. Nenhum item seu foi encontrado no canvas.');
        }
        return;
      }

      // Resposta do scan enriquecido disparado pela Detecção Automática
      // (accessibility.js: runA11yPostAreaDetection). code.js ecoa
      // origin: 'a11y-detection' de volta em scan-result — sem isso não dá
      // pra distinguir essa resposta de um scan comum.
      if (msg.type === "scan-result") {
        _refreshIcons();

        const _isA11yDetectionScan = msg.origin === 'a11y-detection';
        if (!_isA11yDetectionScan) return;

        if (msg.error) {
          if (typeof closeA11yPostAreaDetectModal === 'function') closeA11yPostAreaDetectModal();
          if (typeof showToast === 'function') showToast(msg.error);
          return;
        }

        const detections = typeof _collectA11yDetections === 'function' ? _collectA11yDetections(msg.data) : [];
        const tokenReviewCandidates = typeof _collectA11yTokenReviewCandidates === 'function'
          ? _collectA11yTokenReviewCandidates(msg.data) : [];
        if (typeof handleA11yPostAreaDetectionResult === 'function') {
          handleA11yPostAreaDetectionResult(detections, tokenReviewCandidates);
        }
        saveToStorage();
        return;
      }

      // Toda spec criada no hac É uma spec de acessibilidade — não existe
      // spec normal nem o discriminador a11yType do Handex. Specs de A11y
      // nascem BLOQUEADAS (o marcador/agrupamento já é calculado pra
      // contornar o elemento certo, não faz sentido reposicionar
      // manualmente); um cadeado na listagem destrava se precisar mexer.
      if (msg.type === "spec-created") {
        // Loading de canvas do fluxo manual (confirmA11ySpec, else branch,
        // accessibility.js) — o wizard já esconde o dele próprio em
        // _advanceA11yBatchWizard/hideA11yWizardSavingIndicator, então isto
        // só tem efeito quando a criação veio do caminho manual (fora do
        // wizard) ou é redundante e inofensivo quando veio do wizard (o
        // mesmo modal já estará fechado).
        if (window._a11yManualSpecLoadingTimeout) { clearTimeout(window._a11yManualSpecLoadingTimeout); window._a11yManualSpecLoadingTimeout = null; }
        if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
        const newSpec = Object.assign({ pendingConfirmation: false, locked: true }, msg.spec || msg.data);
        // workAnchor (2026-09-21) — só vem preenchido quando esta chamada
        // criou o clone de trabalho da área PELA 1ª VEZ, ver comentário
        // completo em create-unified-spec/onmessage.js. _saveA11yAreaWorkAnchor
        // é idempotente e nunca sobrescreve um valor já salvo.
        if (msg.workAnchor && typeof _saveA11yAreaWorkAnchor === 'function' && newSpec.a11yAreaId) {
          _saveA11yAreaWorkAnchor(newSpec.a11yAreaId, msg.workAnchor);
        }

        // Edição de spec (delete+recreate, ver confirmA11ySpec em
        // accessibility.js): reinsere no índice original em vez de só
        // empilhar no fim — a ordenação visual por letra é estável, então
        // duas specs com a mesma letra desempatam pela ordem no array.
        const _a11yReinsertAt = window._a11yEditingReinsertIndex;
        window._a11yEditingReinsertIndex = undefined;
        if (_a11yReinsertAt !== undefined && _a11yReinsertAt <= a11ySpecs.length) {
          a11ySpecs.splice(_a11yReinsertAt, 0, newSpec);
        } else {
          a11ySpecs.push(newSpec);
        }

        if (typeof renderA11ySpecsList === 'function') renderA11ySpecsList();
        else if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
        saveToStorage();
        if (window._toastSaved) _toastSaved();

        // Wizard de revisão individual da Detecção Automática
        // (accessibility.js, confirmA11ySpec + _createA11ySpecAndWait):
        // resolve a Promise pendente da confirmação atual — serializa a
        // criação (evita duas em paralelo) e deixa confirmA11ySpec avançar
        // pro próximo item da fila (_advanceA11yBatchWizard) só depois da
        // resposta real do backend. O toast por item é suprimido (silent:
        // true no payload) — o wizard mostra um único toast agregado no
        // final, com a contagem real de confirmados/descartados.
        if (typeof window._a11yBatchCreateResolve === 'function') {
          const resolve = window._a11yBatchCreateResolve;
          window._a11yBatchCreateResolve = null;
          resolve(true);
          return;
        }
        showToast('Especificação criada e posicionada, travada por padrão. Use o cadeado pra ajustar.');
      }

      if (msg.type === "selection-name") {
        // msg.mainText: code.js ecoa _findMainTextContent em get-selection-name.
        // msg.dscComponentName: nome cru do component set DSC (containingFrame)
        // resolvido via _getDscComponentKeyToFrameMap quando o nó selecionado é
        // uma INSTANCE remota reconhecida — null quando não há match.
        // msg.id (2026-09-04-ae): id do nó selecionado, usado pra checar spec
        // duplicada em prefillA11yComponentName.
        if (typeof prefillA11yComponentName === 'function') prefillA11yComponentName(msg.name, msg.mainText, msg.dscComponentName, msg.id);
      }

      // Resposta de 'get-a11y-selection-info' — resolve o Promise pendente
      // aberto por _getA11ySelectionInfo() (accessibility.js), usado tanto
      // para confirmar uma spec de A11y (mapeamento puro) quanto para
      // "Marcar Área".
      if (msg.type === "a11y-selection-info") {
        if (typeof window._a11ySelectionInfoResolve === 'function') {
          const resolve = window._a11ySelectionInfoResolve;
          window._a11ySelectionInfoResolve = null;
          resolve(msg.id ? { id: msg.id, name: msg.name } : null);
        }
      }

      // Dispatch de 'a11y-documentation-status' removido em 2026-09-04-k
      // junto com o aviso "Continuar/Iniciar nova Section" — ver
      // accessibility.js, openA11yAreaModal.

      if (msg.type === "a11y-area-created") {
        const area = msg.area;
        if (area) {
          a11yAreas.push(area);
          // Área recém-marcada abre expandida — designer já vê o botão "+" pra
          // criar a primeira spec nela sem precisar procurar o accordion certo.
          window._a11yExpandedAreaIds = window._a11yExpandedAreaIds || new Set();
          window._a11yExpandedAreaIds.add(area.id);
          if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
          saveToStorage();
          if (window._toastSaved) _toastSaved();
          // Marcar Área não dispara mais detecção automaticamente
          // (2026-09-04-g) — `autoDetect` deixou de ser enviado por
          // confirmA11yArea, então `area.autoDetect` nunca é truthy aqui;
          // o Mapeamento Automático agora é uma ação dentro da tab Leitor
          // de Tela (_startA11yMappingFromLeitorTab, accessibility.js).
          // Guarda mantida por retrocompatibilidade: hacData salvo antes
          // desta versão pode, em teoria, ter uma área com o campo antigo
          // ainda marcado (nunca vai acontecer na prática, já que o campo
          // só existia no momento de criação e nunca foi persistido em
          // hacData além disso — mantido só como defesa inofensiva).
          if (area.autoDetect && typeof openA11yPostAreaDetectModal === 'function') {
            openA11yPostAreaDetectModal(area);
          }
        }
      }

      // Resposta de update-a11y-area-conector (2026-09-04-l, "Editar
      // conector" no dropdown do card) — area.id NUNCA muda (o backend
      // edita o conteúdo do grupo existente, não recria), então basta
      // atualizar o campo conector da área já presente no array.
      if (msg.type === "a11y-area-conector-updated") {
        const area = (a11yAreas || []).find(a => a && a.id === msg.areaId);
        if (area) {
          area.conector = msg.conector;
          saveToStorage();
          if (window._toastSaved) _toastSaved();
        }
        if (typeof handleA11yAreaConectorUpdated === 'function') handleA11yAreaConectorUpdated(msg);
      }
      if (msg.type === "a11y-area-conector-update-failed") {
        if (typeof showToast === 'function') showToast(msg.reason || 'Não foi possível atualizar o conector.', 'error');
      }

      // ── Ordem de Tabulação ──────────────────────────────────────────
      // Depende de handlers 'start-tab-order-mode'/'get-tab-order-accumulated-selection'/
      // 'generate-tab-order-from-layers'/'draw-tab-order-badge'/
      // 'renumber-tab-order-items'/'delete-node' em code.js. Modelo de
      // ACUMULAÇÃO SILENCIOSA (2026-09-04-aa): durante a captura, o backend
      // NUNCA posta uma seleção isolada — só a contagem ao vivo
      // (tab-order-accumulated-count-changed) e, sob demanda ("Concluir
      // seleção"/"+ Adicionar item"), o resultado completo já resolvido
      // (tab-order-accumulated-selection-result). O selo real só nasce em
      // lote, ao confirmar "Criar ordem de tabulação" (applyTabOrderToCanvas).
      if (msg.type === "tab-order-accumulated-count-changed") {
        if (typeof handleTabOrderAccumulatedCountChanged === 'function') {
          handleTabOrderAccumulatedCountChanged(msg.count);
        }
      }
      if (msg.type === "tab-order-accumulated-selection-result") {
        if (typeof handleTabOrderAccumulatedSelectionResult === 'function') {
          handleTabOrderAccumulatedSelectionResult(msg.points);
        }
      }

      // Resposta de 'start-tab-order-copy' (code.js): a cópia rascunho do
      // frame já foi criada (sem selos ainda) e o mapa original→clone já foi
      // calculado no backend. handleTabOrderCopyStarted só guarda o
      // id/mapa localmente.
      if (msg.type === "tab-order-copy-started") {
        if (typeof handleTabOrderCopyStarted === 'function') {
          handleTabOrderCopyStarted(msg.cloneId, msg.nodeMap);
        }
      }
      // Resposta de start-swipe-path-mode (2026-09-04-ac) — a Trilha de
      // Swipe agora também clona o frame da Área antes de ligar a escuta,
      // mesmo padrão de tab-order-copy-started acima.
      if (msg.type === "swipe-path-copy-started") {
        if (typeof handleSwipePathCopyStarted === 'function') {
          handleSwipePathCopyStarted(msg.cloneId);
        }
      }
      // Resposta de start-spec-copy (2026-09-15). Dois consumidores possíveis,
      // mutuamente exclusivos por construção (só um dos dois é setado antes
      // de disparar 'start-spec-copy' em cada fluxo):
      //   1) Wizard de Detecção Automática (startA11yBatchWizard,
      //      accessibility.js) — window._a11yBatchWizardCopyPendingAreaId.
      //      Bug real corrigido (2026-09-16): até então esta resposta era
      //      IGNORADA aqui ("dispara e ignora"), então o wizard abria o
      //      primeiro item ANTES da réplica terminar de ser clonada, sem
      //      nenhum loading cobrindo essa espera (o modal "Detectando
      //      componentes…" já tinha fechado ao fim do scan, corretamente,
      //      mas nada reabria pra esta etapa seguinte). Agora fecha o
      //      loading e só então abre o primeiro item do wizard.
      //   2) Fluxo manual "+ Nova spec" (openA11yCategoryPickerModal) —
      //      window._a11ySpecCopyPendingFocusAreaId — precisa FOCAR a
      //      réplica assim que ela fica pronta.
      if (msg.type === "spec-copy-started") {
        // workAnchor (2026-09-21) — ver comentário completo em spec-created
        // acima.
        if (msg.workAnchor && typeof _saveA11yAreaWorkAnchor === 'function' && msg.areaId) {
          _saveA11yAreaWorkAnchor(msg.areaId, msg.workAnchor);
        }
        const _wizardPendingAreaId = window._a11yBatchWizardCopyPendingAreaId;
        if (_wizardPendingAreaId && msg.areaId === _wizardPendingAreaId) {
          window._a11yBatchWizardCopyPendingAreaId = null;
          if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
          if (typeof _advanceA11yBatchWizard === 'function') _advanceA11yBatchWizard();
        }

        const _pendingAreaId = window._a11ySpecCopyPendingFocusAreaId;
        if (_pendingAreaId && msg.areaId === _pendingAreaId) {
          window._a11ySpecCopyPendingFocusAreaId = null;
          // Fecha o loading aberto por openA11yCategoryPickerModal
          // (accessibility.js) — a réplica está pronta (ou falhou, e aí o
          // fallback abaixo cuida do foco). Nunca deixar o overlay preso.
          if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
          // fallbackTargetNodeId vai null de propósito: ele só serve pro
          // backend focar o Frame Principal quando a réplica NÃO existe, e
          // neste ponto ela acabou de ser criada/reusada com sucesso
          // (cloneId não-nulo). Passar o original aqui reintroduziria
          // justamente o foco errado que esta mudança corrige.
          if (typeof focusA11yCloneNode === 'function') {
            // cloneId nulo = a réplica não pôde ser criada (área sem node
            // resolvível, frame apagado). Aí vale focar o que houver: sem
            // fallback o designer ficaria sem referência nenhuma no canvas.
            const _area = (!msg.cloneId && typeof _findA11yAreaById === 'function')
              ? _findA11yAreaById(_pendingAreaId) : null;
            focusA11yCloneNode(_pendingAreaId, 'leitor', (_area && _area.targetNodeId) || null);
          }
        }
      }
      // Resposta de resolve-a11y-focus-node (2026-09-11) — o backend
      // resolveu qual node focar (réplica de trabalho da etapa, ou o Frame
      // Principal como fallback) e devolveu o id pra este lado chamar
      // focusNode de fato (highlight-node já existente, testado).
      if (msg.type === "a11y-focus-node-resolved") {
        if (msg.nodeId && typeof focusNode === 'function') {
          focusNode(msg.nodeId);
        }
      }
      // Resposta de resolve-tab-order-clone (2026-09-04-aj) — "Adicionar
      // itens" numa área já documentada só arma a captura de clique depois
      // de confirmar que a cópia clonada existente foi reconhecida/
      // reaproveitada, nunca recriada do zero por engano.
      if (msg.type === "tab-order-clone-resolved") {
        if (typeof handleTabOrderCloneResolved === 'function') {
          handleTabOrderCloneResolved(msg.areaId, msg.ok);
        }
      }
      // Resposta de resolve-swipe-path-clone (2026-09-09, feature "editar
      // trilha já criada") — mesmo espírito de tab-order-clone-resolved:
      // "+ Adicionar ponto" numa trilha já em edição só arma a captura de
      // clique depois de confirmar que a cópia clonada existente foi
      // reconhecida/reaproveitada, nunca recriada do zero.
      if (msg.type === "swipe-path-clone-resolved") {
        if (typeof handleSwipePathCloneResolved === 'function') {
          handleSwipePathCloneResolved(msg.areaId, msg.ok);
        }
      }

      // Geração automática por varredura de camadas (generate-tab-order-
      // from-layers em code.js) — responde com os CANDIDATOS
      // ({nodeId, nodeName}[], já ordenados espacialmente, nunca itens já
      // desenhados) e também cloneId/nodeMap: o backend já criou e focou a
      // cópia da área antes de varrer, mesmo padrão do fluxo manual
      // (tab-order-copy-started). addTabOrderItemsFromLayers popula a lista
      // pendente, guarda a cópia ativa e abre o modal de revisão.
      if (msg.type === "tab-order-generated-from-layers") {
        if (typeof addTabOrderItemsFromLayers === 'function') {
          addTabOrderItemsFromLayers(msg.items, msg.cloneId, msg.nodeMap, msg.generation);
        }
      }

      // Espelha tab-order-generated-from-layers acima, mas para o
      // Mapeamento Automático PRÓPRIO da Trilha de Swipe (generate-swipe-
      // path-from-layers, onmessage.js — reimplementado 2026-09-18). items
      // já vem com nodeId ORIGINAL (backend traduz clone→original antes de
      // enviar); addSwipePathItemsFromLayers popula a lista pendente e
      // dispara o desenho da trilha.
      if (msg.type === "swipe-path-generated-from-layers") {
        if (typeof addSwipePathItemsFromLayers === 'function') {
          addSwipePathItemsFromLayers(msg.items, msg.cloneId, msg.nodeMap, msg.generation);
        }
      }

      // Resposta de 'draw-tab-order-badge' (code.js) — o selo real do item
      // recém-adicionado à lista pendente já foi desenhado na cópia; guarda
      // o id real (canvasId) no item pendente correspondente (por tempId).
      if (msg.type === "tab-order-badge-drawn") {
        if (typeof handleTabOrderBadgeDrawn === 'function') {
          handleTabOrderBadgeDrawn(msg.tempId, msg.canvasId, msg.item);
        }
      }
      if (msg.type === "tab-order-badge-draw-failed") {
        if (typeof handleTabOrderBadgeDrawFailed === 'function') {
          handleTabOrderBadgeDrawFailed(msg.tempId);
        }
      }

      // Confirmação de renumber-tab-order-items — os números já foram
      // atualizados otimisticamente no front; esta resposta só existe para
      // eventuais diagnósticos, sem ação adicional.
      if (msg.type === "tab-order-renumbered") {
        // no-op
      }

      // Resposta de resolve-tab-order-narration (2026-09-09) — o tipo de
      // cada parada (matching DSC→a11y contra o node ORIGINAL) só existe
      // recalculado ao vivo no backend; o front guarda a fila e conduz a
      // narração por voz (Web Speech API) a partir daqui.
      if (msg.type === "tab-order-narration-resolved") {
        if (typeof _handleTabOrderNarrationResolved === 'function') {
          _handleTabOrderNarrationResolved(msg.areaId, msg.items);
        }
      }

      // ── Trilha de Swipe ──────────────────────────────────────────────
      // Modelo de ACUMULAÇÃO SILENCIOSA (2026-09-04-aa, mesmo modelo de
      // Ordem de Tabulação acima): nenhum desenho acontece por clique, e
      // durante a captura o backend não posta nenhuma seleção isolada — só
      // a contagem ao vivo e, sob demanda ("Concluir seleção"), o
      // resultado completo já resolvido/ordenado. A trilha real só é
      // desenhada de uma vez, ao confirmar "Criar trilha de swipe"
      // (applySwipePathToCanvas → insert-swipe-path).
      if (msg.type === "swipe-path-accumulated-count-changed") {
        if (typeof handleSwipePathAccumulatedCountChanged === 'function') {
          handleSwipePathAccumulatedCountChanged(msg.count);
        }
      }
      if (msg.type === "swipe-path-accumulated-selection-result") {
        if (typeof handleSwipePathAccumulatedSelectionResult === 'function') {
          handleSwipePathAccumulatedSelectionResult(msg.points);
        }
      }
      // Resposta de 'insert-swipe-path' (code.js) — a trilha completa foi
      // desenhada no canvas numa única operação.
      if (msg.type === "swipe-path-created") {
        if (typeof handleSwipePathCreated === 'function') {
          handleSwipePathCreated(msg);
        }
      }
      if (msg.type === "swipe-path-create-failed") {
        if (typeof handleSwipePathCreateFailed === 'function') {
          handleSwipePathCreateFailed(msg);
        }
      }
      // Resposta da cascata de exclusão de área (cleanup-swipe-path-for-area,
      // code.js) — a área excluída era a "dona" da trilha (no máximo 1 por
      // área, então não há lista de afetados como na v2 anterior).
      if (msg.type === "swipe-path-cleaned-up") {
        if (typeof handleSwipePathCleanedUp === 'function') {
          handleSwipePathCleanedUp(msg);
        }
      }

      // ── Ficha de Handoff (handoff-ficha.js) ──────────────────────────
      // Resposta de insert-ficha-section (code.js) — mesmo padrão de
      // dispatch acima.
      if (msg.type === "ficha-section-inserted") {
        if (typeof _fichaHandleSectionInserted === 'function') {
          _fichaHandleSectionInserted(msg);
        }
      }
      if (msg.type === "ficha-section-insert-failed") {
        if (typeof _fichaHandleSectionInsertFailed === 'function') {
          _fichaHandleSectionInsertFailed(msg);
        }
      }
      // Resposta de bump-a11y-session-version (onmessage.js) — modelo
      // revisado em 2026-09-24: 'minor' agora é sempre no-op no backend
      // (version sempre null nesse kind — não existe mais número visível
      // pra entrega do dia a dia), então esta condição já cobre os dois
      // motivos de não mostrar nada (falha no backend OU minor por design).
      // Só MAJOR (Finalizar) tem retorno visível — decisão explícita do
      // designer, e a única que de fato consolida uma versão real agora.
      if (msg.type === "a11y-session-version-bumped") {
        if (msg.kind === 'major' && msg.version) {
          showToast(`Handoff finalizado: v${msg.version}.`);
        }
      }
      // Resposta de prepare-ficha-section-edit (code.js) — mesmo padrão de
      // dispatch acima (2026-09-11, consolidação Section/Ficha).
      if (msg.type === "ficha-section-edit-ready") {
        if (typeof _fichaHandleSectionEditReady === 'function') {
          _fichaHandleSectionEditReady(msg);
        }
      }
      if (msg.type === "ficha-section-edit-failed") {
        if (typeof _fichaHandleSectionEditFailed === 'function') {
          _fichaHandleSectionEditFailed(msg);
        }
      }
      // Resposta de highlight-ficha-node quando o frame não é mais
      // encontrado no canvas (ex.: apagado manualmente) — sem isto, "Ver
      // ficha no canvas" falha em silêncio (achado real de QA, 2026-09-04).
      if (msg.type === "ficha-node-not-found") {
        if (typeof _fichaHandleNodeNotFound === 'function') {
          _fichaHandleNodeNotFound(msg);
        }
      }

      // O popover de categoria vira o modal #a11y-category-picker-modal
      // (accessibility.js). A checagem de vínculo da lib continua rodando
      // antes de abrir esse modal.
      if (msg.type === "a11y-library-status") {
        // Ignora respostas atrasadas de uma checagem que não é mais a mais
        // recente (designer clicou "+" em outra área antes desta responder)
        // — sem isso, uma resposta velha podia reabrir o seletor de
        // categoria por cima de um formulário que já estava sendo preenchido.
        if (msg.token && window._a11yLibCheckToken && msg.token !== window._a11yLibCheckToken) {
          // não faz nada
        } else if (msg.linked) {
          const specModal = document.getElementById('a11y-spec-modal');
          const alreadyFillingForm = specModal && !specModal.classList.contains('hidden');
          if (!alreadyFillingForm) {
            closeModal('a11y-library-required-modal');
            // Quando a checagem de vínculo foi disparada a partir de um item
            // da lista de pendentes (ver openA11yFormFromUndocumented,
            // accessibility.js), o destino não é o seletor de categoria e
            // sim o formulário já com categoria/subtipo/nó definidos.
            // window._a11yLibCheckOnSuccess carrega esse callback só nessa
            // origem; qualquer outro caminho (botão "+" normal) não seta a
            // variável e cai no fluxo de sempre.
            if (typeof window._a11yLibCheckOnSuccess === 'function') {
              const cb = window._a11yLibCheckOnSuccess;
              window._a11yLibCheckOnSuccess = null;
              cb();
            } else if (typeof _openA11yCategoryPickerModalNow === 'function') {
              _openA11yCategoryPickerModalNow();
            }
          }
        } else {
          window._a11yLibCheckOnSuccess = null; // não deixa um callback de tentativa anterior "vazar" pra próxima checagem bem-sucedida
          openModal('a11y-library-required-modal');
        }
      }

      // Resposta de resolve-manual-spec-match (2026-09-11, Parte 2 do gate de
      // seleção) — disparada por openA11yCategoryPickerModal junto com
      // check-a11y-library, em paralelo, sem ordem garantida entre as duas.
      // Ignora respostas de um pedido que não é mais o mais recente (mesmo
      // padrão de token de check-a11y-library acima) — o designer pode ter
      // clicado "+" de novo, ou trocado a seleção, antes desta responder.
      if (msg.type === 'manual-spec-match-resolved') {
        if (msg.token && window._a11yManualMatchToken && msg.token !== window._a11yManualMatchToken) {
          // resposta obsoleta, ignora
        } else {
          window._a11yManualMatchResult = { nodeId: msg.nodeId, nodeName: msg.nodeName, match: msg.match };
          // Só tem efeito visual se o picker já estiver aberto — se a
          // resposta chegar antes de check-a11y-library confirmar o vínculo,
          // _openA11yCategoryPickerModalNow (accessibility.js) reaplica o
          // realce assim que o picker de fato abrir.
          const pickerModal = document.getElementById('a11y-category-picker-modal');
          const pickerOpen = pickerModal && !pickerModal.classList.contains('hidden');
          if (pickerOpen && typeof _applyA11yManualMatchToPicker === 'function') {
            _applyA11yManualMatchToPicker();
          }
        }
      }

      // Resposta de resolve-layer-order (code.js), disparada por
      // _a11yQueueLayerOrderResolution (accessibility.js). Só mescla no
      // cache em memória (escopado por área) e re-renderiza a listagem
      // agrupada; sem persistência em hacData/storage.
      if (msg.type === 'layer-order-resolved') {
        window._a11yLayerOrderCache = window._a11yLayerOrderCache || {};
        const areaId = msg.areaId;
        if (areaId) {
          window._a11yLayerOrderCache[areaId] = Object.assign(
            window._a11yLayerOrderCache[areaId] || {},
            msg.order || {}
          );
          // Libera o guard de requisição em voo desta área
          // (_a11yQueueLayerOrderResolution, accessibility.js) — precisa
          // rodar ANTES do render abaixo, senão um id que continue faltando
          // nunca mais seria pedido. Com o backend marcando os não
          // encontrados como null, o render seguinte não repede nada e o
          // ciclo termina aqui.
          if (window._a11yLayerOrderInFlight) window._a11yLayerOrderInFlight[areaId] = false;
        }
        if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
      }
    };
