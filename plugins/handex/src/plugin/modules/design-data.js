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

      // Agrupado por jornada (computeFlowJourneys, core.js) em vez de lista
      // plana -- mesma função reaproveitada pela UI (renderFlowsList) e pela
      // Ficha (handoff.js), nunca reimplementada aqui.
      const jornadas = (typeof computeFlowJourneys === 'function' ? computeFlowJourneys(handoffData.createdFlows) : []).map(j => ({
        nome: j.nome,
        conexoes: j.conexoes.map(fl => ({
          nome: fl.name || '', tipo: fl.type || '',
          de: fl.fromName || '', para: fl.toName || '',
          decisao: fl.decisionText || ''
        }))
      }));

      // Componentes REAIS do DSC vinculados a um frame -- nome + biblioteca
      // de origem (matchedIn, já calculado pelo audit contra o skeleton das
      // libs, ver audit.js) + componentKey. Nunca nome de camada isolado
      // (layerName é texto livre, não confiável) -- name aqui é o mesmo
      // usado no scan, mas sempre acompanhado da lib de origem pra dar à
      // ferramenta externa uma chance real de localizar/reutilizar o
      // componente verdadeiro, não um nome solto sem proveniência.
      const _CATEGORIAS = ['components', 'icons', 'typography', 'vectors', 'frames'];
      function _dscComponentsOfFrame(f) {
        return _CATEGORIAS
          .flatMap(cat => (f.specs && f.specs[cat]) || [])
          .filter(item => item.componentKey && item.matchedIn)
          .map(item => ({ nome: item.name, biblioteca: item.matchedIn, componentKey: item.componentKey }));
      }

      // Lista detalhada de itens do scan por frame -- nome, categoria,
      // isMarkedCustom e as propriedades/tokens REAIS já capturadas
      // (item.properties: cor exata, espaçamento exato, tipografia exata,
      // não só "tem token ou não"). Reaproveita 100% o dado que o scan de
      // auditoria já produz e já está salvo em handoffData -- nenhuma
      // extração nova roda pra isso, sem risco de performance. Motivado por
      // feedback do usuário (2026-09-18): o contexto textual sozinho era
      // genérico demais pra uma IA externa replicar uma tela com fidelidade
      // — combinado com o snapshot (botão "Baixar imagens dos frames"), a
      // imagem dá a referência visual e esta lista dá a especificação
      // técnica exata de cada peça que aparece nela.
      const _CATEGORIA_LABELS = { components: 'Componente', icons: 'Ícone', typography: 'Tipografia', vectors: 'Vetor', frames: 'Frame/Layout' };
      function _scanItemsOfFrame(f) {
        return _CATEGORIAS.flatMap(cat => (f.specs && f.specs[cat]) || []).map(item => ({
          nome: item.name,
          categoria: _CATEGORIA_LABELS[item.type] || item.type,
          personalizado: !!item.isMarkedCustom,
          propriedades: (item.properties || []).map(p => ({ propriedade: p.label || p.type, valor: p.value }))
        }));
      }

      const telasDocumentadas = frames.map(f => ({
        nome: f.nome || '',
        novoComponente: !!f.isNewComponent,
        conformeDSC: f.audit?.semDesvios ?? null,
        qtdSpecs: (f.createdSpecs || []).length,
        qtdMedidas: (f.measurements || []).length,
        componentesDSC: _dscComponentsOfFrame(f),
        itensEscaneados: _scanItemsOfFrame(f)
      }));

      // Registro (não inferência) de que componentes do DSC costumam
      // acompanhar cada categoria de spec NESTE projeto -- pra uma ferramenta
      // externa (Figma Make ou equivalente) usar como referência de poucos
      // exemplos ao propor categorização em telas novas. O Handex não infere
      // nem sugere nada com isso, só registra fielmente o par (componentes
      // reais do frame, categoria que o designer escolheu para aquela spec)
      // -- nunca nome de camada isolado, que é texto livre e já provou não
      // ser dado confiável neste projeto (ver CLAUDE.md). Um frame sem
      // nenhum componente vinculado ao DSC não gera entrada.
      const padroesCategorizacao = frames.flatMap(f => {
        const componentesDoFrame = _dscComponentsOfFrame(f);
        if (componentesDoFrame.length === 0) return [];
        // Dedupe por componentKey -- o mesmo componente pode aparecer em
        // mais de uma categoria de scan (ex: um ícone dentro de um botão).
        const _uniqueByKey = [...new Map(componentesDoFrame.map(c => [c.componentKey, c])).values()];
        return (f.createdSpecs || [])
          .filter(s => s.category)
          .map(s => ({
            componentesDoFrame: _uniqueByKey,
            categoria: s.category,
            categoriaLabel: s.categoryLabel || s.category
          }));
      });

      return {
        _note: 'Material de apoio para uso como contexto/prompt em ferramentas externas de geração de design (ex: Figma Make) ao propor telas novas dentro deste mesmo projeto. Não é integração automática nem conhecimento institucional agregado.',
        briefing,
        telasDocumentadas,
        tokensUsados: Object.values(tokensUsados).sort((a, b) => b.ocorrencias - a.ocorrencias),
        cenariosExcecao,
        medidas,
        jornadas,
        padroesCategorizacao
      };
    }

    // Formata o _aiContext como texto de prompt legível (não JSON cru) --
    // pensado pra ser colado direto numa ferramenta de geração externa (ex:
    // Figma Make). Não existe canal de API pra "enviar" isso automaticamente
    // (Plugin API do Figma não expõe integração com o Figma Make, nem o
    // Figma Make expõe endpoint pra isso) -- o botão só prepara o texto e
    // copia pra área de transferência, o resto é colar manualmente.
    function _formatAiContextAsPrompt(ctx) {
      const lines = [];
      lines.push(`# Contexto do projeto: ${ctx.briefing.titulo || 'Sem título'}`);
      if (ctx.briefing.objetivo) lines.push(`Objetivo: ${ctx.briefing.objetivo}`);
      if (ctx.briefing.jornada) lines.push(`Jornada: ${ctx.briefing.jornada}`);
      if (ctx.briefing.feature) lines.push(`Feature: ${ctx.briefing.feature}`);

      if (ctx.briefing.perguntasRespondidas.length > 0) {
        lines.push('', '## Briefing estratégico');
        ctx.briefing.perguntasRespondidas.forEach(q => {
          lines.push(`- [${q.categoria || 'Geral'}] ${q.pergunta} → ${q.resposta}`);
        });
      }

      if (ctx.briefing.regrasDeNegocio.length > 0) {
        lines.push('', '## Regras de negócio');
        ctx.briefing.regrasDeNegocio.forEach(r => {
          lines.push(`- ${r.titulo}${r.notas ? ` — ${r.notas}` : ''}`);
        });
      }

      if (ctx.telasDocumentadas.length > 0) {
        lines.push('', '## Telas já documentadas neste projeto');
        lines.push('(cada tela também tem uma imagem correspondente — ver "Baixar imagens dos frames" na tela de Resumo do Handex — combine a imagem com os detalhes técnicos exatos abaixo pra replicar a estrutura com fidelidade: a imagem mostra o layout, esta lista traz cor/espaçamento/tipografia REAIS e os componentes do DSC a reutilizar em vez de recriar do zero)');
        ctx.telasDocumentadas.forEach(t => {
          const flags = [t.novoComponente ? 'Novo Componente' : null, t.conformeDSC === true ? 'Conforme DSC' : (t.conformeDSC === false ? 'Não conforme DSC' : null)].filter(Boolean).join(', ');
          lines.push(`- ${t.nome}${flags ? ` (${flags})` : ''} — ${t.qtdSpecs} spec(s), ${t.qtdMedidas} medida(s)`);
          if (t.componentesDSC.length > 0) {
            const _porLib = {};
            t.componentesDSC.forEach(c => { (_porLib[c.biblioteca] = _porLib[c.biblioteca] || []).push(c.nome); });
            lines.push(`    Componentes DSC reais (reutilizar, não recriar):`);
            Object.entries(_porLib).forEach(([lib, nomes]) => {
              lines.push(`    - [${lib}] ${[...new Set(nomes)].join(', ')}`);
            });
          }
          if (t.itensEscaneados.length > 0) {
            lines.push(`    Itens escaneados nesta tela (nome, categoria, propriedades reais):`);
            t.itensEscaneados.forEach(item => {
              const props = item.propriedades.map(p => `${p.propriedade}: ${p.valor}`).join(' | ');
              lines.push(`    - [${item.categoria}]${item.personalizado ? ' [Personalizado]' : ''} ${item.nome}${props ? ` — ${props}` : ''}`);
            });
          }
        });
      }

      if (ctx.tokensUsados.length > 0) {
        lines.push('', '## Tokens de design usados com mais frequência');
        ctx.tokensUsados.slice(0, 20).forEach(t => lines.push(`- ${t.token} (${t.ocorrencias}x)`));
      }

      if (ctx.padroesCategorizacao.length > 0) {
        lines.push('', '## Padrões de categorização de specs já observados neste projeto');
        lines.push('(referência de como frames com esses componentes do DSC costumam ser categorizados aqui — não é regra fixa)');
        ctx.padroesCategorizacao.forEach(p => {
          const _nomes = p.componentesDoFrame.map(c => `${c.nome} (${c.biblioteca})`).join(', ');
          lines.push(`- Frame com componentes [${_nomes}] → categorizado como "${p.categoriaLabel}"`);
        });
      }

      if (ctx.cenariosExcecao.length > 0) {
        lines.push('', '## Cenários de exceção');
        ctx.cenariosExcecao.forEach(e => lines.push(`- [${e.spec}] ${e.titulo || e.tipo}${e.obs ? ` — ${e.obs}` : ''}`));
      }

      if (ctx.medidas.length > 0) {
        lines.push('', '## Medidas registradas');
        ctx.medidas.forEach(m => lines.push(`- [${m.frame}] ${m.nome}: ${m.detalhes}`));
      }

      if (ctx.jornadas.length > 0) {
        lines.push('', '## Jornadas / fluxos de tela');
        ctx.jornadas.forEach(j => {
          lines.push(`- ${j.nome}:`);
          j.conexoes.forEach(c => lines.push(`  - ${c.de} → ${c.para}${c.decisao ? ` (${c.decisao})` : ''}`));
        });
      }

      lines.push('', '---', 'Contexto gerado pelo Handex a partir da documentação já feita neste projeto. Use como referência para manter consistência com o que já foi decidido e documentado.');
      return lines.join('\n');
    }

    // Pacote único (.zip) com o contexto pra IA + imagens dos frames
    // documentados -- substituiu os 2 botões separados que existiam antes
    // (copiar texto pra clipboard + baixar PNGs individuais): usuário pediu
    // baixar tudo junto num só arquivo em vez de duas ações. O texto vai
    // como .md dentro do zip (não copiado pra clipboard) -- abrir o arquivo
    // e copiar de lá é o novo fluxo pra colar no Figma Make. Reaproveita
    // JSZip do mesmo jeito que exportHandoff() já faz (handoff.js) --
    // carregado via CDN sob demanda, mesma versão já usada no projeto.
    //
    // Antes de gerar o pacote, abre um modal (ai-context-extra-frames-modal)
    // perguntando se o designer quer incluir telas COMPLETAS do canvas além
    // das já documentadas -- motivado por feedback (2026-09-18): o
    // designer normalmente documenta só PARTES de uma tela (um header, um
    // menu), nunca a tela inteira, mas o Figma Make precisa ver a tela
    // completa pra ter contexto amplo de onde essas partes vivem. Telas já
    // documentadas sempre entram, sem precisar marcar nada no modal.
    // Retorna uma Promise resolvida em _buildAiContextPackage (o passo
    // final, depois do modal de frames extras) -- necessário pra
    // executeSelectedExports() (ver abaixo) aguardar essa exportação antes
    // de seguir pra próxima da fila, incluindo o tempo em que o modal fica
    // esperando decisão do designer.
    async function downloadAiContextPackage() {
      parent.postMessage({ pluginMessage: { type: 'list-canvas-frames-for-ai' } }, '*');
      return new Promise(resolve => { window._pendingAiContextPackageResolve = resolve; });
    }
    window.downloadAiContextPackage = downloadAiContextPackage;

    function _renderAiContextExtraFramesModal(frames) {
      const list = document.getElementById('ai-context-extra-frames-list');
      if (!list) { _confirmAiContextExtraFrames(true); return; }
      if (!frames || frames.length === 0) {
        list.innerHTML = '<p class="text-[11px] text-slate-500 dark:text-dark-muted text-center py-4">Nenhum outro frame encontrado nesta página.</p>';
      } else {
        list.innerHTML = frames.map(f => `
          <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 dark:border-dark-line cursor-pointer hover:border-[#005ca9]/30 transition-colors">
            <input type="checkbox" data-extra-frame-id="${f.id}" class="w-4 h-4 rounded border-gray-300 text-[#005ca9] focus:ring-[#005ca9]" />
            <span class="text-[12px] font-medium text-slate-700 dark:text-white truncate">${escapeHtml(f.nome)}</span>
          </label>
        `).join('');
      }
      if (typeof openModal === 'function') openModal('ai-context-extra-frames-modal');
      _refreshIcons();
    }
    window._renderAiContextExtraFramesModal = _renderAiContextExtraFramesModal;

    function _confirmAiContextExtraFrames(proceed) {
      const extraFrameIds = proceed
        ? Array.from(document.querySelectorAll('#ai-context-extra-frames-list [data-extra-frame-id]:checked')).map(el => el.getAttribute('data-extra-frame-id'))
        : [];
      if (typeof closeModal === 'function') closeModal('ai-context-extra-frames-modal');
      showToast('Gerando pacote de contexto...');
      parent.postMessage({ pluginMessage: { type: 'export-frame-snapshots-for-ai', data: handoffData, extraFrameIds } }, '*');
    }
    window._confirmAiContextExtraFrames = _confirmAiContextExtraFrames;

    // Baixa a Ficha do canvas (a que já existe, não uma reconstrução) como
    // PDF nativo -- fidelidade visual total (cores, cards, snapshots),
    // usando format: 'PDF' do exportAsync da Plugin API. Diferente do PDF
    // de texto puro já existente em exportHandoff() (que converte o
    // Markdown pra texto corrido) -- este é uma exportação real do próprio
    // frame renderizado.
    // downloadFichaPdf() retorna uma Promise que resolve quando a resposta
    // do backend chega (_handleFichaPdfExported) -- necessário pra
    // executeSelectedExports() (ver abaixo) conseguir aguardar essa
    // exportação assíncrona antes de seguir pra próxima da fila, já que ela
    // depende de um round-trip com o backend (export-ficha-pdf).
    function downloadFichaPdf() {
      const titulo = (document.getElementById('s1-titulo')?.value || handoffData.step1.titulo || '').trim();
      showToast('Gerando PDF da Ficha...');
      parent.postMessage({ pluginMessage: { type: 'export-ficha-pdf', titulo } }, '*');
      return new Promise(resolve => { window._pendingFichaPdfResolve = resolve; });
    }
    window.downloadFichaPdf = downloadFichaPdf;

    function _handleFichaPdfExported(msg) {
      if (!msg.base64) {
        const errMsg = msg.error === 'no-ficha'
          ? 'Nenhuma Ficha encontrada no canvas — gere a Ficha de Handoff primeiro.'
          : 'Não foi possível gerar o PDF da Ficha — tente novamente.';
        showToast(errMsg, 'error');
      } else {
        const rawName = handoffData.step1.titulo || 'handoff';
        const safeName = rawName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        const link = document.createElement('a');
        link.href = 'data:application/pdf;base64,' + msg.base64;
        link.download = `handex-ficha-${safeName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Ficha baixada em PDF!');
      }
      if (typeof window._pendingFichaPdfResolve === 'function') {
        const r = window._pendingFichaPdfResolve;
        window._pendingFichaPdfResolve = null;
        r();
      }
    }
    window._handleFichaPdfExported = _handleFichaPdfExported;

    async function _buildAiContextPackage(images) {
      try {
        await (window.JSZip ? Promise.resolve() : new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        }));

        const ctx = _buildAiContext();
        const text = _formatAiContextAsPrompt(ctx);
        const rawName = handoffData.step1.titulo || 'handoff';
        const safeName = rawName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

        const zip = new JSZip();
        zip.file('contexto-ia.md', text);
        if (images && images.length > 0) {
          const imgFolder = zip.folder('imagens');
          images.forEach((img, i) => {
            const imgName = (img.nome || `frame-${i + 1}`).replace(/[^a-z0-9-_ ]/gi, '').trim() || `frame-${i + 1}`;
            imgFolder.file(`${imgName}.png`, img.base64, { base64: true });
          });
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `handex-contexto-ia-${safeName}.zip`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

        showToast(`Pacote baixado (${images ? images.length : 0} imagem(ns) + contexto). Abra o .md dentro do zip pra colar no Figma Make.`);
      } catch (e) {
        showToast('Não foi possível gerar o pacote — tente novamente.', 'error');
      }
      if (typeof window._pendingAiContextPackageResolve === 'function') {
        const r = window._pendingAiContextPackageResolve;
        window._pendingAiContextPackageResolve = null;
        r();
      }
    }
    window._buildAiContextPackage = _buildAiContextPackage;

    // Checklist de exportação (v6.29.0, 2026-09-18) -- substituiu 5 botões
    // individuais empilhados por uma lista com checkbox + botão único
    // "Exportar selecionados", já que a tela de Resumo estava ficando longa
    // com cada exportação nova. Executa em SEQUÊNCIA (nunca em paralelo:
    // duas exportações que abrem modal ou disparam postMessage ao mesmo
    // tempo colidiriam nos mesmos elementos de UI/estado global), aguardando
    // cada uma terminar antes de seguir pra próxima -- as 3 síncronas
    // (Briefing/MD/JSON) resolvem na hora; PDF da Ficha e Contexto+Imagens
    // (que tem modal no meio) retornam Promise resolvida só quando a
    // resposta do backend/decisão do designer chega (ver downloadFichaPdf/
    // downloadAiContextPackage acima). Loading (handoff-loading-overlay,
    // já usado por createHandoffOnCanvas) fica visível durante toda a fila.
    const _EXPORT_ACTIONS = {
      'ficha-pdf': { label: 'Ficha em PDF', fn: () => downloadFichaPdf() },
      'briefing-md': { label: 'Briefing', fn: () => { if (typeof exportBriefingMD === 'function') exportBriefingMD(); } },
      'handoff-md': { label: 'Markdown', fn: () => { if (typeof exportHandoffMD === 'function') exportHandoffMD(); } },
      'handoff-json': { label: 'JSON', fn: () => exportHandoffData() },
      'ai-context': { label: 'Contexto + imagens pro Figma Make', fn: () => downloadAiContextPackage() }
    };

    async function executeSelectedExports() {
      const checked = Array.from(document.querySelectorAll('#export-checklist [data-export-key]:checked')).map(el => el.getAttribute('data-export-key'));
      if (checked.length === 0) {
        showToast('Selecione ao menos uma exportação.', 'error');
        return;
      }
      if (typeof showHandoffLoading === 'function') showHandoffLoading();
      for (const key of checked) {
        const action = _EXPORT_ACTIONS[key];
        if (!action) continue;
        try {
          await action.fn();
        } catch (e) { /* uma exportação falhando não deve travar as demais da fila */ }
      }
      if (typeof hideHandoffLoading === 'function') hideHandoffLoading();
      if (typeof closeModal === 'function') closeModal('export-modal');
      showToast(`${checked.length} exportação(ões) concluída(s).`);
    }
    window.executeSelectedExports = executeSelectedExports;

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
            // superior de handoffData, sem frame vinculado) com as por-frame,
            // deduplicando por id: handoffData.specs não é garantidamente só
            // avulsas (ver mesma ressalva em applyImportedDataToCanvas), então
            // somar os dois arrays crus pode contar a mesma spec duas vezes.
            const nFrames = (handoffData.frames || []).length;
            const dedupSpecIds = new Set(
              (handoffData.specs || []).map(s => s.id).concat(
                (handoffData.frames || []).flatMap(f => (f.createdSpecs || []).map(s => s.id))
              )
            );
            const nSpecs = dedupSpecIds.size;
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
                color: spec.color || '#005ca9',
                note: spec.note || '',
                properties: spec.properties || [],
                categoryLabel: spec.type || ''
              }
            }
          }, '*');
          count++;
        };
        // handoffData.specs não é garantidamente só "avulsas" — depois que
        // collectHandoffData()/saveSpecsToStorage() rodam na mesma sessão
        // que gerou o backup, ele já vem com o merge avulsas+por-frame (ver
        // comentário de _mergeLooseAndFramed em core.js). Sem dedup por id,
        // uma spec com frame apareceria tanto em handoffData.specs quanto em
        // frame.createdSpecs e seria recriada duas vezes no canvas.
        const seenSpecIds = new Set();
        (handoffData.specs || []).forEach(spec => {
          if (spec.id) seenSpecIds.add(spec.id);
          recreateSpec(spec, null);
        });
        (handoffData.frames || []).forEach(frame => {
          (frame.createdSpecs || []).forEach(spec => {
            if (spec.id && seenSpecIds.has(spec.id)) return;
            if (spec.id) seenSpecIds.add(spec.id);
            recreateSpec(spec, frame.figmaId);
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
        // Medidas avulsas (sem frame vinculado) não têm um nó de referência
        // pra reapply-measurements ancorar — não são recriadas no canvas,
        // só as por-frame. Avisa quando isso reduz o total pra não parecer
        // que a importação "perdeu" dado silenciosamente.
        const nLooseMeasures = (handoffData.measurements || []).length;
        if (count > 0) {
          showToast(nLooseMeasures > 0
            ? `${count} medida(s) reaplicadas no canvas — ${nLooseMeasures} avulsa(s) sem frame não puderam ser recriadas.`
            : `${count} medida(s) sendo reaplicadas no canvas...`);
        } else if (nLooseMeasures > 0) {
          showToast(`${nLooseMeasures} medida(s) avulsa(s) não puderam ser recriadas — sem frame vinculado no canvas.`, 'error');
        }
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
      const everythingBtn = document.getElementById('clear-everything-btn');
      if (everythingBtn) everythingBtn.classList.remove('hidden');
      const everythingStep = document.getElementById('clear-everything-confirm-step');
      if (everythingStep) everythingStep.classList.add('hidden');
      const everythingInput = document.getElementById('clear-everything-confirm-input');
      if (everythingInput) everythingInput.value = '';
      openModal('confirm-clear-modal');
    }

    // Antes de apagar de fato, checa se há algo real documentado -- se sim,
    // exige digitar "APAGAR" como uma pausa deliberada antes da ação mais
    // destrutiva do plugin (irreversível e, até esta correção, incompleta
    // o suficiente para deixar dados órfãos no storage).
    // Fonte única de "há algo documentado" -- usada tanto para decidir se
    // Limpar Dados pede confirmação por digitação (requestClearAllData)
    // quanto para habilitar/desabilitar Baixar/Limpar no rodapé da home
    // (ver updateHomeFooterButtonsState em core.js). Nunca duplicar esta
    // checagem em outro lugar.
    //
    // frames.length > 0 sozinho não basta: um frame entra em handoffData.frames
    // assim que é SELECIONADO e registrado no hub (addFrame), antes de
    // qualquer resultado real existir (specs: null, createdSpecs: [],
    // measurements: [], excecoes: []) -- um registro nunca preenchido
    // (usuário testou uma ferramenta e não voltou) deixava esta função sempre
    // "true", com Baixar/Limpar habilitados num projeto sem nenhum artefato
    // visível. _frameHasContent checa se HÁ algo de fato dentro do frame.
    function _frameHasContent(f) {
      const scanned = f.specs && (
        (f.specs.components || []).length > 0
        || (f.specs.icons || []).length > 0
        || (f.specs.typography || []).length > 0
        || (f.specs.vectors || []).length > 0
      );
      return !!scanned
        || (f.createdSpecs || []).length > 0
        || (f.measurements || []).length > 0
        || (f.excecoes || []).length > 0;
    }

    function hasDocumentedContent() {
      return (handoffData.frames || []).some(_frameHasContent)
        || (handoffData.specs || []).length > 0
        || (handoffData.measurements || []).length > 0
        || (handoffData.createdFlows || []).length > 0;
    }
    window.hasDocumentedContent = hasDocumentedContent;

    // Checagem por card da home (ver updateHomeCardsCheckState em core.js) --
    // cada card precisa saber se ELE MESMO tem conteúdo, diferente de
    // hasDocumentedContent() (agregado, usado só pra habilitar Baixar/Limpar).
    // "guide" nunca entra aqui: é onboarding, não representa dado do projeto.
    // Cada entrada é { done, label }: label é o texto final já exibido,
    // sempre "Ação + particípio" (ex: "Specs criadas") -- com a contagem real
    // entre parênteses quando o card tem uma (ex: "Specs criadas (3)").
    // "dados-projeto" é o único sem contagem (critério booleano: título +
    // equipe preenchidos, não uma lista de itens).
    function getHomeCardsDocumentedState() {
      const frames = handoffData.frames || [];
      const s1 = handoffData.step1 || {};

      const scannedFramesCount = frames.filter(f => f.specs && (
        (f.specs.components || []).length > 0
        || (f.specs.icons || []).length > 0
        || (f.specs.typography || []).length > 0
        || (f.specs.vectors || []).length > 0
      )).length;

      const specsCount = frames.reduce((sum, f) => sum + (f.createdSpecs || []).length, 0)
        + (handoffData.specs || []).length;

      const measurementsCount = frames.reduce((sum, f) => sum + (f.measurements || []).length, 0)
        + (handoffData.measurements || []).length;

      const flowsCount = (handoffData.createdFlows || []).length;

      const hasDadosProjeto = !!(s1.titulo && s1.titulo.trim()) && (s1.equipe || []).length > 0;

      const _withCount = (label, count) => `${label} (${count})`;

      return {
        'dados-projeto': { done: hasDadosProjeto, label: 'Informações salvas' },
        'tokens': { done: scannedFramesCount > 0, label: _withCount('Tokens escaneados', scannedFramesCount) },
        'specs': { done: specsCount > 0, label: _withCount('Specs criadas', specsCount) },
        'measurement': { done: measurementsCount > 0, label: _withCount('Medidas inseridas', measurementsCount) },
        'flows': { done: flowsCount > 0, label: _withCount('Fluxos mapeados', flowsCount) }
      };
    }
    window.getHomeCardsDocumentedState = getHomeCardsDocumentedState;

    function requestClearAllData() {
      const hasContent = hasDocumentedContent();

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

    function confirmClearAllData(opts) {
      opts = opts || {};
      // combinedFlow: true quando chamada por _finishClearEverything, que já
      // cuida de fechar o modal/navegar/mostrar um toast único cobrindo
      // canvas+registro -- evita fechar duas vezes e mostrar dois toasts.
      if (!opts.combinedFlow) closeModal('confirm-clear-modal');
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
        _schemaVersion: 3,
        _projectId: null,
        step1: { titulo: '', versao: 'v1.0', objetivo: '', status: 'rascunho', jornada: '', feature: '', equipe: [] },
        step2: { briefingEnabled: true, regrasEnabled: true, linksEnabled: true, briefingQuestions: [], regras: [], anexos: [], auditAutoBundle: null, selectedLibSlugs: [], auditReferences: [] },
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
        _fichaSections: {
          tokens:  { insertedAt: null, itemCount: 0 },
          specs:   { insertedAt: null, itemCount: 0 },
          medidas: { insertedAt: null, itemCount: 0 },
          fluxos:  { insertedAt: null, itemCount: 0 }
        },
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
      if (opts.combinedFlow) return;
      navigate('view-home');
      showToast('Dados do plugin removidos.');
    }

    // "Apagar tudo" combina as duas ações acima (registro do plugin +
    // conteúdo do canvas) numa confirmação só -- existiam lado a lado no
    // modal mas nunca conectadas, deixando o registro do plugin ser
    // resetado sem o canvas acompanhar (ou vice-versa), o que é o cenário
    // exato que já causou bug de dado órfão nesta base (ver comentário em
    // confirmClearAllData). Reaproveita a mesma trava de digitar "APAGAR".
    let _clearingEverything = false;

    function requestClearEverything() {
      const btn = document.getElementById('clear-everything-btn');
      if (btn) btn.classList.add('hidden');
      const step = document.getElementById('clear-everything-confirm-step');
      if (step) step.classList.remove('hidden');
      const input = document.getElementById('clear-everything-confirm-input');
      if (input) { input.value = ''; input.focus(); }
      _updateClearEverythingConfirmState();
    }
    window.requestClearEverything = requestClearEverything;

    function _updateClearEverythingConfirmState() {
      const input = document.getElementById('clear-everything-confirm-input');
      const btn = document.getElementById('clear-everything-confirm-btn');
      if (!input || !btn) return;
      btn.disabled = input.value.trim().toUpperCase() !== 'APAGAR';
    }
    window._updateClearEverythingConfirmState = _updateClearEverythingConfirmState;

    function confirmClearEverything() {
      _clearingEverything = true;
      parent.postMessage({
        pluginMessage: { type: 'delete-canvas-content', ficha: true, specs: true, medidas: true, fluxos: true }
      }, '*');
    }
    window.confirmClearEverything = confirmClearEverything;

    // Chamado pelo handler de 'canvas-content-deleted' em messages.js quando
    // _clearingEverything está ativo -- roda depois da limpeza do canvas
    // confirmar, pra não deixar o registro apontando pra nós que já não
    // existem mais caso a limpeza do canvas falhe no meio do caminho.
    function _finishClearEverything(canvasCounts) {
      _clearingEverything = false;
      closeModal('confirm-clear-modal');
      confirmClearAllData({ combinedFlow: true });
      navigate('view-home');
      const c = canvasCounts || {};
      const parts = [];
      if (c.ficha) parts.push(`${c.ficha} ficha${c.ficha > 1 ? 's' : ''}`);
      if (c.spec) parts.push(`${c.spec} spec${c.spec > 1 ? 's' : ''}`);
      if (c.medida) parts.push(`${c.medida} medida${c.medida > 1 ? 's' : ''}`);
      if (c.fluxo) parts.push(`${c.fluxo} fluxo${c.fluxo > 1 ? 's' : ''}`);
      const canvasMsg = parts.length ? `, ${parts.join(', ')} removido(s) do canvas` : '';
      showToast(`Registro do plugin apagado${canvasMsg}.`);
    }
    window._finishClearEverything = _finishClearEverything;
    window._isClearingEverything = () => _clearingEverything;

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
