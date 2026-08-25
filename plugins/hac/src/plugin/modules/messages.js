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
        const badge = document.getElementById('version-badge');
        if (badge) badge.textContent = 'v' + msg.version;

        // Armazena o usuário Figma identificado automaticamente (sem login)
        if (msg.currentUser) {
          hacData.currentUser = msg.currentUser;
          const userSlot = document.getElementById('header-user-slot');
          if (userSlot) {
            const u = msg.currentUser;
            const avatarHtml = u.photoUrl
              ? `<img src="${u.photoUrl}" alt="${u.name}" class="w-5 h-5 rounded-full object-cover border border-slate-200 dark:border-dark-line" />`
              : `<span class="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold">${u.name.charAt(0).toUpperCase()}</span>`;
            userSlot.innerHTML = `
              <div class="flex items-center gap-1.5" title="${u.name}">
                ${avatarHtml}
                <span class="text-[10px] font-medium text-slate-500 dark:text-dark-muted max-w-[80px] truncate">${u.name.split(' ')[0]}</span>
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
          tabOrderItems = hacData.tabOrderItems || [];
          if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
        }

        // O banner só é avaliado quando o usuário de fato navega para
        // view-specifications (ver navigate() em core.js) — não no boot,
        // que sempre abre em view-home.
        if (typeof setOnboardingSeenState === 'function') setOnboardingSeenState(msg.onboardingSeen);

        return;
      }

      if (msg.type === 'toast') {
        showToast(msg.message);
      }

      if (msg.type === 'cache-cleared') {
        hacData = {
          _schemaVersion: 1,
          a11yAreas: [],
          a11ySpecs: [],
          tabOrderItems: [],
          currentUser: hacData.currentUser
        };
        a11yAreas = [];
        a11ySpecs = [];
        tabOrderItems = [];
        if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
        showToast('Cache limpo. Plugin reiniciado.');
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
        const newSpec = Object.assign({ pendingConfirmation: false, locked: true }, msg.spec || msg.data);

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

        // Lote "Gerar Handoff Automatizado" (accessibility.js,
        // _createA11ySpecAndWait/confirmA11yBatchGenerate): resolve a Promise
        // pendente da chamada atual (serializa a próxima create-unified-spec)
        // e suprime o toast por item — o lote mostra um único toast agregado
        // no final, com a contagem real de sucesso/falha.
        if (typeof window._a11yBatchCreateResolve === 'function') {
          const resolve = window._a11yBatchCreateResolve;
          window._a11yBatchCreateResolve = null;
          resolve(true);
          return;
        }
        showToast('Especificação criada e posicionada — travada por padrão, use o cadeado pra ajustar.');
      }

      if (msg.type === "spec-locked") {
        let found = false;
        a11ySpecs.forEach(spec => {
          if (spec && spec.id === msg.specId) {
            spec.pendingConfirmation = false;
            found = true;
          }
        });
        if (found) {
          if (typeof renderA11ySpecsList === 'function') renderA11ySpecsList();
          saveToStorage();
        }
      }

      if (msg.type === 'spec-connector-edited') {
        const spec = a11ySpecs.find(s => s.id === msg.specId);
        if (spec) {
          spec.connectorStyle = msg.connectorStyle;
          spec.connectorCurvature = msg.connectorCurvature;
        }
        saveToStorage();
        if (typeof closeEditSpecConnectorModal === 'function') closeEditSpecConnectorModal();
        showToast('Linha da especificação atualizada');
        return;
      }

      if (msg.type === 'spec-connector-edit-failed') {
        window._editingSpecConnectorIndex = null;
        showToast('Não foi possível editar a linha — elemento vinculado não encontrado no canvas.', 'error');
        return;
      }

      if (msg.type === "selection-name") {
        // msg.mainText: code.js ecoa _findMainTextContent em get-selection-name.
        if (typeof prefillA11yComponentName === 'function') prefillA11yComponentName(msg.name, msg.mainText);
      }

      if (msg.type === "node-main-text") {
        if (typeof prefillA11yLabelFromMainText === 'function') prefillA11yLabelFromMainText(msg.mainText);
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
          // A escolha Automático/Manual é feita no próprio modal "Marcar
          // Área" (campo autoDetect, ecoado pelo backend em
          // create-a11y-area). Só dispara a detecção (abre modal + varre,
          // sem pergunta intermediária) se o designer escolheu Automático;
          // em Manual a área já foi criada/expandida/renderizada acima.
          if (area.autoDetect && typeof openA11yPostAreaDetectModal === 'function') {
            openA11yPostAreaDetectModal(area);
          }
        }
      }

      // ── Ordem de Tabulação ──────────────────────────────────────────
      // Depende de handlers 'start-tab-order-mode'/'generate-tab-order-from-layers'/
      // 'apply-tab-order-to-canvas'/'renumber-tab-order-items' em code.js, e
      // handleTabOrderSelectionChanged/addTabOrderItem/addTabOrderItemsFromLayers/
      // handleTabOrderAppliedToCanvas em accessibility.js.
      if (msg.type === "tab-order-selection-changed") {
        if (typeof handleTabOrderSelectionChanged === 'function') {
          handleTabOrderSelectionChanged(msg.nodeId, msg.nodeName);
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

      // Geração automática por varredura de camadas (generate-tab-order-
      // from-layers em code.js) — responde só com os CANDIDATOS
      // ({nodeId, nodeName}[], já ordenados espacialmente), nunca itens já
      // desenhados. addTabOrderItemsFromLayers popula a lista pendente e
      // abre o modal de revisão.
      if (msg.type === "tab-order-generated-from-layers") {
        if (typeof addTabOrderItemsFromLayers === 'function') addTabOrderItemsFromLayers(msg.items);
      }

      // Resposta de 'apply-tab-order-to-canvas' (code.js): a cópia do frame
      // já foi criada e os selos já foram desenhados nela; os itens vêm com
      // id real (grupo do selo, na cópia) prontos pro mesmo tratamento de
      // addTabOrderItem que os fluxos antigos já usavam.
      if (msg.type === "tab-order-applied-to-canvas") {
        if (typeof handleTabOrderAppliedToCanvas === 'function') {
          handleTabOrderAppliedToCanvas(msg.items, msg.copyName);
        }
      }

      // Confirmação de renumber-tab-order-items — os números já foram
      // atualizados otimisticamente no front (deleteTabOrderItem); esta
      // resposta só existe para eventuais diagnósticos, sem ação adicional.
      if (msg.type === "tab-order-renumbered") {
        // no-op
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
        }
        if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
      }
    };
