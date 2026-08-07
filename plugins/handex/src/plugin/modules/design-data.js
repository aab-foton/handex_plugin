// ============================================================
// design-data.js — import/export de progresso (JSON do handoff)
//
// Inclui:
//   - exportHandoffData / importHandoffData — backup full do estado
//   - exportProgress — backup leve (sem specs pesadas)
//   - exportDesignData — pede ao backend Figma para exportar (CSV/JSON design data)
//   - _buildAiContext — agregador oculto de contexto compacto (ver nota abaixo)
//
// Depende de: handoffData, createdSpecs, saveToStorage, restoreUIFromState,
// startHandoff, incrementVersion
// ============================================================

    // _buildAiContext — FEATURE OCULTA (2026-08), sem UI/botão visível ainda.
    // Objetivo: material de apoio para colar como contexto/attachment em
    // ferramentas externas de geração (Figma Make, ou equivalentes) ao criar
    // uma tela nova dentro do MESMO projeto — nunca integração automática
    // (não existe canal de API para isso hoje) nem geração feita pelo
    // próprio Handex. Escopo deliberadamente contido a UM projeto (o que já
    // foi documentado aqui), não conhecimento institucional agregado entre
    // projetos — ver decisão registrada em docs/figma-api-roadmap-2026.md
    // (item 4b) sobre por que ir além disso extrapola o papel do produto
    // ("documentar o que já foi decidido", não gerar o que ainda não foi).
    // Calculado sob demanda a partir de handoffData/createdSpecs -- nunca
    // persistido dentro do próprio handoffData (dado derivado, não estado).
    function _buildAiContext() {
      const frames = handoffData.frames || [];
      const looseSpecs = (handoffData.specs || []);
      const allSpecs = frames.flatMap(f => f.createdSpecs || []).concat(looseSpecs);

      const briefing = {
        titulo: handoffData.step1?.titulo || '',
        objetivo: handoffData.step1?.objetivo || '',
        jornada: handoffData.step1?.jornada || '',
        feature: handoffData.step1?.feature || '',
        perguntasRespondidas: (handoffData.step2?.briefingQuestions || [])
          .filter(q => (q.answer || '').trim())
          .map(q => ({ categoria: q.category || '', pergunta: q.question || '', resposta: q.answer })),
        regrasDeNegocio: (handoffData.step2?.regras || []).map(r => ({
          titulo: r.titulo || '', link: r.link || '', notas: r.notas || ''
        }))
      };

      const tokensUsados = {};
      allSpecs.forEach(s => {
        (s.properties || []).forEach(p => {
          if (!p.token) return;
          const key = p.token;
          if (!tokensUsados[key]) tokensUsados[key] = { token: key, label: p.label || p.key || '', ocorrencias: 0 };
          tokensUsados[key].ocorrencias++;
        });
      });

      const cenariosExcecao = allSpecs.flatMap(s => (s.excecoes || []).map(e => ({
        spec: s.name || '', tipo: e.tipo || '', titulo: e.titulo || '', obs: e.obs || ''
      })));

      const medidas = frames.flatMap(f => (f.measurements || []).map(m => ({
        frame: f.nome || '',
        nome: m.name || '',
        detalhes: Array.isArray(m.details) ? m.details.join(' | ') : (m.details || '')
      })));

      const fluxos = (handoffData.createdFlows || []).map(fl => ({
        nome: fl.name || '', tipo: fl.type || '',
        de: fl.fromName || '', para: fl.toName || '',
        decisao: fl.decisionText || ''
      }));

      const telasDocumentadas = frames.map(f => ({
        nome: f.nome || '',
        novoComponente: !!f.isNewComponent,
        conformeDSC: f.audit?.semDesvios ?? null,
        qtdSpecs: (f.createdSpecs || []).length,
        qtdMedidas: (f.measurements || []).length
      }));

      return {
        _note: 'Material de apoio para uso como contexto/prompt em ferramentas externas de geração de design (ex: Figma Make) ao propor telas novas dentro deste mesmo projeto. Não é integração automática nem conhecimento institucional agregado.',
        briefing,
        telasDocumentadas,
        tokensUsados: Object.values(tokensUsados).sort((a, b) => b.ocorrencias - a.ocorrencias),
        cenariosExcecao,
        medidas,
        fluxos
      };
    }

    function exportHandoffData() {
      const exportData = JSON.parse(JSON.stringify(handoffData));
      exportData._aiContext = _buildAiContext();
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

      const fileName = `handex-backup-${handoffData.step1.titulo || 'projeto'}-${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', fileName);
      linkElement.click();
    }

    function importHandoffData() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
          try {
            const importedData = JSON.parse(event.target.result);

            if (!importedData.step1) throw new Error("Formato de JSON inválido para o Handex.");

            const oldVersion = importedData.step1.versao || 'v1.0.0';
            const newVersion = incrementVersion(oldVersion);
            importedData.step1.versao = newVersion;

            // _aiContext é dado derivado calculado no momento do export
            // (_buildAiContext) -- nunca deve entrar em handoffData como
            // estado persistido, senão reexporta/salva um snapshot congelado
            // em vez de recalcular a partir do estado atual.
            delete importedData._aiContext;

            Object.assign(handoffData, importedData);
            // Resincroniza createdSpecs (variável global que a tela de specs
            // realmente renderiza) a partir de handoffData.frames — sem isso,
            // o Object.assign acima atualiza o estado mas a lista de specs
            // fica com os dados antigos até o usuário navegar manualmente
            // pra "Anotar Specs".
            if (typeof syncAndRenderSpecs === 'function') syncAndRenderSpecs();
            saveToStorage();
            restoreUIFromState();

            // Contagens para o modal — soma specs/medidas "avulsas" (nível
            // superior de handoffData, sem frame vinculado) com as por-frame.
            // Sem isso, um backup só com dados avulsos contava 0 e
            // desabilitava a opção de recriar no canvas mesmo tendo dado
            // real pra recriar.
            const nFrames = (handoffData.frames || []).length;
            const nSpecs = (handoffData.specs || []).length + (handoffData.frames || []).reduce((s, f) => s + (f.createdSpecs || []).length, 0);
            const nMeasures = (handoffData.measurements || []).length + (handoffData.frames || []).reduce((s, f) => s + (f.measurements || []).length, 0);
            const nFlows = (handoffData.createdFlows || []).length;
            const nFlowsRecreatable = (handoffData.createdFlows || []).filter(f => f.sourceId).length;

            const subtitle = document.getElementById('import-modal-subtitle');
            if (subtitle) subtitle.textContent = `${oldVersion} → ${newVersion} importado com sucesso.`;

            const setCount = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            setCount('import-count-frames', nFrames);
            setCount('import-count-specs', nSpecs);
            setCount('import-count-measures', nMeasures);
            setCount('import-count-flows', nFlows);

            // Desabilita opções sem dados
            const specsLabel = document.getElementById('import-opt-specs-label');
            const specsInput = document.getElementById('import-opt-specs');
            if (specsLabel && specsInput) {
              if (nSpecs === 0) {
                specsInput.disabled = true;
                specsLabel.classList.add('opacity-40', 'cursor-not-allowed');
                const hint = document.getElementById('import-specs-hint');
                if (hint) hint.textContent = 'Nenhuma especificação encontrada no JSON.';
              } else {
                specsInput.disabled = false;
                specsLabel.classList.remove('opacity-40', 'cursor-not-allowed');
                const hint = document.getElementById('import-specs-hint');
                if (hint) hint.textContent = `${nSpecs} spec(s) encontrada(s) — serão recriadas no canvas.`;
              }
            }

            const measLabel = document.getElementById('import-opt-measures-label');
            const measInput = document.getElementById('import-opt-measures');
            if (measLabel && measInput) {
              if (nMeasures === 0) {
                measInput.disabled = true;
                measLabel.classList.add('opacity-40', 'cursor-not-allowed');
                const hint = document.getElementById('import-measures-hint');
                if (hint) hint.textContent = 'Nenhuma medida encontrada no JSON.';
              } else {
                measInput.disabled = false;
                measLabel.classList.remove('opacity-40', 'cursor-not-allowed');
                const hint = document.getElementById('import-measures-hint');
                if (hint) hint.textContent = `${nMeasures} medida(s) encontrada(s) — serão reaplicadas no canvas.`;
              }
            }

            const flowsLabel = document.getElementById('import-opt-flows-label');
            const flowsInput = document.getElementById('import-opt-flows');
            if (flowsLabel && flowsInput) {
              if (nFlowsRecreatable === 0) {
                flowsInput.disabled = true;
                flowsLabel.classList.add('opacity-40', 'cursor-not-allowed');
                const hint = document.getElementById('import-flows-hint');
                if (hint) {
                  hint.textContent = nFlows === 0
                    ? 'Nenhum fluxo encontrado no JSON.'
                    : `${nFlows} fluxo(s) no JSON, mas nenhum tem o vínculo com os elementos salvo (backup de uma versão anterior) -- não é possível recriar.`;
                }
              } else {
                flowsInput.disabled = false;
                flowsLabel.classList.remove('opacity-40', 'cursor-not-allowed');
                const hint = document.getElementById('import-flows-hint');
                if (hint) {
                  hint.textContent = nFlowsRecreatable === nFlows
                    ? `${nFlows} fluxo(s) encontrado(s) — serão recriados no canvas.`
                    : `${nFlowsRecreatable} de ${nFlows} fluxo(s) podem ser recriados (os demais são de um backup mais antigo, sem vínculo salvo com os elementos).`;
                }
              }
            }

            openModal('import-apply-modal');
            if (typeof _refreshIcons === 'function') _refreshIcons();
          } catch (err) {
            showToast('Erro na importação: ' + err.message);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }

    // Aplica os dados importados no canvas conforme as opções selecionadas no modal
    function applyImportedDataToCanvas() {
      closeModal('import-apply-modal');

      const doFicha = document.getElementById('import-opt-ficha')?.checked;
      const doSpecs = document.getElementById('import-opt-specs')?.checked;
      const doMeasures = document.getElementById('import-opt-measures')?.checked;
      const doFlows = document.getElementById('import-opt-flows')?.checked;

      if (!doFicha && !doSpecs && !doMeasures && !doFlows) {
        showToast('Nenhuma opção selecionada.');
        return;
      }

      if (doFicha) {
        // Pequeno delay para deixar o modal fechar antes do loading aparecer
        setTimeout(() => {
          if (typeof createHandoffOnCanvas === 'function') {
            createHandoffOnCanvas();
          }
        }, 150);
      }

      if (doSpecs) {
        let count = 0;
        const recreateSpec = (spec, fallbackNodeId) => {
          const resolvedNodeId = spec.targetNodeId || fallbackNodeId;
          if (!resolvedNodeId) return;
          parent.postMessage({
            pluginMessage: {
              type: 'create-unified-spec',
              opts: {
                targetNodeId: resolvedNodeId,
                letter: spec.letter || 'A',
                color: spec.color || '#3d3dff',
                note: spec.note || '',
                properties: spec.properties || [],
                categoryLabel: spec.type || ''
              }
            }
          }, '*');
          count++;
        };
        // Specs "avulsas" (nível superior de handoffData, sem frame
        // vinculado) — sem isso, um backup só com dados avulsos nunca
        // recriava nada no canvas, mesmo com o checkbox marcado.
        (handoffData.specs || []).forEach(spec => recreateSpec(spec, null));
        (handoffData.frames || []).forEach(frame => {
          (frame.createdSpecs || []).forEach(spec => recreateSpec(spec, frame.figmaId));
        });
        if (count > 0) showToast(`${count} spec(s) sendo recriadas no canvas...`);
      }

      if (doMeasures) {
        const frames = handoffData.frames || [];
        let count = 0;
        frames.forEach(frame => {
          if (!frame.figmaId || !(frame.measurements || []).length) return;
          parent.postMessage({
            pluginMessage: {
              type: 'reapply-measurements',
              frameId: frame.figmaId,
              measurements: frame.measurements
            }
          }, '*');
          count += frame.measurements.length;
        });
        if (count > 0) showToast(`${count} medida(s) sendo reaplicadas no canvas...`);
      }

      if (doFlows) {
        const flows = handoffData.createdFlows || [];
        let count = 0, skipped = 0;
        flows.forEach(flow => {
          // Fluxos sem sourceId vêm de um backup salvo antes desta marcação
          // existir -- não há como saber quais elementos eles conectavam.
          if (!flow.sourceId) { skipped++; return; }
          parent.postMessage({
            pluginMessage: {
              type: 'recreate-flow-connection',
              flowType: flow.type,
              flowName: flow.name || '',
              sourceId: flow.sourceId,
              targetId: flow.targetId || null,
              decisionText: flow.decisionText || '',
              flowSide: flow.flowSide || 'auto',
              connectorStyle: flow.connectorStyle || 'straight',
              curvature: flow.curvature || 0,
              nextFlowNumber: handoffData.nextFlowNumber || 1,
              // Preserva o id estável já salvo (flowUid -- não o node.id
              // antigo em flow.id, que deixa de existir ao recriar) -- sem
              // isso, cada restore de backup geraria um flowId novo e o card
              // do fluxo duplicaria na ficha em vez de ser reconhecido como
              // o mesmo fluxo já inserido antes. Fluxos salvos ANTES desta
              // marcação existir não têm flowUid -- cai no fallback, que
              // gera um novo (aceitável: são fluxos que nunca foram
              // inseridos na ficha por este mecanismo, não têm o que preservar).
              flowId: flow.flowUid || String(Date.now())
            }
          }, '*');
          handoffData.nextFlowNumber = (handoffData.nextFlowNumber || 1) + 1;
          count++;
        });
        if (count > 0) showToast(`${count} fluxo(s) sendo recriados no canvas...`);
        if (skipped > 0) showToast(`${skipped} fluxo(s) não puderam ser recriados (backup antigo, sem vínculo salvo com os elementos).`);
      }
    }

    function exportProgress() {
      // Coleta dados pendentes
      const s1TituloExp = document.getElementById("s1-titulo");
      handoffData.step1.titulo = s1TituloExp ? s1TituloExp.value : "";
      const s1StatusExp = document.getElementById("s1-status");
      handoffData.step1.status = s1StatusExp ? s1StatusExp.value : "";
      const s1ObjetivoExp = document.getElementById("s1-objetivo");
      handoffData.step1.objetivo = s1ObjetivoExp ? s1ObjetivoExp.value : "";

      // Calculado antes do step2 ser zerado abaixo -- _buildAiContext lê
      // briefingQuestions/regras de step2, que este export historicamente
      // descarta (campo legado, não relacionado ao briefing) para aliviar
      // o arquivo de specs pesadas.
      const aiContext = _buildAiContext();

      // Faz uma copia limpa sem as specs pesadas que contem Uint8Array
      const exportData = JSON.parse(JSON.stringify(handoffData));
      exportData.specs = createdSpecs.map(s => {
        const sCopy = JSON.parse(JSON.stringify(s));
        sCopy.preview = null;
        return sCopy;
      });
      exportData.step2 = { specs: null };
      exportData._aiContext = aiContext;

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = handoffData.step1.titulo ? handoffData.step1.titulo.replace(/\s+/g, '_') : 'progresso';
      a.download = `handex_${safeName}.json`;

      try {
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      } catch (e) {
        console.error("Erro no download JSON:", e);
        alert("O Figma bloqueou o download direto. Se possivel tente rodar o plugin no Browser.");
      }
    }


    function exportDesignData(format) {
      parent.postMessage({ pluginMessage: { type: 'export-design-data', format } }, '*');
    }

    function clearAllData() {
      // Reseta a etapa de confirmação por digitação TODA VEZ que a modal
      // abre -- fechar pelo botão "Fechar" ou pela tecla Esc não passa por
      // confirmClearAllData(), então só resetar lá deixava o DOM sujo: a
      // modal reabria já no passo "digite APAGAR" mesmo que o usuário não
      // tivesse clicado no botão inicial dessa vez.
      const btn = document.getElementById('clear-plugin-data-btn');
      if (btn) btn.classList.remove('hidden');
      const step = document.getElementById('clear-plugin-confirm-step');
      if (step) step.classList.add('hidden');
      const input = document.getElementById('clear-plugin-confirm-input');
      if (input) input.value = '';
      openModal('confirm-clear-modal');
    }

    // Antes de apagar de fato, checa se há algo real documentado -- se sim,
    // exige digitar "APAGAR" como uma pausa deliberada antes da ação mais
    // destrutiva do plugin (irreversível e, até esta correção, incompleta
    // o suficiente para deixar dados órfãos no storage).
    function requestClearAllData() {
      const hasContent = (handoffData.frames || []).length > 0
        || (handoffData.specs || []).length > 0
        || (handoffData.measurements || []).length > 0
        || (handoffData.createdFlows || []).length > 0;

      if (!hasContent) {
        confirmClearAllData();
        return;
      }

      const btn = document.getElementById('clear-plugin-data-btn');
      if (btn) btn.classList.add('hidden');
      const step = document.getElementById('clear-plugin-confirm-step');
      if (step) step.classList.remove('hidden');
      const input = document.getElementById('clear-plugin-confirm-input');
      if (input) { input.value = ''; input.focus(); }
      _updateClearPluginConfirmState();
    }
    window.requestClearAllData = requestClearAllData;

    function _updateClearPluginConfirmState() {
      const input = document.getElementById('clear-plugin-confirm-input');
      const btn = document.getElementById('clear-plugin-confirm-btn');
      if (!input || !btn) return;
      btn.disabled = input.value.trim().toUpperCase() !== 'APAGAR';
    }
    window._updateClearPluginConfirmState = _updateClearPluginConfirmState;

    function confirmClearAllData() {
      closeModal('confirm-clear-modal');
      // Reset da UI de confirmação (botão/step) fica em clearAllData(), que
      // roda toda vez que a modal ABRE -- cobre também os caminhos de saída
      // sem confirmar (Fechar, Esc), que não passam por esta função.
      try { localStorage.removeItem('handex-state'); } catch (e) {}
      try { localStorage.removeItem('handex-ann-categories-v2'); } catch (e) {}
      // Reseta o estado em memória para os valores iniciais -- lista
      // conferida contra TODO uso real de handoffData.* no código-fonte
      // (não só o schema documentado no CLAUDE.md, que estava incompleto).
      // Faltavam specs/tagNames/measurements/nextMeasurementNumber/docs/
      // setup/states/motion/specLinesVisible/_projectId -- sem isso, "Apagar
      // dados do plugin"
      // deixava specs avulsas ("Grupo Tag A" etc.) e outros dados
      // sobreviverem ao reset, e o saveToStorage() abaixo REGRAVAVA esse
      // lixo no clientStorage -- nem fechar e reabrir o plugin resolvia.
      Object.assign(handoffData, {
        _schemaVersion: 2,
        _projectId: null,
        step1: { titulo: '', versao: 'v1.0', objetivo: '', status: 'rascunho', jornada: '', feature: '', equipe: [] },
        step2: { briefingEnabled: false, briefingQuestions: [], regras: [], anexos: [], auditAutoBundle: null, selectedLibSlugs: [], auditReferences: [] },
        frames: [],
        specs: [],
        tagNames: {},
        specLinesVisible: {},
        measurements: [],
        nextMeasurementNumber: 1,
        createdFlows: [],
        nextFlowNumber: 1,
        currentUser: null,
        _fichaGenerated: false,
        _history: [],
        docs: {},
        setup: {},
        states: [],
        motion: []
      });
      if (typeof createdSpecs !== 'undefined') createdSpecs.length = 0;
      if (typeof lastMeasurements !== 'undefined') lastMeasurements.length = 0;
      if (typeof nextMeasurementNumber !== 'undefined') nextMeasurementNumber = 1;
      restoreUIFromState();
      // Sem isso, o reset só vive na sessão atual -- o figma.clientStorage
      // continua com os dados antigos e eles voltam ao reabrir o plugin.
      saveToStorage();
      navigate('view-home');
      showToast('Dados do plugin removidos.');
    }

    function toggleSelectAllCanvasDelete() {
      const ids = ['clear-canvas-ficha', 'clear-canvas-specs', 'clear-canvas-medidas', 'clear-canvas-fluxos'];
      const boxes = ids.map(id => document.getElementById(id)).filter(Boolean);
      const allChecked = boxes.every(b => b.checked);
      boxes.forEach(b => { b.checked = !allChecked; });
      updateClearCanvasButtonState();
    }

    function updateClearCanvasButtonState() {
      const ids = ['clear-canvas-ficha', 'clear-canvas-specs', 'clear-canvas-medidas', 'clear-canvas-fluxos'];
      const anyChecked = ids.some(id => document.getElementById(id)?.checked);
      const btn = document.getElementById('clear-canvas-submit-btn');
      if (btn) btn.disabled = !anyChecked;
    }

    function confirmDeleteCanvasContent() {
      const ficha = !!document.getElementById('clear-canvas-ficha')?.checked;
      const specs = !!document.getElementById('clear-canvas-specs')?.checked;
      const medidas = !!document.getElementById('clear-canvas-medidas')?.checked;
      const fluxos = !!document.getElementById('clear-canvas-fluxos')?.checked;

      if (!ficha && !specs && !medidas && !fluxos) return;

      parent.postMessage({
        pluginMessage: { type: 'delete-canvas-content', ficha, specs, medidas, fluxos }
      }, '*');
    }
