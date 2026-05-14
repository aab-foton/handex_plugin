# Tabulação (Tab Order) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar aba "Tabulação" ao plugin com lista ordenada de focos de teclado, save/restore persistente e preenchimento opcional de specs no template.

**Architecture:** A UI gerencia `tabOrderData[]` (estado local). O `code.ts` provê o handler `get-tab-selection` para capturar nós selecionados com coordenadas relativas. Save/restore segue exatamente o mesmo padrão de `areas_toque` — incluído nos 3 locais de `setPluginData` e no `setup-ui`. Área de toque e tabulação são contextos completamente separados — sem interdependência de código ou estado. Specs de tabulação são preenchidas se o container `"tab order"` existir no template; caso contrário, pula silenciosamente. Preview visual (imageFrame) para tabulação não está previsto nesta iteração — será tratado quando o template tiver o frame correspondente.

**Tech Stack:** TypeScript (Figma Plugin API), HTML/CSS/JS vanilla, sem build extra.

---

## Arquivos modificados

| Arquivo | O que muda |
|---------|------------|
| `code.ts` | +handler `get-tab-selection`; +`tab_order` nos 3 saves + default + setup-ui; +specs tab order (silencioso se template não tiver o nó) |
| `ui.html` | +aba Tabulação + panel HTML; +CSS cards de tabulação; +estado `tabOrderData`; +funções render/add/remove/move/rename; +handler `tab-items-ready`; +restore no setup-ui; +payload run-handoff; +pill no summary |

---

## Task 1: code.ts — handler `get-tab-selection`

**Files:**
- Modify: `code.ts` (inserir após o handler `deactivate-variation`, ~linha 410)

- [ ] **Step 1: Adicionar handler `get-tab-selection`**

Inserir após o bloco `else if (msg.type === 'deactivate-variation')` (busca a linha com `deactivate-variation` para encontrar o ponto exato):

```typescript
  else if (msg.type === 'get-tab-selection') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const selection = figma.currentPage.selection;
    const comp = componentePrincipalAtivo;
    const compX = comp.absoluteTransform[0][2];
    const compY = comp.absoluteTransform[1][2];

    const items = selection
      .filter(n => n.id !== comp.id && n.id !== handoffAtivo?.id)
      .map(n => ({
        layerName: n.name,
        nodeId: n.id,
        relX: Math.round(n.absoluteTransform[0][2] - compX),
        relY: Math.round(n.absoluteTransform[1][2] - compY),
        width: Math.round((n as FrameNode).width  ?? 0),
        height: Math.round((n as FrameNode).height ?? 0),
      }));

    figma.ui.postMessage({ type: 'tab-items-ready', items });
  }
```

- [ ] **Step 2: Verificar compilação**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff" && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff"
git add code.ts
git commit -m "feat(tabulacao): handler get-tab-selection no code.ts"
```

---

## Task 2: code.ts — persistência (save + load)

**Files:**
- Modify: `code.ts` (3 blocos `setPluginData` ~linhas 369, 384, 397; default em `carregarDadosEEnviarParaUI` ~linha 719)

- [ ] **Step 1: Adicionar `tab_order` ao default de `componentData`**

Na função `carregarDadosEEnviarParaUI` (~linha 719), alterar:

```typescript
// ANTES
let componentData: any = { plataformas: [], zoom: [], mapeamentos: [], areas_toque: [], sem_toque: false };

// DEPOIS
let componentData: any = { plataformas: [], zoom: [], mapeamentos: [], areas_toque: [], sem_toque: false, tab_order: [] };
```

- [ ] **Step 2: Adicionar `tab_order` nos 3 blocos de save**

Os 3 blocos de save no handler `run-handoff` têm a mesma estrutura. Em cada um deles, adicionar `tab_order: msg.tab_order || []` após `variacoes`:

**Bloco 1** (~linha 369 — save no `dbInstance`):
```typescript
// ANTES
      const dataToSave = JSON.stringify({
        plataformas: msg.plataformas,
        zoom: msg.zoom,
        mapeamentos: msg.mapeamentos,
        areas_toque: msg.areas_toque || [],
        sem_toque: msg.sem_toque || false,
        variacoes: msg.variacoes || [],
      });
      dbInstance.setPluginData("a11y-component-data", dataToSave);

