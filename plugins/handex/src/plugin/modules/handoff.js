// ============================================================
// handoff.js — geração da Ficha Técnica HTML interativa
//
// Inclui:
//   - bytesToBase64 — helper para incorporar previews PNG inline
//   - collectHandoffData — varre os formulários e popula handoffData
//   - exportHandoff — empacota ZIP (HTML + MD + PDF + Anexos)
//   - computeHandoffDiff / comparePropertyLists — diff entre snapshots
//   - getInteractiveHTMLContent — gera o HTML standalone com Tailwind/Lucide,
//     acordeões da ficha, aba "Frame & Elementos", lightbox, scan grouped por tipo,
//     Code Connect chips, suggest closest match, etc.
//
// Depende de: handoffData, createdSpecs, getAuditSummary, computeItemAuditStatus,
// getItemAuditBreakdown, saveToStorage, showToast
// (escopo global compartilhado)
// ============================================================

    function bytesToBase64(bytes) {
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
      return window.btoa(binary);
    }

    function collectHandoffData() {
      const s1Fluxo = document.getElementById("s1-fluxo");
      handoffData.step1.fluxo = s1Fluxo ? s1Fluxo.value : "";
      const s1Status = document.getElementById("s1-status");
      handoffData.step1.status = s1Status ? s1Status.value : "";
      const s1Objetivo = document.getElementById("s1-objetivo");
      handoffData.step1.objetivo = s1Objetivo ? s1Objetivo.value : "";
      const s1Gerente = document.getElementById("s1-gerente");
      handoffData.step1.gerente = s1Gerente ? s1Gerente.value : "";
      const s1Versao = document.getElementById("s1-versao");
      handoffData.step1.versao = s1Versao ? s1Versao.value : "v2.0.0";

      handoffData.setup = {
        ficha: document.getElementById('chk-ficha') ? document.getElementById('chk-ficha').checked : true,
        espacamentos: document.getElementById('chk-espacamentos') ? document.getElementById('chk-espacamentos').checked : true,
        anatomia: document.getElementById('chk-anatomia') ? document.getElementById('chk-anatomia').checked : true,
        instancias: document.getElementById('chk-instancias') ? document.getElementById('chk-instancias').checked : true,
        componentes: document.getElementById('chk-componentes') ? document.getElementById('chk-componentes').checked : true
      };

      handoffData.step3.team = [];
      document.querySelectorAll("#list-equipe > div").forEach(item => {
        const id = item.id.replace("item-", "");
        handoffData.step3.team.push({
          role: document.getElementById(`role-${id}`).value,
          name: document.getElementById(`name-${id}`).value,
          email: document.getElementById(`email-${id}`).value
        });
      });

      const excecoes = [];
      const regras = [];
      const seenIds = new Set();
      Object.keys(handoffData.step3).forEach(key => {
        const m = key.match(/^(excecao-\d+|regras-\d+)_/);
        if (!m) return;
        const id = m[1];
        if (seenIds.has(id)) return;
        seenIds.add(id);

        if (id.startsWith("excecao-")) {
          excecoes.push({
            title: handoffData.step3[`${id}_title`] || "Sem título",
            link: handoffData.step3[`${id}_link`] || "",
            notes: handoffData.step3[`${id}_notes`] || "",
            type: handoffData.step3[`${id}_type`] || "Geral"
          });
        } else if (id.startsWith("regras-")) {
          regras.push({
            title: handoffData.step3[`${id}_title`] || "Regra de Negócio",
            link: handoffData.step3[`${id}_link`] || "",
            notes: handoffData.step3[`${id}_notes`] || ""
          });
        }
      });

      handoffData.excecoes = excecoes;
      handoffData.regras = regras;

      // Collect interactive states & motion (Estados & Motion accordion)
      const states = [];
      const motion = [];
      const stateSeen = new Set();
      const motionSeen = new Set();
      Object.keys(handoffData.step3).forEach(key => {
        const sMatch = key.match(/^(state-\d+(?:-\d+)?)_/);
        if (sMatch && !stateSeen.has(sMatch[1])) {
          stateSeen.add(sMatch[1]);
          const id = sMatch[1];
          states.push({
            id,
            state: handoffData.step3[`${id}_state`] || 'Estado',
            icon: handoffData.step3[`${id}_icon`] || 'circle',
            color: handoffData.step3[`${id}_color`] || 'slate',
            target: handoffData.step3[`${id}_target`] || '',
            description: handoffData.step3[`${id}_description`] || '',
            link: handoffData.step3[`${id}_link`] || ''
          });
        }
        const mMatch = key.match(/^(motion-\d+(?:-\d+)?)_/);
        if (mMatch && !motionSeen.has(mMatch[1])) {
          motionSeen.add(mMatch[1]);
          const id = mMatch[1];
          motion.push({
            id,
            target: handoffData.step3[`${id}_target`] || '',
            property: handoffData.step3[`${id}_property`] || '',
            trigger: handoffData.step3[`${id}_trigger`] || '',
            duration: handoffData.step3[`${id}_duration`] || '',
            easing: handoffData.step3[`${id}_easing`] || '',
            notes: handoffData.step3[`${id}_notes`] || ''
          });
        }
      });
      handoffData.states = states;
      handoffData.motion = motion;

      // Collect docs link visibility (checkbox state + link value)
      handoffData.docs = {
        proto: { checked: !!(document.querySelector('#proto-field') && !document.querySelector('#proto-field').classList.contains('hidden') && handoffData.step3.proto_link), link: handoffData.step3.proto_link || '' },
        a11y: { checked: !!(document.querySelector('#a11y-field') && !document.querySelector('#a11y-field').classList.contains('hidden') && handoffData.step3.a11y_link), link: handoffData.step3.a11y_link || '' },
        research: { checked: !!(document.querySelector('#research-field') && !document.querySelector('#research-field').classList.contains('hidden') && handoffData.step3.research_link), link: handoffData.step3.research_link || '' },
      };

      let briefingMD = "## Briefing Estratégico\n";
      if (handoffData.briefing && handoffData.briefing.questions && handoffData.briefing.questions.length > 0) {
        handoffData.briefing.questions.forEach((q, i) => {
          briefingMD += `- **#${i+1} [${q.category || "Customizada"}] ${q.question}**: ${q.answer}\n`;
        });
      } else {
        briefingMD += "Nenhum briefing cadastrado.\n";
      }

      const mdContent = `# HANDOFF: ${handoffData.step1.fluxo}

${briefingMD}

## Informações Obrigatórias
- **Título do Fluxo:** ${handoffData.step1.fluxo}
- **Status:** ${handoffData.step1.status}
- **Versão do Documento:** ${handoffData.step1.versao}
- **Designer Responsável:** ${handoffData.step1.gerente}
- **Objetivo da entrega:**
${handoffData.step1.objetivo}

## Equipe e Responsáveis
${handoffData.step3.team.length === 0 ? "Nenhum membro" : handoffData.step3.team.map(m => `- **${m.role}**: ${m.name} (${m.email})`).join('\n')}

## Cenários de Exceção
${excecoes.length === 0 ? "Nenhum cenário cadastrado." : excecoes.map(e => `- [${e.title}](${e.link}): ${e.notes}`).join('\n')}

## Regras de Negócio e HUs
${regras.length === 0 ? "Nenhuma regra cadastrada." : regras.map(r => `- [Regra](${r.link}): ${r.notes}`).join('\n')}

## Documentação Adicional
- **Protótipo:** ${handoffData.step3.proto_link || "N/A"}
- **Acessibilidade:** ${handoffData.step3.a11y_link || "N/A"}
- **UX Research:** ${handoffData.step3.research_link || "N/A"}
`;
      handoffData.mdContent = mdContent;
    }

    function exportHandoff() {
      const btn = document.getElementById("btn-final-export");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span>Exportando...</span>';
      }
      lucide.createIcons();

      collectHandoffData();

      const s1Versao = document.getElementById("s1-versao");
      if (s1Versao) {
        const newV = incrementVersion(s1Versao.value);
        s1Versao.value = newV;
        handoffData.step1.versao = newV;
      }

      const g = id => document.getElementById(id);
      handoffData.setup = {
        incluirBriefing: g("setup-briefing") ? g("setup-briefing").checked : true,
        ficha: g("setup-ficha") ? g("setup-ficha").checked : true,
        componentes: g("setup-specs") ? g("setup-specs").checked : true,
        checklist: g("setup-checklist") ? g("setup-checklist").checked : true
      };

      const mdContent = handoffData.mdContent;

      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text("Handoff: " + handoffData.step1.fluxo, 10, 20);
        doc.setFontSize(10);

        const pdfLines = doc.splitTextToSize(mdContent, 180);
        doc.text(pdfLines, 10, 30);

        const pdfBlob = doc.output('blob');

        const zip = new JSZip();
        const rawName = handoffData.step1.fluxo || "handoff";
        const safeName = rawName.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");

        const visualizerHTML = getInteractiveHTMLContent();
        zip.file(`${safeName}.html`, visualizerHTML);

        const documentosFolder = zip.folder("Documentos");
        documentosFolder.file(safeName + ".md", mdContent);
        documentosFolder.file(safeName + ".pdf", pdfBlob);

        if (window.uploadedFiles && Object.keys(window.uploadedFiles).length > 0) {
          const anexosFolder = zip.folder("Anexos");
          for (const [fName, buffer] of Object.entries(window.uploadedFiles)) {
            anexosFolder.file(fName, buffer);
          }
        }

        zip.generateAsync({ type: "blob" }).then(function (content) {
          try {
            const url = URL.createObjectURL(content);
            const a = document.createElement("a");
            a.href = url;
            a.download = safeName + ".zip";
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 100);

            // Save a snapshot of this export so the next handoff can show a
            // diff with the previous version. Strip preview blobs to keep
            // clientStorage usage small.
            try {
              const stripPreview = (it) => { const c = Object.assign({}, it); delete c.preview; if (c.layers && c.layers instanceof Set) c.layers = Array.from(c.layers); return c; };
              const specsData = handoffData.step2.specs || {};
              const snapshot = {
                exportedAt: new Date().toISOString(),
                projectName: handoffData.step1.fluxo || null,
                versao: handoffData.step1.versao || null,
                status: handoffData.step1.status || null,
                scan: {
                  components: (specsData.components || []).map(stripPreview),
                  icons: (specsData.icons || []).map(stripPreview),
                  typography: (specsData.typography || []).map(stripPreview),
                  frames: (specsData.frames || []).map(stripPreview),
                  vectors: (specsData.vectors || []).map(stripPreview)
                },
                states: handoffData.states || [],
                motion: handoffData.motion || []
              };
              parent.postMessage({ pluginMessage: { type: 'snapshot-save', snapshot } }, '*');
            } catch (snapErr) {
              console.warn("Snapshot save skipped:", snapErr);
            }
          } catch (e) {
            console.error("Erro no download:", e);
          }
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Exportar Handoff (ZIP)</span> <i data-lucide="download" class="w-4 h-4"></i>';
            lucide.createIcons();
          }
        }).catch(err => {
          console.error("ZIP Generation error", err);
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Exportar Handoff (ZIP)</span> <i data-lucide="download" class="w-4 h-4"></i>';
            lucide.createIcons();
          }
        });
      } catch (err) {
        console.error("PDF/ZIP setup error", err);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Exportar Handoff (ZIP)</span> <i data-lucide="download" class="w-4 h-4"></i>';
          lucide.createIcons();
        }
      }
    }

    function computeHandoffDiff(previous, current) {
      const result = { added: [], removed: [], modified: [] };
      const cats = ["components", "icons", "typography", "frames", "vectors"];
      const prevScan = previous.scan || {};

      cats.forEach(cat => {
        const prevList = Array.isArray(prevScan[cat]) ? prevScan[cat] : [];
        const currList = Array.isArray(current[cat]) ? current[cat] : [];
        const prevMap = new Map(prevList.map(it => [it.name, it]));
        const currMap = new Map(currList.map(it => [it.name, it]));

        currList.forEach(it => {
          if (!prevMap.has(it.name)) {
            result.added.push({ category: cat, name: it.name });
          } else {
            const prev = prevMap.get(it.name);
            const changes = comparePropertyLists(prev.properties || [], it.properties || []);
            if (changes.length > 0) {
              result.modified.push({ category: cat, name: it.name, changes });
            }
          }
        });
        prevList.forEach(it => {
          if (!currMap.has(it.name)) {
            result.removed.push({ category: cat, name: it.name });
          }
        });
      });

      // States + motion are treated as a single category by id/state name
      const prevStates = previous.states || [];
      const currStates = current.states || [];
      const stateKey = (s) => `${s.state || ''}:${s.target || ''}`;
      const prevStateMap = new Map(prevStates.map(s => [stateKey(s), s]));
      const currStateMap = new Map(currStates.map(s => [stateKey(s), s]));
      currStates.forEach(s => { if (!prevStateMap.has(stateKey(s))) result.added.push({ category: 'state', name: `${s.state} (${s.target || '—'})` }); });
      prevStates.forEach(s => { if (!currStateMap.has(stateKey(s))) result.removed.push({ category: 'state', name: `${s.state} (${s.target || '—'})` }); });

      const prevMotion = previous.motion || [];
      const currMotion = current.motion || [];
      const motionKey = (m) => `${m.target || ''}:${m.property || ''}:${m.trigger || ''}`;
      const prevMMap = new Map(prevMotion.map(m => [motionKey(m), m]));
      const currMMap = new Map(currMotion.map(m => [motionKey(m), m]));
      currMotion.forEach(m => { if (!prevMMap.has(motionKey(m))) result.added.push({ category: 'motion', name: `${m.target || 'Global'} · ${m.property || '?'}` }); });
      prevMotion.forEach(m => { if (!currMMap.has(motionKey(m))) result.removed.push({ category: 'motion', name: `${m.target || 'Global'} · ${m.property || '?'}` }); });

      return result;
    }

    function comparePropertyLists(prevProps, currProps) {
      const changes = [];
      const keyOf = (p) => `${p.type}:${p.label || p.name || ''}`;
      const prevMap = new Map(prevProps.map(p => [keyOf(p), p]));
      currProps.forEach(p => {
        const key = keyOf(p);
        if (prevMap.has(key)) {
          const before = String(prevMap.get(key).value || '');
          const after = String(p.value || '');
          if (before !== after) {
            changes.push({ type: p.type, label: p.label || p.name, before, after });
          }
        }
      });
      return changes;
    }

    function getInteractiveHTMLContent() {
      const rawName = handoffData.step1.fluxo || "handoff";
      const safeName = rawName.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
      const status = handoffData.step1.status || "Pendente";
      const versao = handoffData.step1.versao || "v1.0.0";
      const autor = handoffData.step1.autor || "Não especificado";
      const validador = handoffData.step1.validador_po || "Não especificado";
      const tags = handoffData.step1.tags || "";

      // High-resolution 2x frame preview base64 conversion
      let framePreviewBase64 = "";
      if (handoffData.step2 && handoffData.step2.specs && handoffData.step2.specs.framePreview) {
        const fp = handoffData.step2.specs.framePreview;
        if (typeof fp === "string") {
          framePreviewBase64 = fp;
        } else if (fp.byteLength) {
          framePreviewBase64 = bytesToBase64(fp);
        } else if (fp.data && Array.isArray(fp.data)) {
          framePreviewBase64 = bytesToBase64(new Uint8Array(fp.data));
        } else if (Array.isArray(fp)) {
          framePreviewBase64 = bytesToBase64(new Uint8Array(fp));
        }
      }

      // Construct flat dynamic variables for tags and links to prevent syntax nesting
      let tagsHTML = "";
      if (tags) {
        const tagSpans = tags.split(',').map(tag => `
          <span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-[9px] font-bold text-slate-500 dark:text-slate-400">${tag.trim()}</span>
        `).join('');
        tagsHTML = `
          <div>
            <span class="text-[9px] font-bold text-slate-400 uppercase block mb-1">Tags</span>
            <div class="flex flex-wrap gap-1">
              ${tagSpans}
            </div>
          </div>
        `;
      }

      const steps = handoffData.step3 || {};
      const excecoes = handoffData.excecoes || [];
      const regras = handoffData.regras || [];
      const uploadedFileNames = (handoffData.step1 && Array.isArray(handoffData.step1.files)) ? handoffData.step1.files : [];

      const protoLink = steps.proto_link || '#';
      const protoTarget = steps.proto_link ? 'target="_blank"' : '';
      const a11yLink = steps.a11y_link || '#';
      const a11yTarget = steps.a11y_link ? 'target="_blank"' : '';
      const researchLink = steps.research_link || '#';
      const researchTarget = steps.research_link ? 'target="_blank"' : '';

      // Type → visual mapping for Cenários de Exceção
      const excecaoTypeMap = {
        "Erro":         { color: "red",    icon: "alert-circle",   label: "Erro" },
        "Aviso":        { color: "amber",  icon: "alert-triangle", label: "Aviso" },
        "Sucesso":      { color: "green",  icon: "check-circle",   label: "Sucesso" },
        "Confirmação":  { color: "orange", icon: "help-circle",    label: "Confirmação" }
      };
      const excecaoTypePalette = {
        red:    { dot: "bg-red-500",    title: "text-red-700 dark:text-red-300",    bg: "bg-red-50/40 dark:bg-red-950/10",    border: "border-red-100 dark:border-red-900/30",    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
        amber:  { dot: "bg-amber-500",  title: "text-amber-700 dark:text-amber-300",bg: "bg-amber-50/40 dark:bg-amber-950/10",border: "border-amber-100 dark:border-amber-900/30",badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
        green:  { dot: "bg-green-500",  title: "text-green-700 dark:text-green-300",bg: "bg-green-50/40 dark:bg-green-950/10",border: "border-green-100 dark:border-green-900/30",badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
        orange: { dot: "bg-orange-500", title: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50/40 dark:bg-orange-950/10", border: "border-orange-100 dark:border-orange-900/30", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" }
      };

      // Accordion HTML builder helper (natively in plugin context)
      function buildAccordionHTML(id, title, icon, content, isExpanded = false) {
        const hiddenClass = isExpanded ? "" : "hidden";
        const rotateClass = isExpanded ? "rotate-180" : "";
        return `
          <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-sm mb-4 overflow-hidden">
            <button onclick="toggleHTMLAccordion('${id}', this)" class="w-full px-5 py-4 bg-slate-50/50 dark:bg-slate-950/20 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between font-black text-slate-800 dark:text-white text-xs uppercase tracking-wider select-none text-left">
              <div class="flex items-center gap-3">
                <div class="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-[#0070af] dark:text-blue-400 shrink-0">
                  <i data-lucide="${icon}" class="w-4 h-4"></i>
                </div>
                <span class="font-black">${title}</span>
              </div>
              <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 transition-transform ${rotateClass}"></i>
            </button>
            <div id="${id}" class="${hiddenClass} p-5 border-t border-slate-100 dark:border-slate-800/80">
              ${content}
            </div>
          </div>
        `;
      }

      // Generate Accordions List (ordem: Objetivo → Briefing → Exceções → Regras → Anexos → Equipe)
      let accordionsHTML = "";

      // 1. Objetivo da Entrega (sempre aberto, primeiro item)
      const objetivoContent = `
        <div class="p-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-slate-800/40 text-left">
          <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${(handoffData.step1.objetivo || "Nenhum objetivo especificado.").replace(/\n/g, '<br>')}</p>
        </div>
      `;
      accordionsHTML += buildAccordionHTML("acc-objetivo", "Objetivo da Entrega", "target", objetivoContent, true);

      // 2. Briefing Estratégico (só renderiza se houver conteúdo)
      const hasBriefing = handoffData.briefing &&
                          handoffData.briefing.enabled &&
                          handoffData.briefing.questions &&
                          handoffData.briefing.questions.some(q => q.answer && q.answer.trim() !== "");

      if (hasBriefing) {
        const briefingContent = `
          <div class="space-y-4 text-left">
            ${handoffData.briefing.questions.filter(q => q.answer && q.answer.trim() !== "").map(q => `
              <div class="p-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-slate-800/40">
                <span class="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-[#0070af] dark:text-blue-400 font-bold text-[9px] uppercase tracking-wide rounded mb-2 inline-block">${q.category || "Geral"}</span>
                <h4 class="text-xs font-black text-slate-800 dark:text-white mb-1.5">${q.question}</h4>
                <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${q.answer.replace(/\n/g, '<br>')}</p>
              </div>
            `).join('')}
          </div>
        `;
        accordionsHTML += buildAccordionHTML("acc-briefing", "Briefing Estratégico", "message-square", briefingContent, false);
      }

      // 3. Cenários de Exceção & Erro (agrupados por tipo)
      let excecoesContent = "";
      if (excecoes.length === 0) {
        excecoesContent = '<p class="text-xs text-slate-400 dark:text-slate-500 font-medium">Nenhum cenário de exceção cadastrado.</p>';
      } else {
        const groups = {};
        excecoes.forEach(e => {
          const t = e.type || "Geral";
          if (!groups[t]) groups[t] = [];
          groups[t].push(e);
        });
        const groupOrder = ["Erro", "Aviso", "Confirmação", "Sucesso"];
        const orderedTypes = Object.keys(groups).sort((a, b) => {
          const ai = groupOrder.indexOf(a); const bi = groupOrder.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        excecoesContent = `<div class="space-y-5 text-left">` + orderedTypes.map(type => {
          const map = excecaoTypeMap[type] || { color: "red", icon: "alert-octagon", label: type };
          const pal = excecaoTypePalette[map.color] || excecaoTypePalette.red;
          const items = groups[type];
          const cards = items.map(e => `
            <div class="p-4 ${pal.bg} border ${pal.border} rounded-xl">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <h4 class="text-xs font-black ${pal.title} flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 ${pal.dot} rounded-full"></span>${e.title}
                </h4>
                <span class="shrink-0 px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide ${pal.badge}">${map.label}</span>
              </div>
              ${e.notes ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1.5">${e.notes.replace(/\n/g, '<br>')}</p>` : ''}
              ${e.link ? `<a href="${e.link}" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-2 hover:underline">Abrir no Figma <i data-lucide="external-link" class="w-2.5 h-2.5"></i></a>` : ''}
            </div>
          `).join('');
          return `
            <div>
              <div class="flex items-center gap-2 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                <i data-lucide="${map.icon}" class="w-3.5 h-3.5"></i>
                <span>${map.label}</span>
                <span class="text-slate-400">·</span>
                <span class="text-slate-400 dark:text-slate-500 font-bold">${items.length}</span>
              </div>
              <div class="space-y-2">${cards}</div>
            </div>
          `;
        }).join('') + `</div>`;
      }
      accordionsHTML += buildAccordionHTML("acc-excecoes", "Cenários de Exceção & Erro", "alert-octagon", excecoesContent, false);

      // 4. Regras de Negócio & HUs
      const regrasContent = `
        <div class="space-y-3 text-left">
          ${regras.length === 0
            ? '<p class="text-xs text-slate-400 dark:text-slate-500 font-medium">Nenhuma regra de negócio cadastrada.</p>'
            : regras.map(r => `
              <div class="p-4 bg-blue-50/10 dark:bg-blue-950/5 border border-blue-100/50 dark:border-blue-900/20 rounded-xl">
                <h4 class="text-xs font-black text-blue-800 dark:text-blue-400 flex items-center gap-1.5"><span class="w-1.5 h-1.5 bg-[#0070af] rounded-full"></span>${r.title || 'Regra de Negócio'}</h4>
                ${r.notes ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1.5">${r.notes.replace(/\n/g, '<br>')}</p>` : ''}
                ${r.link ? `<a href="${r.link}" target="_blank" class="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-2 hover:underline">Ver regras/doc <i data-lucide="external-link" class="w-2.5 h-2.5"></i></a>` : ''}
              </div>
            `).join('')
          }
        </div>
      `;
      accordionsHTML += buildAccordionHTML("acc-regras", "Regras de Negócio & HUs", "shield-alert", regrasContent, false);

      // 4.4 Diff com versão anterior (se houver snapshot prévio)
      var computedDiff = null;
      if (handoffData.previousSnapshot && handoffData.previousSnapshot.scan) {
        computedDiff = computeHandoffDiff(handoffData.previousSnapshot, {
          components: components, icons: icons, typography: typography,
          frames: frames, vectors: vectors,
          states: handoffData.states || [], motion: handoffData.motion || []
        });

        const totalChanges = computedDiff.added.length + computedDiff.removed.length + computedDiff.modified.length;
        if (totalChanges > 0) {
          const prevDt = new Date(handoffData.previousSnapshot.exportedAt);
          const prevFmt = prevDt.toLocaleDateString('pt-BR') + ' às ' + prevDt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const prevVer = handoffData.previousSnapshot.versao || '—';

          const renderItem = (entry, kind) => {
            const colorMap = {
              added:    { bg: 'bg-green-50/40 dark:bg-green-950/10', border: 'border-green-100 dark:border-green-900/30', icon: 'plus-circle', iconColor: 'text-green-600 dark:text-green-400', label: 'Adicionado' },
              removed:  { bg: 'bg-red-50/40 dark:bg-red-950/10',     border: 'border-red-100 dark:border-red-900/30',     icon: 'minus-circle', iconColor: 'text-red-500 dark:text-red-400', label: 'Removido' },
              modified: { bg: 'bg-amber-50/40 dark:bg-amber-950/10', border: 'border-amber-100 dark:border-amber-900/30', icon: 'edit-3', iconColor: 'text-amber-600 dark:text-amber-400', label: 'Modificado' }
            };
            const c = colorMap[kind];
            const changesText = (entry.changes || []).map(ch => `${ch.label || ch.type}: ${ch.before} → ${ch.after}`).join(' · ');
            return `
              <div class="p-3 ${c.bg} border ${c.border} rounded-xl">
                <div class="flex items-start gap-2">
                  <i data-lucide="${c.icon}" class="w-3.5 h-3.5 ${c.iconColor} mt-0.5 shrink-0"></i>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <span class="text-[11px] font-black text-slate-800 dark:text-white">${entry.name}</span>
                      <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${entry.category}</span>
                    </div>
                    ${changesText ? `<p class="text-[10px] text-slate-600 dark:text-slate-400 mt-1 leading-snug font-mono">${changesText}</p>` : ''}
                  </div>
                </div>
              </div>
            `;
          };

          const diffSections = [
            { kind: 'added',    title: 'Adicionados',   items: computedDiff.added },
            { kind: 'modified', title: 'Modificados',   items: computedDiff.modified },
            { kind: 'removed',  title: 'Removidos',     items: computedDiff.removed }
          ].filter(s => s.items.length > 0);

          const diffContent = `
            <div class="text-left space-y-4">
              <div class="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60 rounded-xl text-[10px] text-slate-500 dark:text-slate-400">
                <span class="font-bold text-slate-700 dark:text-slate-300">Comparando com versão ${prevVer}</span> · exportada em ${prevFmt}
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="bg-green-50/40 dark:bg-green-950/10 border border-green-100 dark:border-green-900/30 p-2 rounded-lg text-center">
                  <p class="text-base font-black text-green-700 dark:text-green-400">${computedDiff.added.length}</p>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Adicionados</p>
                </div>
                <div class="bg-amber-50/40 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 p-2 rounded-lg text-center">
                  <p class="text-base font-black text-amber-700 dark:text-amber-400">${computedDiff.modified.length}</p>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Modificados</p>
                </div>
                <div class="bg-red-50/40 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 p-2 rounded-lg text-center">
                  <p class="text-base font-black text-red-700 dark:text-red-400">${computedDiff.removed.length}</p>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Removidos</p>
                </div>
              </div>
              ${diffSections.map(sec => `
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">${sec.title} · ${sec.items.length}</p>
                  <div class="space-y-2">${sec.items.map(it => renderItem(it, sec.kind)).join('')}</div>
                </div>
              `).join('')}
            </div>
          `;
          accordionsHTML += buildAccordionHTML("acc-diff", "Mudanças desde a versão anterior", "history", diffContent, true);
        }
      }

      // 4.5 Estados Interativos & Motion (P3) — só renderiza se houver entradas.
      const statesArr = Array.isArray(handoffData.states) ? handoffData.states : [];
      const motionArr = Array.isArray(handoffData.motion) ? handoffData.motion : [];
      if (statesArr.length > 0 || motionArr.length > 0) {
        const stateColorMap = {
          blue: 'bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30 text-blue-700 dark:text-blue-300',
          indigo: 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30 text-indigo-700 dark:text-indigo-300',
          green: 'bg-green-50 dark:bg-green-950/20 border-green-100 dark:border-green-900/30 text-green-700 dark:text-green-300',
          amber: 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30 text-amber-700 dark:text-amber-300',
          gray: 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/40 text-slate-700 dark:text-slate-300',
          slate: 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/40 text-slate-700 dark:text-slate-300',
          sky: 'bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/30 text-sky-700 dark:text-sky-300',
          emerald: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-300'
        };

        let statesHTML = "";
        if (statesArr.length > 0) {
          statesHTML = `
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Estados Interativos · ${statesArr.length}</p>
              <div class="grid sm:grid-cols-2 gap-3">
                ${statesArr.map(s => `
                  <div class="p-3 border ${stateColorMap[s.color] || stateColorMap.slate} rounded-xl">
                    <div class="flex items-center gap-2 mb-1.5">
                      <i data-lucide="${s.icon || 'circle'}" class="w-3.5 h-3.5"></i>
                      <span class="text-[11px] font-black">${s.state}</span>
                      ${s.target ? `<span class="ml-auto text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate" title="${s.target}">${s.target}</span>` : ''}
                    </div>
                    ${s.description ? `<p class="text-[11px] text-slate-600 dark:text-slate-300 leading-snug mb-1.5">${s.description.replace(/\n/g, '<br>')}</p>` : ''}
                    ${s.link ? `<a href="${s.link}" target="_blank" class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline">Ver no Figma <i data-lucide="external-link" class="w-2.5 h-2.5"></i></a>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }

        let motionHTML = "";
        if (motionArr.length > 0) {
          motionHTML = `
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 mt-${statesArr.length > 0 ? '4' : '0'}">Motion / Transições · ${motionArr.length}</p>
              <div class="space-y-2">
                ${motionArr.map(m => `
                  <div class="p-3 bg-pink-50/40 dark:bg-pink-950/10 border border-pink-100/60 dark:border-pink-900/30 rounded-xl">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-black text-slate-800 dark:text-white">${m.target || 'Global'}</span>
                      ${m.trigger ? `<span class="px-2 py-0.5 bg-white dark:bg-slate-900 border border-pink-100 dark:border-pink-900/40 rounded text-[9px] font-bold text-pink-700 dark:text-pink-300 uppercase tracking-wide">${m.trigger}</span>` : ''}
                    </div>
                    <div class="flex flex-wrap gap-1.5 mb-${m.notes ? '2' : '0'}">
                      ${m.property ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-white dark:bg-slate-900 rounded text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300"><i data-lucide="zap" class="w-2.5 h-2.5"></i>${m.property}</span>` : ''}
                      ${m.duration ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-white dark:bg-slate-900 rounded text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300"><i data-lucide="clock" class="w-2.5 h-2.5"></i>${m.duration}ms</span>` : ''}
                      ${m.easing ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-white dark:bg-slate-900 rounded text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300"><i data-lucide="line-chart" class="w-2.5 h-2.5"></i>${m.easing}</span>` : ''}
                    </div>
                    ${m.notes ? `<p class="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">${m.notes.replace(/\n/g, '<br>')}</p>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }

        const statesMotionContent = `<div class="space-y-4 text-left">${statesHTML}${motionHTML}</div>`;
        accordionsHTML += buildAccordionHTML("acc-states-motion", "Estados & Motion", "zap", statesMotionContent, false);
      }

      // 5. Anexos & Documentos (links externos + arquivos físicos na pasta ./Anexos)
      const hasExternalDocs = !!(steps.proto_link || steps.a11y_link || steps.research_link);
      const hasAttachedFiles = uploadedFileNames.length > 0;
      let anexosContent = "";
      if (!hasExternalDocs && !hasAttachedFiles) {
        anexosContent = '<p class="text-xs text-slate-400 dark:text-slate-500 font-medium">Nenhum anexo ou link adicionado.</p>';
      } else {
        let externalHTML = "";
        if (hasExternalDocs) {
          const docRows = [
            { key: "proto_link",    label: "Protótipo Navegável",      icon: "eye" },
            { key: "a11y_link",     label: "Diretrizes de Acessibilidade", icon: "accessibility" },
            { key: "research_link", label: "UX Research & Insights",   icon: "file-text" }
          ].filter(d => steps[d.key]).map(d => `
            <a href="${steps[d.key]}" target="_blank" class="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/40 rounded-xl hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
              <div class="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-[#0070af] dark:text-blue-400 shrink-0">
                <i data-lucide="${d.icon}" class="w-4 h-4"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-black text-slate-800 dark:text-white truncate">${d.label}</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate">${steps[d.key]}</p>
              </div>
              <i data-lucide="external-link" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
            </a>
          `).join('');
          externalHTML = `
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Links externos</p>
              <div class="space-y-2">${docRows}</div>
            </div>
          `;
        }
        let filesHTML = "";
        if (hasAttachedFiles) {
          const fileRows = uploadedFileNames.map(name => {
            const ext = (name.split('.').pop() || "").toLowerCase();
            let icon = "file";
            if (["pdf"].includes(ext)) icon = "file-text";
            else if (["doc","docx","odt","rtf"].includes(ext)) icon = "file-text";
            else if (["xls","xlsx","csv","ods"].includes(ext)) icon = "table";
            else if (["png","jpg","jpeg","gif","svg","webp"].includes(ext)) icon = "image";
            else if (["zip","rar","7z","tar","gz"].includes(ext)) icon = "archive";
            const safeFile = encodeURIComponent(name);
            return `
              <a href="./Anexos/${safeFile}" target="_blank" class="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/40 rounded-xl hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
                <div class="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <i data-lucide="${icon}" class="w-4 h-4"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-black text-slate-800 dark:text-white truncate">${name}</p>
                  <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate">./Anexos/${name}</p>
                </div>
                <i data-lucide="download" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
              </a>
            `;
          }).join('');
          filesHTML = `
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 mt-${hasExternalDocs ? '4' : '0'}">Arquivos anexados (pasta ./Anexos)</p>
              <div class="space-y-2">${fileRows}</div>
            </div>
          `;
        }
        anexosContent = `<div class="space-y-4 text-left">${externalHTML}${filesHTML}</div>`;
      }
      accordionsHTML += buildAccordionHTML("acc-anexos", "Anexos & Documentos", "paperclip", anexosContent, false);

      // 6. Equipe & Responsáveis
      const equipeContent = `
        <div class="grid sm:grid-cols-2 gap-4 text-left">
          ${(handoffData.step3.team && handoffData.step3.team.length > 0)
            ? handoffData.step3.team.map(m => `
              <div class="flex items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/40 rounded-xl">
                <div class="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-xs shrink-0">${m.name ? m.name.charAt(0).toUpperCase() : '?'}</div>
                <div class="min-w-0 flex-1">
                  <h4 class="text-xs font-black text-slate-800 dark:text-white truncate">${m.name || "Sem Nome"}</h4>
                  <p class="text-[9px] font-bold text-[#0070af] dark:text-blue-400 uppercase tracking-wide mt-0.5">${m.role || "Membro"}</p>
                  ${m.email ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">${m.email}</p>` : ''}
                </div>
              </div>
            `).join('')
            : '<p class="col-span-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center py-4">Nenhum membro da equipe adicionado.</p>'
          }
        </div>
      `;
      accordionsHTML += buildAccordionHTML("acc-equipe", "Equipe & Responsáveis", "users", equipeContent, false);

      // Frame & Elementos Tab content
      let assetsHTML = "";
      if (framePreviewBase64) {
        assetsHTML = `
          <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm text-center">
            <h3 class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-4 text-left flex items-center gap-2">
              <i data-lucide="image" class="w-4 h-4 text-[#0070af]"></i> Preview do Frame Principal (Alta Resolução 2x)
            </h3>
            
            <div class="relative group cursor-zoom-in overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800/60 max-w-3xl mx-auto" onclick="openPreviewModal('Frame Principal', 'data:image/png;base64,${framePreviewBase64}')">
              <img src="data:image/png;base64,${framePreviewBase64}" class="w-full h-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]" alt="Preview do Frame Principal" />
              <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-xs select-none">
                <i data-lucide="zoom-in" class="w-5 h-5"></i> Clique para ampliar
              </div>
            </div>
          </div>
        `;
      } else {
        assetsHTML = `
          <div class="text-center py-12 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80">
            <p class="text-sm font-bold text-slate-400 dark:text-slate-500">Nenhuma imagem de preview do frame disponível.</p>
          </div>
        `;
      }

      // Scanned Elements & Audit
      let scannedHTML = "";
      const specsData = handoffData.step2.specs || {};
      const fileKey = specsData.fileKey || "";
      const components = specsData.components || [];
      const icons = specsData.icons || [];
      const typography = specsData.typography || [];
      const frames = specsData.frames || [];
      const vectors = specsData.vectors || [];

      const scannedItemsCount = components.length + icons.length + typography.length + frames.length + vectors.length;
      const hasScannedItems = scannedItemsCount > 0;

      if (!hasScannedItems) {
        scannedHTML = `
          <div class="text-center py-12 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80">
            <p class="text-sm font-bold text-slate-400 dark:text-slate-500">Nenhum item escaneado ou auditado neste frame.</p>
          </div>
        `;
      } else {
        // Frame-level summary — aggregates counts + libs detected, always visible.
        const allItems = [...components, ...icons, ...typography, ...frames, ...vectors];
        const libsCount = {};
        for (const it of allItems) {
          if (it.matchedIn) libsCount[it.matchedIn] = (libsCount[it.matchedIn] || 0) + 1;
          if (Array.isArray(it.properties)) {
            for (const p of it.properties) {
              if (p.matchedIn) libsCount[p.matchedIn] = (libsCount[p.matchedIn] || 0) + 1;
            }
          }
        }
        const libsSorted = Object.entries(libsCount).sort((a, b) => b[1] - a[1]);
        const libsBadgesHTML = libsSorted.length > 0
          ? libsSorted.map(([name, count]) => `
              <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded-md text-[10px] font-bold text-blue-700 dark:text-blue-300">
                <i data-lucide="library" class="w-2.5 h-2.5"></i>
                ${name}
                <span class="text-blue-400 dark:text-blue-500">(${count})</span>
              </span>
            `).join('')
          : '<span class="text-[10px] text-slate-400 dark:text-slate-500">nenhuma biblioteca DSC detectada</span>';

        const frameSummaryHTML = `
          <div class="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/80 mb-4 text-left">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Resumo do Frame</h4>
              <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500">${scannedItemsCount} elementos</span>
            </div>
            <div class="grid grid-cols-5 gap-2 mb-3">
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${components.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Componentes</p>
              </div>
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${icons.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Ícones</p>
              </div>
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${typography.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Tipografia</p>
              </div>
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${frames.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Frames</p>
              </div>
              <div class="bg-white dark:bg-slate-900 p-2 rounded-lg text-center">
                <p class="text-base font-black text-slate-800 dark:text-white">${vectors.length}</p>
                <p class="text-[8px] font-bold uppercase tracking-wider text-slate-400">Vetores</p>
              </div>
            </div>
            <div>
              <p class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Bibliotecas detectadas</p>
              <div class="flex flex-wrap gap-1.5">${libsBadgesHTML}</div>
            </div>
          </div>
        `;

        // Audit summary
        const auditSummary = handoffData.step2.isAuditEnabled ? getAuditSummary(specsData) : null;
        let auditCardHTML = frameSummaryHTML;
        if (auditSummary) {
          const adoption = auditSummary.adoption;
          const issues = auditSummary.issues;
          const adjustments = auditSummary.adjustments;
          const total = auditSummary.total;
          
          const statusColor = adoption > 90 ? "text-[#10b981]" : (adoption > 70 ? "text-amber-500" : "text-red-500");
          const statusBg = adoption > 90 ? "bg-green-50 dark:bg-green-950/20" : (adoption > 70 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-red-50 dark:bg-red-950/20");
          const borderCol = adoption > 90 ? "border-green-100 dark:border-green-900/30" : (adoption > 70 ? "border-amber-100 dark:border-amber-900/30" : "border-red-100 dark:border-red-900/30");

          auditCardHTML = frameSummaryHTML + `
            <div class="p-5 rounded-2xl ${statusBg} border ${borderCol} mb-6 text-left">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">Relatório de Auditoria DSC</h4>
                  <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Análise automática de conformidade com design tokens corporativos</p>
                </div>
                <div class="text-right">
                  <span class="text-3xl font-black ${statusColor}">${adoption}%</span>
                  <p class="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Aderência (props)</p>
                </div>
              </div>

              <!-- Property-level: granular -->
              <p class="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Propriedades · ${total}</p>
              <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Em conformidade</p>
                  <p class="text-base font-black text-[#10b981]">${auditSummary.dsCount}</p>
                </div>
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Necessita revisão</p>
                  <p class="text-base font-black text-amber-500">${adjustments.length}</p>
                </div>
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Fora do padrão</p>
                  <p class="text-base font-black text-red-500">${issues.length}</p>
                </div>
              </div>

              <!-- Element-level: worst-of rule -->
              <p class="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Elementos · ${auditSummary.elementsTotal} <span class="text-slate-400 dark:text-slate-500 font-bold normal-case tracking-normal ml-1">(classificação pelo pior caso)</span></p>
              <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">100% conformes</p>
                  <p class="text-base font-black text-[#10b981]">${auditSummary.elementsOk}</p>
                </div>
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Com revisões</p>
                  <p class="text-base font-black text-amber-500">${auditSummary.elementsWarning}</p>
                </div>
                <div class="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl">
                  <p class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Com violações</p>
                  <p class="text-base font-black text-red-500">${auditSummary.elementsError}</p>
                </div>
              </div>

              <div class="bg-white/40 dark:bg-black/10 p-3 rounded-xl">
                <p class="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Como o elemento é classificado</p>
                <div class="space-y-1.5">
                  <div class="flex items-start gap-2 text-[10px]">
                    <span class="shrink-0 px-2 py-0.5 rounded-md bg-green-50 dark:bg-green-950/40 text-[#10b981] font-bold text-[8px] uppercase tracking-wide">Em conformidade</span>
                    <span class="text-slate-500 dark:text-slate-400 leading-snug"><strong class="text-slate-700 dark:text-slate-300">Todas</strong> as propriedades têm vínculo direto com tokens da DSC.</span>
                  </div>
                  <div class="flex items-start gap-2 text-[10px]">
                    <span class="shrink-0 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-500 font-bold text-[8px] uppercase tracking-wide">Necessita revisão</span>
                    <span class="text-slate-500 dark:text-slate-400 leading-snug font-medium">Pelo menos 1 prop bate por valor/nome (não pela key) — token foi reproduzido manualmente.</span>
                  </div>
                  <div class="flex items-start gap-2 text-[10px]">
                    <span class="shrink-0 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/40 text-red-500 font-bold text-[8px] uppercase tracking-wide">Fora do padrão</span>
                    <span class="text-slate-500 dark:text-slate-400 leading-snug">Pelo menos 1 prop <strong class="text-slate-700 dark:text-slate-300">não corresponde</strong> a nenhum token da DSC.</span>
                  </div>
                </div>
              </div>
            </div>
          `;
        }

        const sectionsData = [
          { title: "Componentes", items: components, icon: "box", type: "components" },
          { title: "Ícones", items: icons, icon: "image", type: "icons" },
          { title: "Tipografia", items: typography, icon: "type", type: "typography" },
          { title: "Frames e Layouts", items: frames, icon: "layout", type: "frames" },
          { title: "Vetores", items: vectors, icon: "pen-tool", type: "vectors" }
        ];

        const scannedSectionsHTML = sectionsData.map((sec, secIndex) => {
          if (!sec.items || sec.items.length === 0) return "";
          
          const itemsHTML = sec.items.map(item => {
            // Preview base64
            let previewHTML = "";
            let base64 = "";
            if (item.preview) {
              if (typeof item.preview === "string") {
                base64 = item.preview;
              } else if (item.preview.byteLength) {
                base64 = bytesToBase64(item.preview);
              } else if (item.preview.data && Array.isArray(item.preview.data)) {
                base64 = bytesToBase64(new Uint8Array(item.preview.data));
              } else if (Array.isArray(item.preview)) {
                base64 = bytesToBase64(new Uint8Array(item.preview));
              }
              if (base64) {
                previewHTML = `
                  <div class="relative group cursor-zoom-in overflow-hidden rounded border border-slate-100 dark:border-slate-800 shrink-0 w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-850" onclick="openPreviewModal('${item.name.replace(/'/g, "\\'")}', 'data:image/png;base64,${base64}')">
                    <img src="data:image/png;base64,${base64}" class="w-full h-full object-contain p-1 transition-transform duration-250 group-hover:scale-110" />
                    <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <i data-lucide="zoom-in" class="w-3 h-3"></i>
                    </div>
                  </div>
                `;
              }
            }
            if (!previewHTML) {
              previewHTML = `<div class="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-800 rounded text-slate-300 dark:text-slate-600"><i data-lucide="${sec.icon}" class="w-4 h-4"></i></div>`;
            }

            // Audit badge + property breakdown ("12 props · 11 ok · 1 fora do padrão")
            let badgeHTML = "";
            if (handoffData.step2.isAuditEnabled) {
              const status = computeItemAuditStatus(item);
              const b = getItemAuditBreakdown(item);
              const breakdownChips = b.total > 0
                ? `<span class="inline-flex items-center gap-1.5 text-[8px] font-bold text-slate-500 dark:text-slate-400 normal-case tracking-normal ml-1.5">
                    <span class="text-slate-400 dark:text-slate-500">${b.total} props</span>
                    ${b.ok > 0 ? `<span class="inline-flex items-center gap-0.5 text-[#10b981]"><i data-lucide="check" class="w-2.5 h-2.5"></i>${b.ok}</span>` : ''}
                    ${b.warning > 0 ? `<span class="inline-flex items-center gap-0.5 text-amber-500"><i data-lucide="alert-triangle" class="w-2.5 h-2.5"></i>${b.warning}</span>` : ''}
                    ${b.error > 0 ? `<span class="inline-flex items-center gap-0.5 text-red-500"><i data-lucide="x" class="w-2.5 h-2.5"></i>${b.error}</span>` : ''}
                  </span>`
                : '';

              if (status === "ok") {
                badgeHTML = `<span class="inline-flex items-center gap-1 text-[#10b981] font-bold"><i data-lucide="check-circle" class="w-2.5 h-2.5"></i>EM CONFORMIDADE</span>${breakdownChips}`;
              } else if (status === "warning") {
                badgeHTML = `<span class="inline-flex items-center gap-1 text-amber-500 font-bold"><i data-lucide="help-circle" class="w-2.5 h-2.5"></i>NECESSITA REVISÃO</span>${breakdownChips}`;
              } else {
                badgeHTML = `<span class="inline-flex items-center gap-1 text-red-400 font-bold"><i data-lucide="alert-circle" class="w-2.5 h-2.5"></i>FORA DO PADRÃO</span>${breakdownChips}`;
              }
            }

            // Figma Deep Link
            const figmaLink = (fileKey && item.nodeId)
              ? `https://www.figma.com/design/${fileKey}/?node-id=${item.nodeId.replace(/:/g, '-')}`
              : "";
            
            let figmaLinkHTML = "";
            if (figmaLink) {
              figmaLinkHTML = `
                <a href="${figmaLink}" target="_blank" title="Focar este elemento no Figma" class="text-slate-400 hover:text-blue-500 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer ml-auto flex items-center justify-center">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                </a>
              `;
            }

            // Variants as pills in card header — most useful info for dev to replicate.
            let variantsHTML = "";
            if (Array.isArray(item.variants) && item.variants.length > 0) {
              variantsHTML = `
                <div class="flex flex-wrap gap-1 mt-1.5 mb-1">
                  ${item.variants.map(v => `
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[9px] font-bold text-slate-600 dark:text-slate-300">
                      <span class="text-slate-400 dark:text-slate-500">${v.name}:</span>
                      <span>${v.value}</span>
                    </span>
                  `).join('')}
                </div>
              `;
            }

            // Lib origin (when matched against a DSC lib) + Code Connect mapping
            let libOriginHTML = "";
            if (item.matchedIn) {
              const codeMappings = (typeof window !== 'undefined' && window.__HANDEX_CODE_MAPPINGS__) || null;
              const libMap = codeMappings && codeMappings.libraries && codeMappings.libraries[item.matchedIn];
              const override = codeMappings && codeMappings.componentOverrides && item.componentKey ? codeMappings.componentOverrides[item.componentKey] : null;
              const codeImport = (override && override.import) || (libMap && libMap.import) || null;
              const docsHref = (override && override.docs) || (libMap && libMap.docs) || null;
              libOriginHTML = `
                <span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  <span class="inline-flex items-center gap-1"><i data-lucide="library" class="w-2.5 h-2.5"></i>${item.matchedIn}${item.matchedTokenName && item.matchedTokenName !== item.name ? ` · ${item.matchedTokenName}` : ''}</span>
                  ${codeImport ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded font-mono text-[9px]" title="Importe deste pacote no código"><i data-lucide="code-2" class="w-2.5 h-2.5"></i>${codeImport}</span>` : ''}
                  ${docsHref ? `<a href="${docsHref}" target="_blank" class="inline-flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-blue-500 transition-colors"><i data-lucide="book-open" class="w-2.5 h-2.5"></i>docs</a>` : ''}
                </span>
              `;
            }

            // Properties — grouped by type, violations sorted first within each group.
            let propertiesHTML = "";
            const propsForCard = (item.properties || []).filter(p => p.type !== "variant");
            if (propsForCard.length > 0) {
              const groupDefs = [
                { key: "colors",     title: "Cores",        icon: "palette",          types: ["color", "stroke"] },
                { key: "typography", title: "Tipografia",   icon: "type",             types: ["typography", "fontSize", "fontFamily", "fontWeight", "lineHeight", "letterSpacing"] },
                { key: "spacing",    title: "Espaçamento",  icon: "move-horizontal",  types: ["spacing", "padding", "gap"] },
                { key: "border",     title: "Borda & raio", icon: "square",           types: ["strokeWeight", "strokeWidth", "radius", "cornerRadius"] },
                { key: "layout",     title: "Layout",       icon: "layout-dashboard", types: ["layout", "direction", "alignment", "size"] },
                { key: "effect",     title: "Efeitos",      icon: "sparkles",         types: ["effect"] }
              ];

              const sortByStatus = (a, b) => {
                const rank = (x) => x.isDS === true ? 2 : x.isDS === "warning" ? 1 : 0;
                return rank(a) - rank(b);
              };

              const groups = groupDefs.map(g => ({
                ...g,
                items: propsForCard.filter(p => g.types.includes(p.type)).sort(sortByStatus)
              })).filter(g => g.items.length > 0);

              // Catch-all for unknown types
              const known = new Set(groupDefs.flatMap(g => g.types));
              const others = propsForCard.filter(p => !known.has(p.type)).sort(sortByStatus);
              if (others.length > 0) groups.push({ key: "other", title: "Outros", icon: "circle", items: others });

              const renderProp = (p) => {
                let pStatusHTML = "";
                if (handoffData.step2.isAuditEnabled) {
                  if (p.isDS === true) {
                    pStatusHTML = `<span class="text-[#10b981] shrink-0" title="Em conformidade"><i data-lucide="check" class="w-3.5 h-3.5"></i></span>`;
                  } else if (p.isDS === "warning") {
                    pStatusHTML = `<span class="text-amber-500 shrink-0" title="Necessita revisão"><i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i></span>`;
                  } else {
                    pStatusHTML = `<span class="text-red-400 shrink-0" title="Fora do padrão"><i data-lucide="x" class="w-3.5 h-3.5"></i></span>`;
                  }
                }

                const isColor = (p.type === "color" || p.type === "stroke") && p.value && p.value.startsWith("#");
                const pColorPreview = isColor
                  ? `<div class="w-3.5 h-3.5 rounded-full border border-slate-200 dark:border-slate-700 inline-block align-middle" style="background-color: ${p.value}"></div>`
                  : `<i data-lucide="circle" class="w-3 h-3 text-slate-300 dark:text-slate-600"></i>`;

                // Token name + lib origin line (only when matched)
                let tokenLineHTML = "";
                if (p.matchedTokenName && handoffData.step2.isAuditEnabled) {
                  tokenLineHTML = `
                    <div class="flex items-center gap-1 text-[9px] text-blue-600 dark:text-blue-400 font-bold mt-0.5 ml-5.5">
                      <i data-lucide="link-2" class="w-2.5 h-2.5"></i>
                      <span class="truncate" title="Token: ${p.matchedTokenName}${p.matchedIn ? ' · ' + p.matchedIn : ''}">
                        ${p.matchedTokenName}${p.matchedIn ? ` <span class="text-slate-400 dark:text-slate-500">· ${p.matchedIn}</span>` : ''}
                      </span>
                    </div>
                  `;
                }

                // Closest match suggestion (only when fora do padrão)
                let closestHTML = "";
                if (p.closestMatch && handoffData.step2.isAuditEnabled && p.isDS === false) {
                  const cm = p.closestMatch;
                  closestHTML = `
                    <div class="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 font-bold mt-0.5 ml-5.5">
                      <i data-lucide="lightbulb" class="w-2.5 h-2.5"></i>
                      <span class="truncate" title="Sugestão de match mais próximo">
                        Mais próximo: ${cm.tokenName || cm.value}
                        ${cm.similarity !== undefined ? ` <span class="text-slate-400 dark:text-slate-500">(${cm.similarity}%)</span>` : ''}
                        ${cm.library ? ` <span class="text-slate-400 dark:text-slate-500">· ${cm.library}</span>` : ''}
                      </span>
                    </div>
                  `;
                }

                return `
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2 truncate min-w-0" title="${p.name}">
                        <div class="w-3.5 h-3.5 flex items-center justify-center shrink-0">${pColorPreview}</div>
                        <span class="truncate">${p.label || p.type}: <span class="font-bold text-slate-700 dark:text-slate-200">${p.value}</span></span>
                      </div>
                      ${pStatusHTML}
                    </div>
                    ${tokenLineHTML}
                    ${closestHTML}
                  </div>
                `;
              };

              propertiesHTML = `<div class="mt-3 border-t border-slate-100 dark:border-slate-800 pt-2.5 text-left space-y-3">`
                + groups.map(g => `
                  <div>
                    <div class="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">
                      <i data-lucide="${g.icon}" class="w-3 h-3"></i>
                      <span>${g.title}</span>
                      <span class="text-slate-300 dark:text-slate-600">·</span>
                      <span>${g.items.length}</span>
                    </div>
                    <div class="space-y-1.5">
                      ${g.items.map(renderProp).join('')}
                    </div>
                  </div>
                `).join('')
                + `</div>`;
            }

            return `
              <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-xl shadow-sm p-4 hover:shadow-md transition-all scanned-element-card text-left" data-element-name="${item.name.toLowerCase()}">
                <div class="flex items-start gap-3 mb-2 text-left">
                  ${previewHTML}
                  <div class="flex-1 min-w-0">
                    <span class="font-extrabold text-slate-800 dark:text-white text-xs truncate block" title="${item.name}">${item.name}</span>
                    ${libOriginHTML}
                    ${variantsHTML}
                    <div class="text-[8px] uppercase tracking-wider font-bold mt-1">
                      ${badgeHTML}
                    </div>
                  </div>
                  ${figmaLinkHTML}
                </div>
                ${propertiesHTML}
              </div>
            `;
          }).join('');

          const count = sec.items.length;
          const gridId = `grid-html-${secIndex}`;

          return `
            <div class="scanned-section-container bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-sm mb-6 overflow-hidden">
              <button onclick="toggleHTMLAccordion('${gridId}', this)" class="w-full px-5 py-4 bg-slate-50/50 dark:bg-slate-950/20 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between font-black text-slate-800 dark:text-white text-xs uppercase tracking-wider select-none text-left">
                <div class="flex items-center gap-3">
                  <div class="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-[#0070af] dark:text-blue-400 shrink-0">
                    <i data-lucide="${sec.icon}" class="w-4 h-4"></i>
                  </div>
                  <div>
                    <span class="font-black">${sec.title}</span>
                    <span class="section-count-span text-[9px] font-bold text-slate-400 dark:text-slate-500 ml-1.5 uppercase tracking-wide">(${count} elementos)</span>
                  </div>
                </div>
                <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 transition-transform"></i>
              </button>

              <div id="${gridId}" class="hidden p-5 border-t border-slate-100 dark:border-slate-800/80">
                <div class="grid sm:grid-cols-2 gap-4">
                  ${itemsHTML}
                </div>
              </div>
            </div>
          `;
        }).join('');

        scannedHTML = `
          <div class="space-y-4">
            ${auditCardHTML}
            ${scannedSectionsHTML}
          </div>
        `;
      }

      // Structured payload for "Exportar JSON" — stripped of preview base64
      // so devs can consume the audit data in their pipeline without dragging
      // 30 MB of inline PNGs.
      const stripPreview = (item) => {
        const { preview, ...rest } = item || {};
        return rest;
      };
      const scanPayload = {
        project: {
          name: handoffData.step1.fluxo || null,
          designer: autor,
          status: status,
          versao: versao,
          generatedAt: new Date().toISOString(),
          tags: handoffData.step1.tags || null
        },
        audit: {
          enabled: !!handoffData.step2.isAuditEnabled,
          librariesUsed: (function () {
            const m = {};
            const all = [...components, ...icons, ...typography, ...frames, ...vectors];
            for (const it of all) {
              if (it.matchedIn) m[it.matchedIn] = (m[it.matchedIn] || 0) + 1;
              if (Array.isArray(it.properties)) {
                for (const p of it.properties) if (p.matchedIn) m[p.matchedIn] = (m[p.matchedIn] || 0) + 1;
              }
            }
            return m;
          })(),
          referenceBundle: handoffData.step2.auditAutoBundle ? {
            generatedAt: handoffData.step2.auditAutoBundle.generatedAt,
            libraries: handoffData.step2.auditAutoBundle.libraries.map(l => ({
              slug: l.slug,
              libraryName: l.meta && l.meta.libraryName,
              fileKey: l.meta && l.meta.figmaFileKey,
              styleCount: (l.styleTokens.colors.length + l.styleTokens.typography.length + l.styleTokens.effects.length),
              componentCount: (l.components || []).length,
              variableCount: (l.designTokens.variables || []).length,
              available: !(l._stats && l._stats.libNotAvailable)
            }))
          } : null
        },
        scan: {
          fileKey: specsData.fileKey || null,
          components: components.map(stripPreview),
          icons: icons.map(stripPreview),
          typography: typography.map(stripPreview),
          frames: frames.map(stripPreview),
          vectors: vectors.map(stripPreview)
        },
        interactiveStates: handoffData.states || [],
        motion: handoffData.motion || [],
        diff: typeof computedDiff !== 'undefined' ? computedDiff : null
      };
      // Escape any closing-script sequence so the JSON can't terminate the
      // surrounding tag when embedded inline.
      const scanPayloadLiteral = JSON.stringify(scanPayload).replace(/<\/script/gi, '<\\/script');

      // Search bar HTML
      const searchBarHTML = `
        <div class="mb-6">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              <i data-lucide="search" class="w-4 h-4"></i>
            </div>
            <input type="text" id="scanned-search" oninput="filterElements(this.value)" placeholder="Buscar elemento escaneado..." class="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm" />
          </div>
        </div>
      `;

      const fullHTML = `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Handex Handoff - ${handoffData.step1.fluxo || 'Documento'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/lucide@latest"><\/script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
          }
        }
      }
    }
  <\/script>
  <style>
    body {
      font-family: 'Inter', sans-serif;
    }
    .bg-grid {
      background-size: 20px 20px;
      background-image: linear-gradient(to right, rgba(148, 163, 184, 0.05) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
    }
    .dark .bg-grid {
      background-size: 20px 20px;
      background-image: linear-gradient(to right, rgba(51, 65, 85, 0.15) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(51, 65, 85, 0.15) 1px, transparent 1px);
    }
  </style>
</head>
<body class="bg-slate-50 dark:bg-[#090d16] bg-grid text-slate-800 dark:text-slate-100 min-h-screen transition-colors duration-200">
  <header class="sticky top-0 z-50 bg-white/80 dark:bg-[#0f1626]/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/80 px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631" class="h-7 w-auto shrink-0" aria-label="CAIXA">
        <g transform="translate(-284.78446,-475.51214)">
          <g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)">
            <g transform="scale(0.24,0.24)">
              <path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
            </g>
          </g>
        </g>
      </svg>
      <span class="text-slate-300 dark:text-slate-700 font-bold text-sm">|</span>
      <div>
        <h1 class="text-sm font-black text-slate-900 dark:text-white tracking-[0.15em] uppercase">Handex</h1>
        <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Portal Handoff Desacoplado</p>
      </div>
    </div>
    
    <div class="flex items-center gap-3">
      <span class="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">${versao}</span>
      <span class="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-[#0070af] dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 rounded-full text-[10px] font-extrabold uppercase tracking-wider">${status}</span>
      
      <button onclick="downloadJSON()" title="Baixa o JSON estruturado do scan (sem previews) para uso em pipeline de dev" class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3M13 15h3M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" /></svg>
        <span>Exportar JSON</span>
      </button>

      <button onclick="downloadSelf()" class="flex items-center gap-1.5 px-3 py-1.5 bg-[#0070af] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        <span>Gerar Ficha Técnica</span>
      </button>

      <button onclick="toggleTheme()" class="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer">
        <svg id="sun-icon" class="w-4 h-4 text-amber-500 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
        <svg id="moon-icon" class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      </button>
    </div>
  </header>

  <div class="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-4 gap-8">
    <aside class="md:col-span-1 space-y-6">
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 p-5 shadow-sm space-y-4 text-left">
        <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest pb-2 border-b border-slate-100 dark:border-slate-800/60">Especificações</h2>
        
        <div>
          <span class="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Título do Projeto</span>
          <span class="text-sm font-bold text-slate-800 dark:text-white">${handoffData.step1.fluxo || "Não especificado"}</span>
        </div>

        <div>
          <span class="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Designer Responsável</span>
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 block">${autor}</span>
        </div>

        <div>
          <span class="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Data de Publicação</span>
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 block">${new Date().toLocaleDateString('pt-BR')}</span>
        </div>

        ${tagsHTML}
      </div>

      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 p-5 shadow-sm space-y-3.5 text-left">
        <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest pb-2 border-b border-slate-100 dark:border-slate-800/60">Links do Projeto</h2>
        
        <a href="${protoLink}" ${protoTarget} class="flex items-center gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          Protótipo Navegável
        </a>

        <a href="${a11yLink}" ${a11yTarget} class="flex items-center gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 01-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          Diretrizes Acessibilidade
        </a>

        <a href="${researchLink}" ${researchTarget} class="flex items-center gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          UX Research & Insights
        </a>
      </div>
    </aside>

    <main class="md:col-span-3 space-y-6">
      <div class="flex border-b border-slate-100 dark:border-slate-800/80 gap-6 overflow-x-auto pb-1">
        <button onclick="switchTab('tab-document')" id="btn-tab-document" class="tab-btn px-1 pb-3 text-sm font-black border-b-2 border-blue-500 text-blue-500 focus:outline-none transition-all uppercase tracking-wider whitespace-nowrap shrink-0">
          📑 Ficha Técnica
        </button>
        <button onclick="switchTab('tab-assets')" id="btn-tab-assets" class="tab-btn px-1 pb-3 text-sm font-extrabold text-slate-400 dark:text-slate-500 border-b-2 border-transparent hover:text-slate-700 dark:hover:text-slate-300 focus:outline-none transition-all uppercase tracking-wider whitespace-nowrap shrink-0">
          🖼️ Frame & Elementos
        </button>
        <button onclick="switchTab('tab-scanned')" id="btn-tab-scanned" class="tab-btn px-1 pb-3 text-sm font-extrabold text-slate-400 dark:text-slate-500 border-b-2 border-transparent hover:text-slate-700 dark:hover:text-slate-300 focus:outline-none transition-all uppercase tracking-wider whitespace-nowrap shrink-0">
          🔍 Elementos Escaneados (${scannedItemsCount})
        </button>
      </div>

      <div id="tab-document" class="tab-panel animate-in fade-in duration-300 space-y-4">
        ${accordionsHTML}
      </div>

      <div id="tab-assets" class="tab-panel hidden animate-in fade-in duration-300">
        ${assetsHTML}
      </div>

      <div id="tab-scanned" class="tab-panel hidden animate-in fade-in duration-300">
        ${searchBarHTML}
        ${scannedHTML}
      </div>
    </main>
  </div>

  <footer class="mt-16 py-8 border-t border-slate-100 dark:border-slate-800/80 text-center text-slate-400 dark:text-slate-600">
    <p class="text-[10px] font-bold uppercase tracking-wider">Handex ecosystem • Design Ops Automação Handoff</p>
    <p class="text-[9px] mt-1">Gerado automaticamente pelo plugin Handex no Figma</p>
  </footer>

  <!-- Lightbox Modal -->
  <div id="preview-modal" class="fixed inset-0 z-[100] hidden bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300 opacity-0" onclick="closePreviewModal()">
    <button onclick="closePreviewModal()" class="absolute top-6 right-6 text-white hover:text-red-400 transition-colors p-2 rounded-full hover:bg-white/10 shrink-0 cursor-pointer" aria-label="Fechar zoom">
      <i data-lucide="x" class="w-6 h-6"></i>
    </button>
    <div class="max-w-5xl max-h-[85vh] flex flex-col items-center gap-4" onclick="event.stopPropagation()">
      <h3 id="modal-image-title" class="text-white text-xs font-black uppercase tracking-widest text-center"></h3>
      <div class="relative overflow-auto rounded-xl max-w-full max-h-[75vh] border border-slate-850">
        <img id="modal-image-img" src="" class="max-w-full h-auto object-contain rounded-lg shadow-2xl" />
      </div>
    </div>
  </div>

  <script>
    if (typeof window.lucide !== 'undefined') {
      window.lucide.createIcons();
    }

    function toggleTheme() {
      const html = document.documentElement;
      const sun = document.getElementById("sun-icon");
      const moon = document.getElementById("moon-icon");
      
      if (html.classList.contains("dark")) {
        html.classList.remove("dark");
        sun.classList.remove("hidden");
        moon.classList.add("hidden");
      } else {
        html.classList.add("dark");
        sun.classList.add("hidden");
        moon.classList.remove("hidden");
      }
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-panel').forEach(function(panel) { panel.classList.add('hidden'); });
      document.getElementById(tabId).classList.remove('hidden');

      document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.classList.remove('text-blue-500', 'border-blue-500', 'font-black');
        btn.classList.add('text-slate-400', 'dark:text-slate-500', 'border-transparent', 'font-extrabold');
      });

      var activeBtn = document.getElementById('btn-' + tabId);
      if (activeBtn) {
        activeBtn.classList.remove('text-slate-400', 'dark:text-slate-500', 'border-transparent', 'font-extrabold');
        activeBtn.classList.add('text-blue-500', 'border-blue-500', 'font-black');
      }
    }

    function toggleHTMLAccordion(gridId, btn) {
      var grid = document.getElementById(gridId);
      var chevron = btn.querySelector('.lucide-chevron-down');
      if (grid) {
        var isHidden = grid.classList.contains('hidden');
        if (isHidden) {
          grid.classList.remove('hidden');
          if (chevron) chevron.classList.add('rotate-180');
        } else {
          grid.classList.add('hidden');
          if (chevron) chevron.classList.remove('rotate-180');
        }
      }
    }

    function openPreviewModal(title, imgSrc) {
      var modal = document.getElementById("preview-modal");
      var mTitle = document.getElementById("modal-image-title");
      var mImg = document.getElementById("modal-image-img");
      if (modal && mTitle && mImg) {
        mTitle.textContent = title;
        mImg.src = imgSrc;
        modal.classList.remove("hidden");
        setTimeout(function() {
          modal.classList.remove("opacity-0");
        }, 10);
      }
    }

    function closePreviewModal() {
      var modal = document.getElementById("preview-modal");
      if (modal) {
        modal.classList.add("opacity-0");
        setTimeout(function() {
          modal.classList.add("hidden");
        }, 300);
      }
    }

    function filterElements(query) {
      var lowerQuery = query.toLowerCase().trim();
      var sections = document.querySelectorAll('.scanned-section-container');
      
      sections.forEach(function(sec) {
        var cards = sec.querySelectorAll('.scanned-element-card');
        var visibleCount = 0;
        
        cards.forEach(function(card) {
          var name = card.getAttribute('data-element-name') || '';
          if (name.indexOf(lowerQuery) !== -1) {
            card.classList.remove('hidden');
            visibleCount++;
          } else {
            card.classList.add('hidden');
          }
        });
        
        // Update section count header
        var countSpan = sec.querySelector('.section-count-span');
        if (countSpan) {
          countSpan.textContent = '(' + visibleCount + ' elementos)';
        }
        
        // Hide/show the section itself based on count
        if (visibleCount === 0 && lowerQuery !== '') {
          sec.classList.add('hidden');
        } else {
          sec.classList.remove('hidden');
        }
      });
    }

    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        closePreviewModal();
      }
    });

    function downloadSelf() {
      const baseName = "${safeName}";
      const htmlContent = "<!DOCTYPE html>\\n" + document.documentElement.outerHTML;
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "handoff_" + baseName + "_visualizador.html";
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }

    // Structured scan data (sem previews base64) — pronto para pipeline de dev.
    window.__HANDEX_SCAN_PAYLOAD__ = ${scanPayloadLiteral};

    function downloadJSON() {
      const baseName = "${safeName}";
      const payload = window.__HANDEX_SCAN_PAYLOAD__ || {};
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = baseName + "_scan.json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }
  <\/script>
</body>
</html>`;

      return fullHTML;
    }

