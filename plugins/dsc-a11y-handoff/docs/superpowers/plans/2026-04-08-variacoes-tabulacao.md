# Variações de Tabulação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add variation support to the Tabulação panel, mirroring the Área de Toque variations structure, so each variant of a component can have independent tab order items with `[a11y] Order` numbering restarting from 1 per instance.

**Architecture:** A new `tabVariationsData` array (mirrors `variationsData`) replaces the flat `tabOrderData` / `semTabulacao` approach. `tabOrderData` becomes the "live" array for the currently active variation. The focus order block in `run-handoff` iterates over variations, places component clones side-by-side, resets `[a11y] Order` counter per variation, and uses a global counter for `[dsc-h] Item Number`. Tab variation frames on canvas are named `[A11Y Tab Variação] <nome>` and are deleted after handoff (same lifecycle as `[A11Y Variação]` for touch).

**Tech Stack:** TypeScript (Figma plugin sandbox), vanilla JS/HTML (iframe UI), Figma Plugin API.

---

## File Map

| File | Changes |
|------|---------|
| `code.ts` | Add `componenteTabVariacaoAtivo` global; add 4 new message handlers; update `get-tab-selection` + `get-component-as-tab`; replace focus order block with multi-variation rendering; update 3 data-persistence blocks + `carregarDadosEEnviarParaUI` |
| `ui.html` | Add 4 CSS rules; restructure `panel-tabulacao` HTML (3 views + `tabVariationFormView`); add `tabVariationsData`, `currentTabVariationId`, `tabOrderData` declaration; add 10 new JS functions; update `setup-ui` handler; update `onSemTabulacaoChange`; update `updateSummaryCards`; update `btnRun.onclick`; update tab switching; wire new buttons; add `tab-variation-frame-created` message handler |

---

## Task 1: code.ts — Tab variation global + 4 new message handlers + update 2 existing handlers

**Files:**
- Modify: `code.ts`

- [ ] **Step 1: Add `componenteTabVariacaoAtivo` global at line 10 (after `componenteVariacaoAtivo`)**

Find (line 10):
```typescript
let componenteVariacaoAtivo: SceneNode | null = null;
```
Replace with:
```typescript
let componenteVariacaoAtivo: SceneNode | null = null;
let componenteTabVariacaoAtivo: SceneNode | null = null;
```

- [ ] **Step 2: Add 4 new message handlers at the end of `figma.ui.onmessage`, before the closing `};` (after `delete-variation-frame` block, around line 763)**

Insert before the final `};` on line 764:

```typescript
  else if (msg.type === 'create-tab-variation-frame') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    try {
      const comp = componentePrincipalAtivo;
      const parentNode = comp.parent as FrameNode | PageNode;
      if (!parentNode) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Componente sem parent.' });
        return;
      }
      const frameName = `[A11Y Tab Variação] ${msg.nome}`;
      const existing = figma.currentPage.findOne((n: SceneNode) => n.name === frameName);
      if (existing) existing.remove();
      const instance = comp.clone() as InstanceNode;
      instance.x = 0;
      instance.y = 0;
      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try { instance.setProperties(msg.propriedades); } catch (e) {}
      }
      const varFrame = figma.createFrame();
      varFrame.name = frameName;
      varFrame.fills = [];
      varFrame.clipsContent = false;
      varFrame.resize(instance.width, instance.height);
      varFrame.x = comp.x + comp.width + 80;
      varFrame.y = comp.y;
      (parentNode as FrameNode).appendChild(varFrame);
      varFrame.appendChild(instance);
      figma.currentPage.selection = [varFrame];
      figma.viewport.scrollAndZoomIntoView([varFrame]);
      figma.ui.postMessage({ type: 'tab-variation-frame-created', frameNodeId: varFrame.id, instanceNodeId: instance.id });
    } catch (e) {
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar frame de variação de tabulação: ${e}` });
    }
  }

  else if (msg.type === 'activate-tab-variation') {
    try {
      componenteTabVariacaoAtivo = msg.instanceNodeId
        ? await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null
        : null;
    } catch (e) {
      componenteTabVariacaoAtivo = null;
    }
  }

  else if (msg.type === 'deactivate-tab-variation') {
    componenteTabVariacaoAtivo = null;
  }

  else if (msg.type === 'delete-tab-variation-frame') {
    if (msg.frameNodeId) {
      try {
        const node = await figma.getNodeByIdAsync(msg.frameNodeId);
        if (node) node.remove();
      } catch (e) {
        console.warn('[delete-tab-variation-frame]', e);
      }
    }
  }
```

- [ ] **Step 3: Update `get-tab-selection` to use active tab variation for relative coords**

Find in `get-tab-selection` handler (around line 712–732):
```typescript
  else if (msg.type === 'get-tab-selection') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const selection = figma.currentPage.selection;
    const comp = componentePrincipalAtivo;