// DEPOIS
      const dataToSave = JSON.stringify({
        plataformas: msg.plataformas,
        zoom: msg.zoom,
        mapeamentos: msg.mapeamentos,
        areas_toque: msg.areas_toque || [],
        sem_toque: msg.sem_toque || false,
        variacoes: msg.variacoes || [],
        tab_order: msg.tab_order || [],
      });
      dbInstance.setPluginData("a11y-component-data", dataToSave);
```

**Bloco 2** (~linha 384 — save no `dataNode`):
```typescript
// ANTES
        const dataToSave = JSON.stringify({
          plataformas: msg.plataformas,
          zoom: msg.zoom,
          mapeamentos: msg.mapeamentos,
          areas_toque: msg.areas_toque || [],
          sem_toque: msg.sem_toque || false,
          variacoes: msg.variacoes || [],
        });
        dataNode.setPluginData('a11y-component-data', dataToSave);

// DEPOIS
        const dataToSave = JSON.stringify({
          plataformas: msg.plataformas,
          zoom: msg.zoom,
          mapeamentos: msg.mapeamentos,
          areas_toque: msg.areas_toque || [],
          sem_toque: msg.sem_toque || false,
          variacoes: msg.variacoes || [],
          tab_order: msg.tab_order || [],
        });
        dataNode.setPluginData('a11y-component-data', dataToSave);
```

**Bloco 3** (~linha 397 — save direto no `workingFrame`):
```typescript
// ANTES
    const dataToSaveDirect = JSON.stringify({
      plataformas: msg.plataformas,
      zoom: msg.zoom,
      mapeamentos: msg.mapeamentos,
      areas_toque: msg.areas_toque || [],
      sem_toque: msg.sem_toque || false,
      variacoes: msg.variacoes || [],
    });
    workingFrame.setPluginData("a11y-component-data", dataToSaveDirect);

// DEPOIS
    const dataToSaveDirect = JSON.stringify({
      plataformas: msg.plataformas,
      zoom: msg.zoom,
      mapeamentos: msg.mapeamentos,
      areas_toque: msg.areas_toque || [],
      sem_toque: msg.sem_toque || false,
      variacoes: msg.variacoes || [],
      tab_order: msg.tab_order || [],
    });
    workingFrame.setPluginData("a11y-component-data", dataToSaveDirect);
```

- [ ] **Step 3: Verificar compilação**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff" && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff"
git add code.ts
git commit -m "feat(tabulacao): persistência tab_order nos 3 locais de save + default"
```

---

## Task 3: code.ts — specs tab order (contexto independente)

**Files:**
- Modify: `code.ts` (inserir após o fechamento do bloco `if (todasAsAreas.length > 0)` ~linha 352, antes de `figma.currentPage.findAll('[A11Y Variação]')`)

**Contexto:** Tabulação e área de toque são blocos completamente independentes. Não há acesso ao `imageFrame` de toque aqui. O bloco de tabulação apenas preenche o container `"tab order"` no template (specs), se ele existir. Preview visual para tabulação não é gerado nesta iteração.

- [ ] **Step 1: Adicionar bloco de specs de tabulação**

Inserir após a linha que fecha o bloco `if (todasAsAreas.length > 0)` (~linha 352) e antes do `figma.currentPage.findAll('[A11Y Variação]')`:

```typescript
    // --- TAB ORDER: SPECS NO TEMPLATE (contexto independente de área de toque) ---
    const tabOrder: any[] = msg.tab_order || [];
    if (tabOrder.length > 0) {
      const tabOrderContainer = workingFrame.findOne((n: SceneNode) => n.name === 'tab order') as FrameNode | null;
      if (tabOrderContainer) {
        const specs = tabOrderContainer.findOne((n: SceneNode) => n.name === 'specs') as FrameNode | null;
        if (specs) {
          const rowModel = Array.from(specs.children).find(n => n.name === 'element') as FrameNode | undefined;
          if (rowModel) {
            Array.from(specs.children).filter(n => n !== rowModel).forEach(n => n.remove());
            for (let i = 0; i < tabOrder.length; i++) {
              const item = tabOrder[i];
              const row = rowModel.clone();
              row.visible = true;
              specs.appendChild(row);
              const nameInst = row.findOne((n: SceneNode) => n.name === 'Element name') as InstanceNode | null;
              if (nameInst) {
                const allTexts = nameInst.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                for (const t of allTexts) {
                  if (t.characters === 'Elemento') await updateText(t, item.nome);
                  else if (/^\d+$/.test(t.characters.trim())) await updateText(t, String(i + 1));
                }
              }
            }
            rowModel.visible = false;
          }
        }
      }
      // Se tabOrderContainer não existe, pula silenciosamente (template ainda não tem o nó)
    }
```

