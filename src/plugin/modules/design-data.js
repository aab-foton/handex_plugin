// ============================================================
// design-data.js — import/export de progresso (JSON do handoff)
//
// Inclui:
//   - exportHandoffData / importHandoffData — backup full do estado
//   - exportProgress / importProgress — backup leve (sem specs pesadas)
//   - exportDesignData — pede ao backend Figma para exportar (CSV/JSON design data)
//
// Depende de: handoffData, createdSpecs, saveToStorage, restoreUIFromState,
// startHandoff, incrementVersion
// ============================================================

    function exportHandoffData() {
      const dataStr = JSON.stringify(handoffData, null, 2);
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

            Object.assign(handoffData, importedData);
            saveToStorage();
            restoreUIFromState();

            // Contagens para o modal
            const nFrames = (handoffData.frames || []).length;
            const nSpecs = (handoffData.frames || []).reduce((s, f) => s + (f.createdSpecs || []).length, 0);
            const nMeasures = (handoffData.frames || []).reduce((s, f) => s + (f.measurements || []).length, 0);
            const nFlows = (handoffData.createdFlows || []).length;

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

      if (!doFicha && !doSpecs && !doMeasures) {
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
        const frames = handoffData.frames || [];
        let count = 0;
        frames.forEach(frame => {
          (frame.createdSpecs || []).forEach(spec => {
            const resolvedNodeId = spec.targetNodeId || frame.figmaId;
            if (!resolvedNodeId) return;
            parent.postMessage({
              pluginMessage: {
                type: 'create-unified-spec',
                opts: {
                  targetNodeId: resolvedNodeId,
                  letter: spec.letter || 'A',
                  color: spec.color || '#0070af',
                  note: spec.note || '',
                  properties: spec.properties || [],
                  categoryLabel: spec.type || ''
                }
              }
            }, '*');
            count++;
          });
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
    }

    function importProgress(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          Object.assign(handoffData, data);
          alert("Progresso recuperado!");
          startHandoff();
          // Populate UI fields Seeder if possible
          if (handoffData.step1.titulo) {
            const el = document.getElementById("s1-titulo");
            if (el) el.value = handoffData.step1.titulo;
          }
        } catch (err) { alert("Erro ao importar JSON"); }
      };
      reader.readAsText(file);
    }

    function exportProgress() {
      // Coleta dados pendentes
      const s1TituloExp = document.getElementById("s1-titulo");
      handoffData.step1.titulo = s1TituloExp ? s1TituloExp.value : "";
      const s1StatusExp = document.getElementById("s1-status");
      handoffData.step1.status = s1StatusExp ? s1StatusExp.value : "";
      const s1ObjetivoExp = document.getElementById("s1-objetivo");
      handoffData.step1.objetivo = s1ObjetivoExp ? s1ObjetivoExp.value : "";

      // Faz uma copia limpa sem as specs pesadas que contem Uint8Array
      const exportData = JSON.parse(JSON.stringify(handoffData));
      exportData.specs = createdSpecs.map(s => {
        const sCopy = JSON.parse(JSON.stringify(s));
        sCopy.preview = null;
        return sCopy;
      });
      exportData.step2 = { specs: null };

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