```
Replace with:
```typescript
  else if (msg.type === 'get-tab-selection') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const selection = figma.currentPage.selection;
    const comp = (componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as FrameNode;
```

- [ ] **Step 4: Update `get-component-as-tab` to use active tab variation**

Find in `get-component-as-tab` handler (around line 735–752):
```typescript
  else if (msg.type === 'get-component-as-tab') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const comp = componentePrincipalAtivo;
```
Replace with:
```typescript
  else if (msg.type === 'get-component-as-tab') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const comp = (componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as FrameNode;
```

- [ ] **Step 5: Verify build compiles without errors**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors about `componenteTabVariacaoAtivo`.

---

## Task 2: code.ts — Replace focus order block with multi-variation rendering

**Files:**
- Modify: `code.ts` (lines ~354–452 and ~455–465)

- [ ] **Step 1: Replace entire focus order block (lines ~354–452) with the multi-variation version**

Find and remove the entire block starting with `// --- FOCUS ORDER: VISUAL NO TEMPLATE ---` through the closing `// Se focusOrderContainer não existe, pula silenciosamente` comment (roughly 100 lines):

```typescript
    // --- FOCUS ORDER: VISUAL NO TEMPLATE ---
    const tabOrder: any[] = msg.tab_order || [];
    if (tabOrder.length > 0 && componentePrincipalAtivo) {
```

Replace that entire block (up to and including `// Se focusOrderContainer não existe, pula silenciosamente\n    }`) with:

```typescript
    // --- FOCUS ORDER: VISUAL NO TEMPLATE (VARIAÇÕES DE TABULAÇÃO) ---
    const variacoesTab: any[] = msg.variacoes_tabulacao || [];
    const variacoesTabComItems = variacoesTab.filter((v: any) => !v.sem_tabulacao && v.tab_order && v.tab_order.length > 0);

    if (variacoesTabComItems.length > 0 && componentePrincipalAtivo) {
      const focusOrderContainer = workingFrame.findOne((n: SceneNode) => n.name === 'focus order') as FrameNode | null;
      if (focusOrderContainer) {
        const tabImageFrame = focusOrderContainer.findOne((n: SceneNode) => n.name === 'image') as FrameNode | null;
        if (tabImageFrame) {
          const modelOrder      = Array.from(tabImageFrame.children).find(n => n.name === '[a11y] Order')        as InstanceNode | undefined;
          const modelItemNumber = Array.from(tabImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;

          const tagNodeTab = Array.from(tabImageFrame.children).find(n => n.name === 'tag');
          const keepTab = new Set<BaseNode>([tagNodeTab, modelOrder, modelItemNumber].filter(Boolean) as BaseNode[]);
          Array.from(tabImageFrame.children).filter(n => !keepTab.has(n)).forEach(n => n.remove());

          // Ajuste WCAG de contraste do fundo
          try {
            const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            const relativeLuminance = (r: number, g: number, b: number) =>
              0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
            const wcagContrast = (l1: number, l2: number) => {
              const lighter = Math.max(l1, l2);
              const darker  = Math.min(l1, l2);
              return (lighter + 0.05) / (darker + 0.05);
            };
            const bgFillsTab   = Array.isArray(tabImageFrame.fills) ? tabImageFrame.fills as Paint[] : [];
            const compFillsTab = Array.isArray((componentePrincipalAtivo as FrameNode).fills)
              ? (componentePrincipalAtivo as FrameNode).fills as Paint[] : [];
            const bgFillTab   = bgFillsTab.find(f => f.type === 'SOLID') as SolidPaint | undefined;
            const compFillTab = compFillsTab.find(f => f.type === 'SOLID') as SolidPaint | undefined;
            let needsSwapTab = true;
            if (bgFillTab && compFillTab) {
              const bgL   = relativeLuminance(bgFillTab.color.r,   bgFillTab.color.g,   bgFillTab.color.b);
              const compL = relativeLuminance(compFillTab.color.r, compFillTab.color.g, compFillTab.color.b);
              needsSwapTab = wcagContrast(bgL, compL) < 3;
            }
            const figmaVarsTab = (figma as any).variables;
            const allVarsTab: any[] = figmaVarsTab ? await figmaVarsTab.getLocalVariablesAsync() : [];
            if (needsSwapTab) {
              const cardBg2VarTab = allVarsTab.find((v: any) => v.name.toLowerCase().includes('card background 2'));
              if (cardBg2VarTab && figmaVarsTab) {
                tabImageFrame.fills = [figmaVarsTab.setBoundVariableForPaint(
                  { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', cardBg2VarTab
                )];
              } else {
                tabImageFrame.fills = [{ type: 'SOLID', color: { r: 0.16, g: 0.20, b: 0.29 } }];
              }
            }
          } catch (e) {
            figma.ui.postMessage({ type: 'feedback', message: `❌ Erro no bloco de cor (focus order): ${e}` });
          }

          const TAB_PAD_TOP  = 40;
          const TAB_PAD_LEFT = 160;
          const TAB_PAD_SIDE = 24;
          const TAB_GAP_H    = 140;
          const TAB_GAP_V    = 60;
          const TAB_MAX_WIDTH = Math.max(tabImageFrame.width, 800);

          let currentX = TAB_PAD_LEFT;
          let currentY = TAB_PAD_TOP;
          let rowHeight = 0;
          let globalItemCounter = 0;
          let totalWidth = TAB_PAD_LEFT;
          let totalHeight = TAB_PAD_TOP;

          for (const variacao of variacoesTabComItems) {
            // Obter clone do componente correto para esta variação
            let compClone: SceneNode;
            if (variacao.id === 'default') {
              compClone = componentePrincipalAtivo.clone();
            } else if (variacao.instanceNodeId) {
              const srcNode = await figma.getNodeByIdAsync(variacao.instanceNodeId) as SceneNode | null;
              compClone = srcNode ? srcNode.clone() : componentePrincipalAtivo.clone();
            } else {
              compClone = componentePrincipalAtivo.clone();
              if (compClone.type === 'INSTANCE' && variacao.propriedades && Object.keys(variacao.propriedades).length > 0) {
                try { (compClone as InstanceNode).setProperties(variacao.propriedades); } catch (e) {}
              }
            }

            // Verificar se precisa quebrar linha
            if (currentX > TAB_PAD_LEFT && currentX + compClone.width > TAB_MAX_WIDTH) {
              currentX = TAB_PAD_LEFT;
              currentY += rowHeight + TAB_GAP_V;
              rowHeight = 0;
            }

            compClone.x = currentX;
            compClone.y = currentY;
            tabImageFrame.insertChild(0, compClone);

            // [dsc-h] Item Number: 1 por instância do componente (global), connector 'off'
            globalItemCounter++;
            if (modelItemNumber) {
              const numClone = modelItemNumber.clone();
              numClone.visible = true;
              const numTexts = numClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
              const numText = numTexts.find(n => /^\d+$/.test((n as TextNode).characters.trim())) || numTexts[0] || null;
              if (numText) await updateText(numText as TextNode, String(globalItemCounter));
              try { numClone.setProperties({ 'connector': 'off' }); } catch (e) {}
              numClone.x = currentX;
              numClone.y = currentY - numClone.height - 4;
              tabImageFrame.appendChild(numClone);
            }

            // [a11y] Order: por item de tabulação, reinicia em 1 para cada variação
            const tabItems: any[] = variacao.tab_order || [];
            for (let i = 0; i < tabItems.length; i++) {
              const item = tabItems[i];
              if (modelOrder) {
                const orderClone = modelOrder.clone();
                orderClone.visible = true;
                const numText = orderClone.findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null;
                if (numText) await updateText(numText, String(i + 1));
                orderClone.x = currentX + item.relX + item.width - orderClone.width / 2;
                orderClone.y = currentY + item.relY + item.height / 2 - orderClone.height / 2;
                tabImageFrame.appendChild(orderClone);
              }
            }

            rowHeight = Math.max(rowHeight, compClone.height);
            totalWidth = Math.max(totalWidth, currentX + compClone.width);
            currentX += compClone.width + TAB_GAP_H;
          }

          totalHeight = currentY + rowHeight;
          tabImageFrame.resize(
            Math.max(tabImageFrame.width, totalWidth + TAB_PAD_SIDE),
            totalHeight + TAB_PAD_SIDE
          );
          if (modelOrder)      modelOrder.visible      = false;
          if (modelItemNumber) modelItemNumber.visible = false;
        }
      }
    }
```

- [ ] **Step 2: Add `[A11Y Tab Variação]` cleanup and ID zeroing after handoff**

Find (around line 455):
```typescript
    // Remove frames de variação do canvas após geração do preview
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Variação]')).forEach(n => n.remove());

    // Zerar frameNodeId/instanceNodeId para que no próximo carregamento os frames sejam recriados
    if (msg.variacoes) {
```
Replace with:
```typescript
    // Remove frames de variação do canvas após geração do preview
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Variação]')).forEach(n => n.remove());
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Tab Variação]')).forEach(n => n.remove());

    // Zerar frameNodeId/instanceNodeId para que no próximo carregamento os frames sejam recriados
    if (msg.variacoes_tabulacao) {
      for (const v of msg.variacoes_tabulacao) {
        if (v.id !== 'default') {
          v.frameNodeId = null;
          v.instanceNodeId = null;
        }
      }
    }
    if (msg.variacoes) {
```

- [ ] **Step 3: Verify build compiles without errors**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

---

## Task 3: code.ts — Update data persistence + carregarDadosEEnviarParaUI

**Files:**
- Modify: `code.ts`

- [ ] **Step 1: Update the 3 data persistence blocks to include `variacoes_tabulacao` and remove `tab_order`/`sem_tabulacao`**

There are 3 `JSON.stringify` calls that build `dataToSave`. All 3 need the same update. Find each occurrence of:
```typescript
      tab_order: msg.tab_order || [],
    sem_tabulacao: msg.sem_tabulacao || false,
```
Replace each with:
```typescript
      variacoes_tabulacao: msg.variacoes_tabulacao || [],
```

Note: there are exactly 3 places:
1. `dbInstance.setPluginData` block (~line 469)
2. `dataNode.setPluginData` block (~line 486)
3. `workingFrame.setPluginData` block (~line 501)

- [ ] **Step 2: Update default `componentData` in `carregarDadosEEnviarParaUI` to include `variacoes_tabulacao`**

Find (around line 872):
```typescript
  let componentData: any = { plataformas: [], zoom: [], mapeamentos: [], areas_toque: [], sem_toque: false, tab_order: [], sem_tabulacao: false };
```
Replace with:
```typescript
  let componentData: any = { plataformas: [], zoom: [], mapeamentos: [], areas_toque: [], sem_toque: false, variacoes: [], variacoes_tabulacao: [] };
```

- [ ] **Step 3: Verify build compiles without errors**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

---

## Task 4: ui.html — HTML restructure of panel-tabulacao + new CSS

**Files:**
- Modify: `ui.html`

- [ ] **Step 1: Add 4 CSS rules for tab variation views (after line 58, before `.tsize-btn.active`)**

Find:
```css
    #touchVariationFormView.open { display: flex; }
    .tsize-btn.active  { border-color: #2D4496 !important; background: #EEF2FF !important; }
```
Replace with:
```css
    #touchVariationFormView.open { display: flex; }
    #tabVariationListView { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    #tabVariationListView.hidden { display: none !important; }
    #tabMainView.hidden { display: none !important; }
    #tabVariationFormView { display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #fff; flex-direction: column; z-index: 20; }
    #tabVariationFormView.open { display: flex; }
    .tsize-btn.active  { border-color: #2D4496 !important; background: #EEF2FF !important; }
```

- [ ] **Step 2: Replace the entire `panel-tabulacao` div content (lines 394–438) with the new 4-view structure**

Find and replace the entire block:
```html
      <div id="panel-tabulacao" class="tab-panel">
        <div class="tab-notab-bar">
          <label class="checkbox-field">
            <input type="checkbox" id="chkSemTabulacao" onchange="onSemTabulacaoChange()">
            <span>Sem tabulação</span>
          </label>
        </div>
        <div id="tabOrderListWrapper">
          <div id="tabOrderList"></div>
        </div>
        <div class="tab-footer" id="tabFooter">
          <button class="tab-add-btn" id="btnAddTab" onclick="openTabForm()">+ Adicionar foco de tabulação</button>
        </div>

        <div id="tabFormView">
          <div class="tab-form-header">
            <span>Adicionar Tabulação</span>
            <button onclick="closeTabForm()">×</button>
          </div>
          <div class="tab-form-section">
            <p class="tab-form-hint">Escolha o tipo de foco:</p>
            <div class="tab-type-row">
              <button class="tab-type-btn" id="tabTypeSelection" onclick="selectTabFormType('selection')">
                <span class="tab-btn-label">Seleção</span>
                <span class="tab-btn-value">Camadas no canvas</span>
              </button>
              <button class="tab-type-btn" id="tabTypeComponent" onclick="selectTabFormType('component')">
                <span class="tab-btn-label">Componente</span>
                <span class="tab-btn-value">Foco único</span>
              </button>
            </div>
          </div>
          <div id="tabFormActions" style="display:none; padding:0 16px 12px; flex-shrink:0;">
            <div style="background:#EEF2FF; border-radius:8px; padding:12px; text-align:center;">
              <div id="tabFormTitle" style="font-size:12px; font-weight:700; color:#2D4496; margin-bottom:4px;"></div>
              <p id="tabFormInstruction" style="font-size:11px; color:#666; margin:0;"></p>
            </div>
          </div>
          <div id="tabFormTempList" style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:8px;"></div>
          <div class="touch-actions" style="padding:12px 16px; border-top:1px solid #EEE;">
            <button class="touch-btn-primary" id="btnTabFormSave" onclick="saveTabForm()" disabled>Salvar</button>
            <button onclick="closeTabForm()" style="background:none;border:none;font-size:12px;font-weight:700;color:#2D4496;cursor:pointer;padding:4px 0;">Cancelar</button>
          </div>
        </div>
      </div>
```

With:
```html
      <div id="panel-tabulacao" class="tab-panel">

        <!-- VIEW 1: LISTA DE VARIAÇÕES -->
        <div id='tabVariationListView'>
          <div style='flex:1;overflow-y:auto;padding:12px 16px;'>
            <div id='tabVariationList' style='display:flex;flex-direction:column;gap:6px;'></div>
          </div>
          <div style='flex-shrink:0;padding:10px 16px 14px;border-top:1px solid #F0F0F0;background:#fff;'>
            <button id='btnAddTabVariation' style='width:100%;padding:10px;background:none;border:1.5px dashed #BBBFC8;border-radius:10px;color:#2D4496;font-size:12px;font-weight:700;cursor:pointer;'>+ Nova variante parametrizada</button>
          </div>
        </div>

        <!-- VIEW PRINCIPAL -->
        <div id='tabMainView' style='flex:1;display:flex;flex-direction:column;overflow:hidden;'>
          <div id='tabMainViewHeader' style='flex-shrink:0;padding:10px 16px;border-bottom:1px solid #F0F0F0;display:flex;align-items:center;gap:8px;'>
            <button id='btnBackToTabVariations' style='background:none;border:none;font-size:12px;font-weight:700;color:#2D4496;cursor:pointer;padding:4px 0;'>← Voltar</button>
            <span id='tabMainViewLabel' style='font-size:13px;font-weight:700;color:#1a1a1a;flex:1;'>Default</span>
          </div>
          <div class="tab-notab-bar">
            <label class="checkbox-field">
              <input type="checkbox" id="chkSemTabulacao" onchange="onSemTabulacaoChange()">
              <span>Sem tabulação</span>
            </label>
          </div>
          <div id="tabOrderListWrapper">
            <div id="tabOrderList"></div>
          </div>
          <div class="tab-footer" id="tabFooter">
            <button class="tab-add-btn" id="btnAddTab" onclick="openTabForm()">+ Adicionar foco de tabulação</button>
          </div>
        </div>

        <!-- FORM FOCO DE TABULAÇÃO (overlay absoluto) -->
        <div id="tabFormView">
          <div class="tab-form-header">
            <span>Adicionar Tabulação</span>
            <button onclick="closeTabForm()">×</button>
          </div>
          <div class="tab-form-section">
            <p class="tab-form-hint">Escolha o tipo de foco:</p>
            <div class="tab-type-row">
              <button class="tab-type-btn" id="tabTypeSelection" onclick="selectTabFormType('selection')">
                <span class="tab-btn-label">Seleção</span>
                <span class="tab-btn-value">Camadas no canvas</span>
              </button>
              <button class="tab-type-btn" id="tabTypeComponent" onclick="selectTabFormType('component')">
                <span class="tab-btn-label">Componente</span>
                <span class="tab-btn-value">Foco único</span>
              </button>
            </div>
          </div>
          <div id="tabFormActions" style="display:none; padding:0 16px 12px; flex-shrink:0;">
            <div style="background:#EEF2FF; border-radius:8px; padding:12px; text-align:center;">
              <div id="tabFormTitle" style="font-size:12px; font-weight:700; color:#2D4496; margin-bottom:4px;"></div>
              <p id="tabFormInstruction" style="font-size:11px; color:#666; margin:0;"></p>
            </div>
          </div>
          <div id="tabFormTempList" style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:8px;"></div>
          <div class="touch-actions" style="padding:12px 16px; border-top:1px solid #EEE;">
            <button class="touch-btn-primary" id="btnTabFormSave" onclick="saveTabForm()" disabled>Salvar</button>
            <button onclick="closeTabForm()" style="background:none;border:none;font-size:12px;font-weight:700;color:#2D4496;cursor:pointer;padding:4px 0;">Cancelar</button>
          </div>
        </div>

        <!-- FORM VARIAÇÃO DE TABULAÇÃO (overlay absoluto z-index:20) -->
        <div id='tabVariationFormView'>
          <div style='flex-shrink:0;padding:12px 16px;border-bottom:1px solid #F0F0F0;display:flex;align-items:center;'>
            <span style='font-size:13px;font-weight:700;color:#1a1a1a;flex:1;'>Nova variante parametrizada</span>
          </div>
          <div style='flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;'>
            <div class='touch-form-row'>
              <label>Nome</label>
              <input type='text' id='tabVarNomeInput' class='touch-form-input' placeholder='Ex: Mobile, Hover, Expandido…'>
            </div>
            <div id='tabVarPropsContainer' style='display:flex;flex-direction:column;gap:10px;'></div>
          </div>
          <div style='flex-shrink:0;padding:12px 16px 16px;border-top:1px solid #F0F0F0;background:#fff;display:flex;flex-direction:column;gap:8px;align-items:center;'>
            <button id='btnTabVariationFormCreate' style='width:100%;padding:12px;background:#2D4496;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;box-sizing:border-box;'>Criar variante</button>
            <button id='btnTabVariationFormCancel' style='background:none;border:none;font-size:12px;font-weight:700;color:#2D4496;cursor:pointer;padding:4px 0;'>Cancelar</button>
          </div>
        </div>

      </div>
```

- [ ] **Step 3: Verify the HTML is valid (no duplicate IDs, correct nesting)**

Open `ui.html` in a text editor / grep for `id="chkSemTabulacao"` — should appear exactly once. Also check `id="btnAddTab"` appears once.

```bash
grep -c 'id="chkSemTabulacao"' "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff/ui.html"
grep -c 'id="btnAddTab"' "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff/ui.html"
```
Expected: both return `1`.

---

## Task 5: ui.html — New JS variables + functions + button wiring

**Files:**
- Modify: `ui.html`

- [ ] **Step 1: Add `tabVariationsData`, `currentTabVariationId` and `tabOrderData` declaration to the variable block (around line 862)**

Find:
```javascript
  let variationsData = []; // array de variações: [{ id, nome, propriedades, areas_toque, sem_toque, frameNodeId, instanceNodeId }]
    let tabFormTempItems = [];
    let tabFormType = null; // 'selection' | 'component'
    let tabFormPendingSave = false;
    let semTabulacao = false;
  let currentVariationId = null; // 'default' | uuid string
  let componentProps = []; // [{ name, type, options }] — carregado via get-component-properties
```
Replace with:
```javascript
  let variationsData = []; // array de variações: [{ id, nome, propriedades, areas_toque, sem_toque, frameNodeId, instanceNodeId }]
  let tabVariationsData = []; // array de variações de tabulação: [{ id, nome, propriedades, tab_order, sem_tabulacao, frameNodeId, instanceNodeId }]
  let tabOrderData = []; // tab_order da variação de tabulação ativa
    let tabFormTempItems = [];
    let tabFormType = null; // 'selection' | 'component'
    let tabFormPendingSave = false;
    let semTabulacao = false;
  let currentVariationId = null; // 'default' | uuid string
  let currentTabVariationId = null; // 'default' | uuid string
  let componentProps = []; // [{ name, type, options }] — carregado via get-component-properties
```

- [ ] **Step 2: Add new functions for tab variation management (after `renderVariationList` function, before `editVariation`)**

Find (around line 1062):
```javascript
  function renderVariationList() {
```

Insert the following 8 new functions **before** `function renderVariationList()`:

```javascript
  function showTabView(viewId) {
    el('tabVariationListView').classList.toggle('hidden', viewId !== 'list');
    el('tabMainView').classList.toggle('hidden', viewId !== 'main');
  }

  function renderTabVariationList() {
    const container = el('tabVariationList');
    if (!container) return;
    container.innerHTML = '';
    const defData = tabVariationsData.find(v => v.id === 'default') || { id: 'default', nome: 'Default', propriedades: {}, tab_order: [], sem_tabulacao: false };
    container.innerHTML += `<div style='border:1.5px solid #22C55E;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:8px;background:#F0FDF4;'>
      <span style='background:#22C55E;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;'>D</span>
      <div style='flex:1;min-width:0;'>
        <div style='font-size:12px;font-weight:700;color:#1a1a1a;'>Default</div>
        <div style='font-size:10px;color:#888;margin-top:1px;'>Comportamento padrão</div>
      </div>
      <button onclick='editTabVariation("default")' style='background:none;border:1.5px solid #22C55E;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;color:#22C55E;cursor:pointer;'>Editar</button>
    </div>`;
    const customs = tabVariationsData.filter(v => v.id !== 'default');
    if (customs.length > 0) {
      container.innerHTML += `<div style='font-size:10px;font-weight:700;color:#999;letter-spacing:0.05em;padding:6px 0 2px;'>VARIANTES PARAMETRIZADAS</div>`;
      customs.forEach((v, i) => {
        const propsLabel = Object.entries(v.propriedades || {}).map(([k, val]) => `${k}=${val}`).join(', ') || '—';
        container.innerHTML += `<div style='border:1.5px solid #E0E0E0;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:8px;background:#fff;'>
          <span style='background:#2D4496;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;'>${i+1}</span>
          <div style='flex:1;min-width:0;'>
            <div style='font-size:12px;font-weight:700;color:#1a1a1a;'>${v.nome}</div>
            <div style='font-size:10px;color:#888;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${propsLabel}</div>
          </div>
          <button onclick='editTabVariation("${v.id}")' style='background:none;border:1.5px solid #2D4496;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;color:#2D4496;cursor:pointer;'>Editar</button>
          <button onclick='deleteTabVariation("${v.id}")' style='background:none;border:1.5px solid #FF5252;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;color:#FF5252;cursor:pointer;'>Excluir</button>
        </div>`;
      });
    }
  }

  function editTabVariation(id) {
    currentTabVariationId = id;
    let varData = tabVariationsData.find(v => v.id === id);
    if (!varData) {
      varData = { id, nome: id === 'default' ? 'Default' : id, propriedades: {}, tab_order: [], sem_tabulacao: false, frameNodeId: null, instanceNodeId: null };
      tabVariationsData.push(varData);
    }
    tabOrderData = varData.tab_order || [];
    semTabulacao = varData.sem_tabulacao || false;
    el('chkSemTabulacao').checked = semTabulacao;
    el('tabFooter').style.display = semTabulacao ? 'none' : 'flex';
    renderTabOrderList();
    el('tabMainViewLabel').textContent = id === 'default' ? 'Default' : varData.nome;
    if (id === 'default') {
      parent.postMessage({ pluginMessage: { type: 'deactivate-tab-variation' } }, '*');
      showTabView('main');
    } else if (varData.instanceNodeId) {
      parent.postMessage({ pluginMessage: { type: 'activate-tab-variation', instanceNodeId: varData.instanceNodeId } }, '*');
      showTabView('main');
    } else {
      parent.postMessage({ pluginMessage: { type: 'create-tab-variation-frame', nome: varData.nome, propriedades: varData.propriedades || {} } }, '*');
      // showTabView('main') chamado quando tab-variation-frame-created chegar
    }
  }

  function backToTabVariationList() {
    if (currentTabVariationId) {
      const varData = tabVariationsData.find(v => v.id === currentTabVariationId);
      if (varData) {
        varData.tab_order = [...tabOrderData];
        varData.sem_tabulacao = el('chkSemTabulacao').checked;
      }
    }
    parent.postMessage({ pluginMessage: { type: 'deactivate-tab-variation' } }, '*');
    currentTabVariationId = null;
    renderTabVariationList();
    showTabView('list');
  }

  function deleteTabVariation(id) {
    const idx = tabVariationsData.findIndex(v => v.id === id);
    if (idx === -1) return;
    const v = tabVariationsData[idx];
    if (v.frameNodeId) {
      parent.postMessage({ pluginMessage: { type: 'delete-tab-variation-frame', frameNodeId: v.frameNodeId } }, '*');
    }
    tabVariationsData.splice(idx, 1);
    renderTabVariationList();
  }

  function openTabVariationForm() {
    el('tabVarNomeInput').value = '';
    renderTabVariationProps();
    parent.postMessage({ pluginMessage: { type: 'get-component-properties' } }, '*');
    el('tabVariationFormView').classList.add('open');
  }

  function closeTabVariationForm() {
    el('tabVariationFormView').classList.remove('open');
  }

  function renderTabVariationProps() {
    const container = el('tabVarPropsContainer');
    if (!container) return;
    container.innerHTML = '';
    if (componentProps.length === 0) {
      container.innerHTML = '<div style="font-size:12px;color:#999;">Nenhuma propriedade VARIANT/BOOLEAN encontrada no componente.</div>';
      return;
    }
    componentProps.forEach(prop => {
      if (prop.type === 'VARIANT') {
        const opts = (prop.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
        container.innerHTML += `<div class='touch-form-row'><label>${prop.name}</label><select class='touch-form-input tab-var-prop-select' data-prop='${prop.name}' style='cursor:pointer;'>${opts}</select></div>`;
      } else if (prop.type === 'BOOLEAN') {
        container.innerHTML += `<div class='touch-form-row' style='flex-direction:row;align-items:center;gap:8px;'><input type='checkbox' class='tab-var-prop-check' data-prop='${prop.name}' style='accent-color:#2D4496;width:14px;height:14px;'><label style='font-size:12px;font-weight:600;color:#555;margin:0;'>${prop.name}</label></div>`;
      }
    });
  }

  function collectTabVariationProps() {
    const props = {};
    document.querySelectorAll('.tab-var-prop-select').forEach(sel => { props[sel.dataset.prop] = sel.value; });
    document.querySelectorAll('.tab-var-prop-check').forEach(chk => { props[chk.dataset.prop] = chk.checked; });
    return props;
  }

```

- [ ] **Step 3: Wire up new buttons (after existing `el('btnAddVariation').onclick` wiring, around line 1235–1237)**

Find:
```javascript
el('btnAddTouch').onclick = () => { openTouchForm(); };
el('btnAddVariation').onclick = () => { openVariationForm(); };
el('btnBackToVariations').onclick = () => { backToVariationList(); };
el('btnVariationFormCancel').onclick = () => { closeVariationForm(); };
```
Replace with:
```javascript
el('btnAddTouch').onclick = () => { openTouchForm(); };
el('btnAddVariation').onclick = () => { openVariationForm(); };
el('btnBackToVariations').onclick = () => { backToVariationList(); };
el('btnVariationFormCancel').onclick = () => { closeVariationForm(); };
el('btnBackToTabVariations').onclick = () => { backToTabVariationList(); };
el('btnAddTabVariation').onclick = () => { openTabVariationForm(); };
el('btnTabVariationFormCancel').onclick = () => { closeTabVariationForm(); };
el('btnTabVariationFormCreate').onclick = () => {
  const nome = el('tabVarNomeInput').value.trim();
  if (!nome) { el('tabVarNomeInput').focus(); return; }
  const propriedades = collectTabVariationProps();
  const id = generateId();
  tabVariationsData.push({ id, nome, propriedades, tab_order: [], sem_tabulacao: false, frameNodeId: null, instanceNodeId: null });
  currentTabVariationId = id;
  const btn = el('btnTabVariationFormCreate');
  btn.textContent = '⏳ Criando…';
  btn.disabled = true;
  parent.postMessage({ pluginMessage: { type: 'create-tab-variation-frame', nome, propriedades } }, '*');
};
```

- [ ] **Step 4: Update tab switching to also close `tabVariationFormView`**

Find:
```javascript
      btn.onclick = () => {
        // Cancelar forms abertos ao trocar de aba
        if (el('touchFormView').classList.contains('open')) el('btnTouchCancel').click();
        if (el('tabFormView').classList.contains('open')) closeTabForm();
```
Replace with:
```javascript
      btn.onclick = () => {
        // Cancelar forms abertos ao trocar de aba
        if (el('touchFormView').classList.contains('open')) el('btnTouchCancel').click();
        if (el('tabFormView').classList.contains('open')) closeTabForm();
        if (el('tabVariationFormView') && el('tabVariationFormView').classList.contains('open')) closeTabVariationForm();
```

- [ ] **Step 5: Add `tab-variation-frame-created` handler inside `window.onmessage` (after the existing `variation-frame-created` block)**

Find:
```javascript
      if (msg.type === 'variation-frame-created') {
```
Add **after** the closing `}` of that block:
```javascript
      if (msg.type === 'tab-variation-frame-created') {
        const targetVar = tabVariationsData.find(v => v.id === currentTabVariationId && !v.frameNodeId)
          || tabVariationsData[tabVariationsData.length - 1];
        if (targetVar && !targetVar.frameNodeId) {
          targetVar.frameNodeId = msg.frameNodeId;
          targetVar.instanceNodeId = msg.instanceNodeId;
        }
        const btnCreate = el('btnTabVariationFormCreate');
        if (btnCreate) { btnCreate.textContent = 'Criar variante'; btnCreate.disabled = false; }
        // Se abriu via editTabVariation (form fechado), ativa e abre main view
        if (currentTabVariationId && currentTabVariationId !== 'default' && !el('tabVariationFormView').classList.contains('open')) {
          const v = tabVariationsData.find(v => v.id === currentTabVariationId);
          if (v) {
            parent.postMessage({ pluginMessage: { type: 'activate-tab-variation', instanceNodeId: v.instanceNodeId } }, '*');
          }
        } else {
          closeTabVariationForm();
        }
        renderTabVariationList();
        showTabView('main');
      }
```

- [ ] **Step 6: Update `component-properties-ready` handler to also render tab variation props**

Find:
```javascript
      if (msg.type === 'component-properties-ready') {
        componentProps = msg.props || [];
        renderVariationProps();
      }
```
Replace with:
```javascript
      if (msg.type === 'component-properties-ready') {
        componentProps = msg.props || [];
        if (el('touchVariationFormView') && el('touchVariationFormView').classList.contains('open')) renderVariationProps();
        if (el('tabVariationFormView') && el('tabVariationFormView').classList.contains('open')) renderTabVariationProps();
      }
```

---

## Task 6: ui.html — Update setup-ui handler + onSemTabulacaoChange + updateSummaryCards + btnRun + initialization

**Files:**
- Modify: `ui.html`

- [ ] **Step 1: Update `setup-ui` handler to initialize `tabVariationsData` with migration from old `tab_order` data**

Find (around line 704–708):
```javascript
        tabOrderData = msg.componentData?.tab_order || [];
        semTabulacao = msg.componentData?.sem_tabulacao || false;
        el('chkSemTabulacao').checked = semTabulacao;
        el('tabFooter').style.display = semTabulacao ? 'none' : 'flex';
        renderTabOrderList();
```
Replace with:
```javascript
        tabVariationsData = msg.componentData?.variacoes_tabulacao || [];
        // Migração: se não tem variações mas tem tab_order antigo, cria variação default com esses dados
        if (!tabVariationsData.find(v => v.id === 'default')) {
          tabVariationsData.unshift({ id: 'default', nome: 'Default', propriedades: {}, tab_order: msg.componentData?.tab_order || [], sem_tabulacao: msg.componentData?.sem_tabulacao || false, frameNodeId: null, instanceNodeId: null });
        }
        const defaultTabVar = tabVariationsData.find(v => v.id === 'default');
        tabOrderData = defaultTabVar?.tab_order || [];
        semTabulacao = defaultTabVar?.sem_tabulacao || false;
        el('chkSemTabulacao').checked = semTabulacao;
        el('tabFooter').style.display = semTabulacao ? 'none' : 'flex';
        renderTabOrderList();
        renderTabVariationList();
```

- [ ] **Step 2: Update `onSemTabulacaoChange` to also save state back to active variation**

Find the entire `onSemTabulacaoChange` function:
```javascript
    function onSemTabulacaoChange() {
      semTabulacao = el('chkSemTabulacao').checked;
      el('tabFooter').style.display = semTabulacao ? 'none' : 'flex';
      if (semTabulacao) {
        tabOrderData = [];
        renderTabOrderList();
      }
      updateSummaryCards();
    }
```
Replace with:
```javascript
    function onSemTabulacaoChange() {
      semTabulacao = el('chkSemTabulacao').checked;
      el('tabFooter').style.display = semTabulacao ? 'none' : 'flex';
      if (semTabulacao) {
        tabOrderData = [];
        renderTabOrderList();
      }
      // Persiste na variação ativa
      if (currentTabVariationId) {
        const varData = tabVariationsData.find(v => v.id === currentTabVariationId);
        if (varData) {
          varData.sem_tabulacao = semTabulacao;
          if (semTabulacao) varData.tab_order = [];
        }
      }
      updateSummaryCards();
    }
```

- [ ] **Step 3: Update `updateSummaryCards` tab section to count across all variations**

Find (around line 630–638):
```javascript
      const tabPill = tabOrderData.length;
      const summaryTabCard = el('summaryTabCard');
      if (summaryTabCard) {
        summaryTabCard.style.display = tabPill > 0 ? 'block' : 'none';
        const tabPills = el('summaryTabPills');
        if (tabPills) tabPills.innerHTML = tabPill > 0
          ? `<span class='summary-pill'>${tabPill} foco${tabPill !== 1 ? 's' : ''}</span>`
          : '';
      }
```
Replace with:
```javascript
      const totalTabItems = tabVariationsData.reduce((sum, v) => {
        const items = v.id === currentTabVariationId ? tabOrderData : (v.tab_order || []);
        return sum + (v.sem_tabulacao ? 0 : items.length);
      }, 0);
      const totalTabVars = tabVariationsData.filter(v => v.id !== 'default').length;
      const summaryTabCard = el('summaryTabCard');
      if (summaryTabCard) {
        summaryTabCard.style.display = totalTabItems > 0 ? 'block' : 'none';
        const tabPills = el('summaryTabPills');
        if (tabPills) {
          tabPills.innerHTML = '';
          if (totalTabVars > 0) tabPills.innerHTML += `<span class='summary-pill'>${totalTabVars} variação${totalTabVars !== 1 ? 'ões' : ''}</span>`;
          if (totalTabItems > 0) tabPills.innerHTML += `<span class='summary-pill'>${totalTabItems} foco${totalTabItems !== 1 ? 's' : ''}</span>`;
        }
      }
```

Also update the final `hasSomething` check. Find:
```javascript
      el('summaryCards').style.display = hasSomething || totalAreas > 0 || tabPill > 0 ? 'flex' : 'none';
```
Replace with:
```javascript
      el('summaryCards').style.display = hasSomething || totalAreas > 0 || totalTabItems > 0 ? 'flex' : 'none';
```

- [ ] **Step 4: Update `btnRun.onclick` to save active tab variation and send `variacoes_tabulacao`**

Find (around line 1290):
```javascript
    el('btnRun').onclick = () => {
      const sb = el('statusBar');
      sb.classList.remove('loading', 'success', 'error');
      sb.classList.add('loading');
      sb.textContent = 'Gerando handoff...';

      const p = Array.from(document.querySelectorAll('input[name="platform"]:checked')).map(c => c.value);
      const z = Array.from(document.querySelectorAll('input[name="zoom"]:checked')).map(c => c.value);
      parent.postMessage({ pluginMessage: {
        type: 'run-handoff', plataformas: p, zoom: z, mapeamentos: currentData,
        areas_toque: touchData, sem_toque: el('chkSemToque').checked,
        componentName: el('compName').textContent,
        variacoes: variationsData,
        tab_order: tabOrderData,
        sem_tabulacao: semTabulacao
      }}, '*');
    };
```
Replace with:
```javascript
    el('btnRun').onclick = () => {
      const sb = el('statusBar');
      sb.classList.remove('loading', 'success', 'error');
      sb.classList.add('loading');
      sb.textContent = 'Gerando handoff...';

      // Salva estado da variação de tabulação ativa antes de enviar
      if (currentTabVariationId) {
        const varData = tabVariationsData.find(v => v.id === currentTabVariationId);
        if (varData) {
          varData.tab_order = [...tabOrderData];
          varData.sem_tabulacao = el('chkSemTabulacao').checked;
        }
      }

      const p = Array.from(document.querySelectorAll('input[name="platform"]:checked')).map(c => c.value);
      const z = Array.from(document.querySelectorAll('input[name="zoom"]:checked')).map(c => c.value);
      parent.postMessage({ pluginMessage: {
        type: 'run-handoff', plataformas: p, zoom: z, mapeamentos: currentData,
        areas_toque: touchData, sem_toque: el('chkSemToque').checked,
        componentName: el('compName').textContent,
        variacoes: variationsData,
        variacoes_tabulacao: tabVariationsData,
      }}, '*');
    };
```

- [ ] **Step 5: Update initialization block to call `showTabView('list')` and `renderTabVariationList()`**

Find (around line 1285–1286):
```javascript
  resetTouchForm();
  showView('list');

  parent.postMessage({ pluginMessage: { type: 'load-initial-data' } }, '*');
```
Replace with:
```javascript
  resetTouchForm();
  showView('list');
  showTabView('list');

  parent.postMessage({ pluginMessage: { type: 'load-initial-data' } }, '*');
```

- [ ] **Step 6: Verify no JS errors by checking for undefined references**

```bash
grep -n 'tabVariationsData\|currentTabVariationId\|tabOrderData\|showTabView\|renderTabVariationList\|editTabVariation\|backToTabVariationList' "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff/ui.html" | wc -l
```
Expected: at least 25 matches (many references across functions).

- [ ] **Step 7: Final TypeScript build check**

```bash
cd "/Volumes/Artoria/Documents/Caixa/Plugins/DSC A11Y Handoff" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

---

## Self-Review

**Spec coverage:**
- ✅ Variation list with Default + custom variants — renderTabVariationList
- ✅ Each variation has independent tab_order — tabVariationsData structure
- ✅ `[a11y] Order` resets to 1 per variation — `for (let i = 0; ...)` inside variation loop
- ✅ `[dsc-h] Item Number` counts globally — `globalItemCounter` across variations
- ✅ Same frame lifecycle — `[A11Y Tab Variação]` created/deleted same as `[A11Y Variação]`
- ✅ Preview side-by-side — same PAD/GAP constants as touch area
- ✅ Data persistence — `variacoes_tabulacao` in all 3 save locations
- ✅ Migration from old `tab_order` format — in setup-ui handler
- ✅ Save active variation before handoff — in btnRun.onclick
- ✅ Tab switching closes variation form — in btn.onclick handler

**Placeholder scan:** No TBDs or "implement later" found.

**Type consistency:** `tabVariationsData` items always carry `{ id, nome, propriedades, tab_order, sem_tabulacao, frameNodeId, instanceNodeId }`. All functions reference these exact keys.