- [ ] **Step 2: Verificar compilação**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff" && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff"
git add code.ts
git commit -m "feat(tabulacao): specs tab order no code.ts (contexto independente)"
```

---

## Task 4: ui.html — CSS + aba + panel HTML

**Files:**
- Modify: `ui.html` (CSS ~linha 60; tabs ~linha 164; após `#panel-toque` ~linha 346)

- [ ] **Step 1: Adicionar CSS para o panel de tabulação**

Após a última regra CSS existente (antes de `</style>`) inserir:

```css
    /* === TABULAÇÃO === */
    #panel-tabulacao.tab-panel.active { display: flex; flex-direction: column; padding: 16px; gap: 8px; }
    .tab-order-item { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #E5E5E5; border-radius: 8px; padding: 10px 12px; }
    .tab-order-index { font-size: 11px; font-weight: 800; color: #2D4496; background: #EEF2FF; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .tab-order-info { flex: 1; min-width: 0; }
    .tab-order-name { font-size: 13px; font-weight: 600; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; outline: none; border: none; background: transparent; width: 100%; padding: 0; }
    .tab-order-name:focus { color: #2D4496; text-decoration: underline dotted; }
    .tab-order-layer { font-size: 11px; color: #AAA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tab-order-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .tab-order-btn { background: none; border: none; cursor: pointer; color: #CCC; font-size: 13px; padding: 4px 6px; border-radius: 4px; }
    .tab-order-btn:hover { background: #F5F5F5; color: #555; }
    .tab-order-btn.remove:hover { color: #FF5252; }
    .tab-order-empty { text-align: center; padding: 32px 16px; color: #BBB; font-size: 12px; border: 2px dashed #EEE; border-radius: 12px; }
    .tab-add-btn { background: #2D4496; color: #fff; border: none; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 700; cursor: pointer; width: 100%; }
    .tab-add-btn:hover { background: #1f3070; }
    .tab-add-btn:disabled { background: #CCC; cursor: not-allowed; }
```

- [ ] **Step 2: Adicionar aba "Tabulação" na navegação**

Na linha com as abas (~linha 164), adicionar entre "Área de Toque" e "Handoff":

```html
<!-- ANTES -->
        <button class="tab" data-target="panel-toque">Área de Toque</button>
        <button class="tab" data-target="panel-handoff">Handoff</button>

<!-- DEPOIS -->
        <button class="tab" data-target="panel-toque">Área de Toque</button>
        <button class="tab" data-target="panel-tabulacao">Tabulação</button>
        <button class="tab" data-target="panel-handoff">Handoff</button>
```

- [ ] **Step 3: Adicionar `#panel-tabulacao`**

Após o fechamento do `#panel-toque` (linha que contém `</div>` fechando o panel, antes de `<div id="panel-handoff"`), inserir:

```html
      <div id="panel-tabulacao" class="tab-panel">
        <div id="tabOrderList"></div>
        <button class="tab-add-btn" id="btnAddTabItem" onclick="addTabItemsFromSelection()">+ Adicionar seleção atual</button>
        <button class="tab-add-btn" id="btnAddTabVariations" style="display:none;" disabled>+ Adicionar variações</button>
      </div>
```

- [ ] **Step 4: Verificação visual**

Carregar o plugin no Figma. Verificar:
- A aba "Tabulação" aparece entre "Área de Toque" e "Handoff"
- Clicar na aba mostra o panel (botão de adicionar visível)
- Não há erros de console

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff"
git add ui.html
git commit -m "feat(tabulacao): CSS + aba + panel HTML no ui.html"
```

---

## Task 5: ui.html — estado global + funções JS

**Files:**
- Modify: `ui.html` (bloco `<script>` ~linha 384)

- [ ] **Step 1: Declarar estado global `tabOrderData`**

Logo após as declarações de estado global existentes (após `let variationsData = [];` ou similar), adicionar:

```javascript
    let tabOrderData = []; // [{ nome, layerName, nodeId, relX, relY, width, height }]
```

- [ ] **Step 2: Adicionar `renderTabOrderList()`**

Após a declaração de `tabOrderData`, adicionar:

```javascript
    function renderTabOrderList() {
      const container = el('tabOrderList');
      if (!container) return;
      if (tabOrderData.length === 0) {
        container.innerHTML = '<div class="tab-order-empty">Nenhum foco adicionado.<br>Selecione camadas no canvas e clique em Adicionar.</div>';
        return;
      }
      container.innerHTML = tabOrderData.map((item, i) => `
        <div class="tab-order-item">
          <div class="tab-order-index">${i + 1}</div>
          <div class="tab-order-info">
            <input class="tab-order-name"
              value="${item.nome.replace(/"/g, '&quot;')}"
              onblur="renameTabItem(${i}, this.value)"
              onkeydown="if(event.key==='Enter')this.blur()"
              title="Clique para renomear"
            />
            <div class="tab-order-layer" title="${item.layerName}">${item.layerName}</div>
          </div>
          <div class="tab-order-actions">
            <button class="tab-order-btn" onclick="moveTabItem(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Mover para cima">↑</button>
            <button class="tab-order-btn" onclick="moveTabItem(${i}, 1)" ${i === tabOrderData.length - 1 ? 'disabled' : ''} title="Mover para baixo">↓</button>
            <button class="tab-order-btn remove" onclick="removeTabItem(${i})" title="Remover">×</button>
          </div>
        </div>
      `).join('');
    }
```

- [ ] **Step 3: Adicionar funções de manipulação**

Após `renderTabOrderList()`, adicionar:

```javascript
    function addTabItemsFromSelection() {
      parent.postMessage({ pluginMessage: { type: 'get-tab-selection' } }, '*');
    }

    function removeTabItem(i) {
      tabOrderData.splice(i, 1);
      renderTabOrderList();
      updateSummaryCards();
    }

    function moveTabItem(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= tabOrderData.length) return;
      [tabOrderData[i], tabOrderData[j]] = [tabOrderData[j], tabOrderData[i]];
      renderTabOrderList();
    }

    function renameTabItem(i, novoNome) {
      if (tabOrderData[i]) {
        tabOrderData[i].nome = novoNome.trim() || `Tab ${i + 1}`;
        renderTabOrderList();
      }
    }
```

- [ ] **Step 4: Adicionar handler `tab-items-ready` no `window.onmessage`**

No bloco `window.onmessage` (ou `window.addEventListener('message', ...)`), adicionar junto com os outros handlers de mensagem do Figma:

```javascript
      if (msg.type === 'tab-items-ready') {
        const startIndex = tabOrderData.length;
        msg.items.forEach((item, i) => {
          tabOrderData.push({
            nome: `Tab ${startIndex + i + 1}`,
            layerName: item.layerName,
            nodeId: item.nodeId,
            relX: item.relX,
            relY: item.relY,
            width: item.width,
            height: item.height,
          });
        });
        renderTabOrderList();
        updateSummaryCards();
      }
```

- [ ] **Step 5: Verificação funcional**

No Figma:
1. Selecionar 2 camadas dentro do componente
2. Clicar "Adicionar seleção atual"
3. Verificar que aparecem como "Tab 1" e "Tab 2" com o nome da camada abaixo
4. Clicar ↑↓ — verificar reordenação
5. Clicar no nome "Tab 1" → digitar novo nome → pressionar Enter ou clicar fora → verificar
6. Clicar × em um item → verificar remoção

- [ ] **Step 6: Commit**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff"
git add ui.html
git commit -m "feat(tabulacao): estado global + funções JS no ui.html"
```

---

## Task 6: ui.html — integração setup-ui, run-handoff e summary

**Files:**
- Modify: `ui.html` (setup-ui handler ~linha 556; run-handoff payload ~linha 987; updateSummaryCards ~linha 488)

- [ ] **Step 1: Restaurar `tabOrderData` no handler `setup-ui`**

No bloco que trata `msg.type === 'setup-ui'`, após a linha que restaura `variationsData` (linha com `variationsData = msg.componentData?.variacoes || []`):

```javascript
        tabOrderData = msg.componentData?.tab_order || [];
        renderTabOrderList();
```

- [ ] **Step 2: Incluir `tab_order` no payload de `run-handoff`**

Na chamada `parent.postMessage` do botão Gerar Handoff (~linha 987):

```javascript
// ANTES
      parent.postMessage({ pluginMessage: {
        type: 'run-handoff', plataformas: p, zoom: z, mapeamentos: currentData,
        areas_toque: touchData, sem_toque: el('chkSemToque').checked,
        componentName: el('compName').textContent,
        variacoes: variationsData
      }}, '*');

// DEPOIS
      parent.postMessage({ pluginMessage: {
        type: 'run-handoff', plataformas: p, zoom: z, mapeamentos: currentData,
        areas_toque: touchData, sem_toque: el('chkSemToque').checked,
        componentName: el('compName').textContent,
        variacoes: variationsData,
        tab_order: tabOrderData
      }}, '*');
```

- [ ] **Step 3: Adicionar pill de tabulação em `updateSummaryCards()`**

Na função `updateSummaryCards()`, após o bloco do `touchCard`, adicionar pill e card de tabulação. Localizar a linha `el('summaryCards').style.display = ...` e, antes dela, adicionar:

```javascript
      // Card de Tabulação
      const tabPill = tabOrderData.length;
      let summaryTabCard = el('summaryTabCard');
      if (summaryTabCard) {
        summaryTabCard.style.display = tabPill > 0 ? 'block' : 'none';
        const tabPills = el('summaryTabPills');
        if (tabPills) tabPills.innerHTML = tabPill > 0
          ? `<span class='summary-pill'>${tabPill} foco${tabPill !== 1 ? 's' : ''}</span>`
          : '';
      }
```

E alterar a condição de exibição do `summaryCards`:

```javascript
// ANTES
  el('summaryCards').style.display = hasSomething || totalAreas > 0 ? 'flex' : 'none';

// DEPOIS
  el('summaryCards').style.display = hasSomething || totalAreas > 0 || tabPill > 0 ? 'flex' : 'none';
```

- [ ] **Step 4: Adicionar `#summaryTabCard` no HTML do panel-handoff**

No bloco `#summaryCards` (após o `#summaryTouchCard`), inserir:

```html
          <div id='summaryTabCard' class='card' style='display:none; margin-bottom:8px;'>
            <div class='card-body'>
              <div style='display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;'>
                <div style='display:flex; align-items:center; gap:8px;'>
                  <span>⌨️</span>
                  <span style='font-size:14px; font-weight:600;'>Tabulação</span>
                </div>
                <span id='summaryEditTab' style='font-size:12px; color:#999; cursor:pointer;'>Editar ›</span>
              </div>
              <div id='summaryTabPills' style='display:flex; flex-wrap:wrap; gap:6px;'></div>
            </div>
          </div>
```

- [ ] **Step 5: Adicionar handler de clique em `summaryEditTab`**

Após os handlers de `summaryEditGeral` e `summaryEditToque` (~linha 532), adicionar:

```javascript
    el('summaryEditTab').onclick = () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('.tab[data-target="panel-tabulacao"]').classList.add('active');
      el('panel-tabulacao').classList.add('active');
    };
```

- [ ] **Step 6: Verificação end-to-end**

No Figma:
1. Adicionar 3 itens de tabulação
2. Ir para aba Handoff → verificar pill "3 focos" no card Tabulação
3. Clicar "Editar ›" → verificar navegação para aba Tabulação
4. Clicar "Gerar Handoff" → verificar badges numerados no imageFrame
5. Fechar e reabrir o plugin → verificar que os 3 itens foram restaurados
6. Remover todos os itens → verificar que o card sumiu do Handoff

- [ ] **Step 7: Commit**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff"
git add ui.html
git commit -m "feat(tabulacao): integração setup-ui, run-handoff e summary cards"
```

---

## Verificação Final

| Cenário | Resultado esperado |
|---------|-------------------|
| 2 camadas selecionadas → Adicionar | "Tab 1" e "Tab 2" com layerName abaixo |
| Reordenar ↑↓ | Ordem refletida, índices atualizados |
| Editar nome inline | Nome persiste ao sair do campo |
| Remover item | Lista atualiza sem erros |
| Gerar Handoff com tab items | Specs de tabulação preenchidas no template (se container "tab order" existir) |
| Gerar Handoff sem tab items | Bloco de tabulação não executa, área de toque inalterada |
| Reabrir plugin | Lista restaurada corretamente |
| Camada fora do componente | Adicionada com relX/Y possivelmente fora dos bounds — aceitável |
| Container "tab order" ausente no template | Specs puladas silenciosamente, sem erro |
| Área de toque com variações + tab items | Cada bloco executa de forma totalmente independente |
