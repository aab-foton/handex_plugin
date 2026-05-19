# Variações de Leitor de Tela — Plano de Implementação

**Goal:** Adicionar suporte a variações no painel Leitor de Tela, espelhando o padrão das variações de Tabulação. Cada variante de componente terá seu próprio conjunto de `conectores_leitor` e flag `sem_leitor`. O handoff usa a variação Default (MVP); suporte a múltiplas seções no template é trabalho futuro.

**Nota V1:** Handoff continua usando `msg.conectores_leitor` + `msg.sem_leitor`, que a UI popula a partir da variação ativa. `variacoes_leitor` é salvo para persistência e carregado de volta — mas a geração do template não itera variações ainda.

---

## Mapa de mudanças

| Arquivo | Tasks |
|---------|-------|
| `code.ts` | A1–A7 |
| `ui.html` | B1–B9 |

---

## TASKS code.ts

### A1 — Global `componenteSRVariacaoAtivo`

**Arquivo:** `code.ts`

Localizar (linha ~12):
```typescript
let componenteTabVariacaoAtivo: SceneNode | null = null;
```

Substituir por:
```typescript
let componenteTabVariacaoAtivo: SceneNode | null = null;
let componenteSRVariacaoAtivo: SceneNode | null = null;
```

**Verificação:** `grep -n "componenteSRVariacaoAtivo" code.ts` → 1 resultado na linha ~13.

---

### A2 — Handler `create-sr-variation-frame`

**Arquivo:** `code.ts`

Localizar o bloco (linha ~1196):
```typescript
  else if (msg.type === 'create-tab-variation-frame') {
```

Inserir ANTES desse bloco (mantendo-o intacto):
```typescript
  else if (msg.type === 'create-sr-variation-frame') {
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
      const frameName = `[A11Y LT Variação] ${msg.nome}`;
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
      figma.ui.postMessage({ type: 'sr-variation-frame-created', frameNodeId: varFrame.id, instanceNodeId: instance.id });
    } catch (e) {
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar frame de variação de leitor: ${e}` });
    }
  }

```

**Verificação:** `grep -n "create-sr-variation-frame" code.ts` → 1 resultado. Últimas 15 linhas do arquivo intactas.

---

### A3 — Handlers `activate-sr-variation`, `deactivate-sr-variation`, `delete-sr-variation-frame`

**Arquivo:** `code.ts`

Localizar (linha ~1249):
```typescript
  else if (msg.type === 'deactivate-tab-variation') {
    componenteTabVariacaoAtivo = null;
  }

  else if (msg.type === 'delete-tab-variation-frame') {
```

Inserir APÓS o bloco `delete-tab-variation-frame` completo (depois do seu `}`), antes do próximo `else if`:
```typescript

  else if (msg.type === 'activate-sr-variation') {
    try {
      if (msg.instanceNodeId) {
        const node = await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null;
        componenteSRVariacaoAtivo = node;
      } else {
        componenteSRVariacaoAtivo = null;
      }
    } catch (e) {
      componenteSRVariacaoAtivo = null;
    }
  }

  else if (msg.type === 'deactivate-sr-variation') {
    componenteSRVariacaoAtivo = null;
  }

  else if (msg.type === 'delete-sr-variation-frame') {
    if (msg.frameNodeId) {
      try {
        const node = await figma.getNodeByIdAsync(msg.frameNodeId);
        if (node) node.remove();
      } catch (e) {}
    }
  }
```

**Verificação:** `grep -n "activate-sr-variation\|deactivate-sr-variation\|delete-sr-variation-frame" code.ts` → 3 resultados. Últimas 15 linhas intactas.

---

### A4 — Atualizar `get-sr-selection` e `create-sr-overlay` para usar `componenteSRVariacaoAtivo`

**Arquivo:** `code.ts`

**Ocorrência 1** — em `get-sr-selection` (linha ~1286):
```typescript
    const comp = (componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as SceneNode & { absoluteTransform: Transform };
```
Substituir por:
```typescript
    const comp = (componenteSRVariacaoAtivo ?? componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as SceneNode & { absoluteTransform: Transform };
```

**Ocorrência 2** — em `create-sr-overlay` (linha ~1314):
```typescript
    const comp = (componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as SceneNode & { absoluteTransform: Transform };
```
Substituir por:
```typescript
    const comp = (componenteSRVariacaoAtivo ?? componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as SceneNode & { absoluteTransform: Transform };
```

**Verificação:** `grep -n "componenteSRVariacaoAtivo" code.ts` → 3 resultados (global + 2 usos). Últimas 15 linhas intactas.

---

### A5 — Adicionar `variacoes_leitor` ao `componentData` padrão

**Arquivo:** `code.ts`

Localizar (linha ~1526):
```typescript
  let componentData: any = { plataformas: [], zoom: [], mapeamentos: [], areas_toque: [], sem_toque: false, variacoes: [], variacoes_tabulacao: [], conectores_leitor: [], sem_leitor: false };
```
Substituir por:
```typescript
  let componentData: any = { plataformas: [], zoom: [], mapeamentos: [], areas_toque: [], sem_toque: false, variacoes: [], variacoes_tabulacao: [], variacoes_leitor: [], conectores_leitor: [], sem_leitor: false };
```

**Verificação:** `grep -n "variacoes_leitor" code.ts` → pelo menos 1 resultado. Últimas 15 linhas intactas.

---

### A6 — Atualizar `save-leitor-tela` para salvar `variacoes_leitor`

**Arquivo:** `code.ts`

Localizar (linha ~1268):
```typescript
    dados.conectores_leitor = msg.conectores_leitor ?? [];
    dados.sem_leitor = msg.sem_leitor ?? false;
```
Substituir por:
```typescript
    dados.conectores_leitor = msg.conectores_leitor ?? [];
    dados.sem_leitor = msg.sem_leitor ?? false;
    dados.variacoes_leitor = msg.variacoes_leitor ?? [];
```

**Verificação:** `grep -n "variacoes_leitor" code.ts` — resultado esperado em pelo menos 2 linhas. Últimas 15 linhas intactas.

---

### A7 — Adicionar `variacoes_leitor` aos 3 blocos de persistência do run-handoff + limpeza de frames

**Arquivo:** `code.ts`

**Parte 1 — Limpeza de frames SR após handoff** (linha ~875):

Localizar:
```typescript
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Tab Variação]')).forEach(n => n.remove());
```
Substituir por:
```typescript
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Tab Variação]')).forEach(n => n.remove());
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y LT Variação]')).forEach(n => n.remove());
```

**Parte 2 — Zerar frameNodeId/instanceNodeId de variacoes_leitor** (após o bloco `if (msg.variacoes)`, linha ~893):

Localizar:
```typescript
    if (msg.variacoes) {
      for (const v of msg.variacoes) {
        if (v.id !== 'default') {
          v.frameNodeId = null;
          v.instanceNodeId = null;
        }
      }
    }
```
Substituir por:
```typescript
    if (msg.variacoes) {
      for (const v of msg.variacoes) {
        if (v.id !== 'default') {
          v.frameNodeId = null;
          v.instanceNodeId = null;
        }
      }
    }
    if (msg.variacoes_leitor) {
      for (const v of msg.variacoes_leitor) {
        if (v.id !== 'default') {
          v.frameNodeId = null;
          v.instanceNodeId = null;
        }
      }
    }
```

**Parte 3 — Os 3 blocos `dataToSave`** (linhas ~897-941): em cada um dos 3 objetos JSON, adicionar `variacoes_leitor: msg.variacoes_leitor || [],` após `variacoes_tabulacao: msg.variacoes_tabulacao || [],`.

Os 3 blocos têm este padrão (repetido 3 vezes — altere TODAS):
```typescript
        variacoes_tabulacao: msg.variacoes_tabulacao || [],
        conectores_leitor: msg.conectores_leitor || [],
```
Substituir (nas 3 ocorrências) por:
```typescript
        variacoes_tabulacao: msg.variacoes_tabulacao || [],
        variacoes_leitor: msg.variacoes_leitor || [],
        conectores_leitor: msg.conectores_leitor || [],
```

**Verificação:** `grep -n "variacoes_leitor" code.ts` → pelo menos 6 resultados. `npx tsc --noEmit` deve passar. Últimas 15 linhas intactas.

---

## TASKS ui.html

### B1 — CSS para views de variação SR

**Arquivo:** `ui.html`

Localizar (CSS do leitor, linha ~154):
```css
    #panel-leitor.tab-panel.active { display: flex; flex: 1; flex-direction: column; padding: 0; overflow: hidden; }
    #panel-leitor { position: relative; overflow: hidden; }
    #leitorListWrapper { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
```
Substituir por:
```css
    #panel-leitor.tab-panel.active { display: flex; flex: 1; flex-direction: column; padding: 0; overflow: hidden; }
    #panel-leitor { position: relative; overflow: hidden; }
    #leitorListWrapper { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    #srVariationListView { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    #srVariationListView.hidden { display: none !important; }
    #srMainView { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    #srMainView.hidden { display: none !important; }
    #srVariationFormView { display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #fff; flex-direction: column; z-index: 20; }
    #srVariationFormView.open { display: flex; }
```

**Verificação:** `grep -n "srVariationListView\|srMainView\|srVariationFormView" ui.html` → pelo menos 6 resultados em CSS. Verificar fim do arquivo (</html> presente).

---

### B2 — Reestruturar HTML do `#panel-leitor`

**Arquivo:** `ui.html`

Localizar o bloco completo (linhas ~502-517):
```html
      <div id="panel-leitor" class="tab-panel">

        <!-- LISTA -->
        <div id="leitorListWrapper">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:4px;">
            <input type="checkbox" id="chk-sem-leitor" onchange="onSemLeitorChange()">
            Sem anotações de leitor de tela
          </label>
          <div id="leitor-list-container">
            <ul id="leitor-list" style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;"></ul>
          </div>
        </div>
        <div class="tab-footer" id="leitorFooter">
          <button class="tab-add-btn" onclick="openSRForm()">+ Adicionar Conector</button>
        </div>
```

Substituir por:
```html
      <div id="panel-leitor" class="tab-panel">

        <!-- VIEW 1: LISTA DE VARIAÇÕES -->
        <div id='srVariationListView'>
          <div style='flex:1;overflow-y:auto;padding:12px 16px;'>
            <div id='srVariationList' style='display:flex;flex-direction:column;gap:6px;'></div>
          </div>
          <div style='flex-shrink:0;padding:10px 16px 14px;border-top:1px solid #F0F0F0;background:#fff;'>
            <button id='btnAddSRVariation' style='width:100%;padding:10px;background:none;border:1.5px dashed #BBBFC8;border-radius:10px;color:#2D4496;font-size:12px;font-weight:700;cursor:pointer;'>+ Nova variante parametrizada</button>
          </div>
        </div>

        <!-- VIEW 2: MAIN (conteúdo da variação ativa) -->
        <div id='srMainView' class='hidden'>
          <div id='srMainViewHeader' style='flex-shrink:0;padding:10px 16px;border-bottom:1px solid #F0F0F0;display:flex;align-items:center;gap:8px;'>
            <button id='btnBackToSRVariations' style='background:none;border:none;font-size:12px;font-weight:700;color:#2D4496;cursor:pointer;padding:4px 0;'>← Voltar</button>
            <span id='srMainViewLabel' style='font-size:13px;font-weight:700;color:#1a1a1a;flex:1;'>Default</span>
          </div>
          <!-- LISTA -->
          <div id="leitorListWrapper">
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:4px;">
              <input type="checkbox" id="chk-sem-leitor" onchange="onSemLeitorChange()">
              Sem anotações de leitor de tela
            </label>
            <div id="leitor-list-container">
              <ul id="leitor-list" style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;"></ul>
            </div>
          </div>
          <div class="tab-footer" id="leitorFooter">
            <button class="tab-add-btn" onclick="openSRForm()">+ Adicionar Conector</button>
          </div>
        </div>

        <!-- VIEW 3: FORM NOVA VARIAÇÃO (overlay absoluto z-index:20) -->
        <div id='srVariationFormView'>
          <div style='flex-shrink:0;padding:12px 16px;border-bottom:1px solid #F0F0F0;display:flex;align-items:center;'>
            <span style='font-size:13px;font-weight:700;color:#1a1a1a;flex:1;'>Nova variante parametrizada</span>
          </div>
          <div style='flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:14px;'>
            <div class='touch-form-row'>
              <label>Nome</label>
              <input type='text' id='srVarNomeInput' class='touch-form-input' placeholder='Ex: Mobile, Expandido, Hover…'>
            </div>
            <div id='srVarPropsContainer' style='display:flex;flex-direction:column;gap:10px;'></div>
          </div>
          <div style='flex-shrink:0;padding:12px 16px 16px;border-top:1px solid #F0F0F0;background:#fff;display:flex;flex-direction:column;gap:8px;align-items:center;'>
            <button id='btnSRVariationFormCreate' style='width:100%;padding:12px;background:#2D4496;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;box-sizing:border-box;'>Criar variante</button>
            <button id='btnSRVariationFormCancel' style='background:none;border:none;font-size:12px;font-weight:700;color:#2D4496;cursor:pointer;padding:4px 0;'>Cancelar</button>
          </div>
        </div>
```

**Verificação:** `grep -n "srVariationListView\|srMainView\|srVariationFormView\|srVariationList\|btnAddSRVariation" ui.html` → pelo menos 5 resultados em HTML. Verificar fim do arquivo.

---

### B3 — Variáveis JS `srVariationsData` e `currentSRVariationId`

**Arquivo:** `ui.html`

Localizar (linha ~1123):
```javascript
  let tabVariationsData = []; // array de variações de tabulação: [{ id, nome, propriedades, tab_order, sem_tabulacao, frameNodeId, instanceNodeId }]
```
Inserir APÓS essa linha:
```javascript
  let srVariationsData = []; // array de variações de leitor: [{ id, nome, propriedades, conectores_leitor, sem_leitor, frameNodeId, instanceNodeId }]
  let currentSRVariationId = 'default';
```

**Verificação:** `grep -n "srVariationsData\|currentSRVariationId" ui.html` → 2 resultados. Fim do arquivo intacto.

---

### B4 — Funções `showSRView` e `renderSRVariationList`

**Arquivo:** `ui.html`

Localizar (linha ~1334):
```javascript
  function showTabView(viewId) {
```
Inserir ANTES dessa função:
```javascript
  function showSRView(viewId) {
    const listView = el('srVariationListView');
    const mainView = el('srMainView');
    if (listView) listView.classList.toggle('hidden', viewId !== 'list');
    if (mainView) mainView.classList.toggle('hidden', viewId !== 'main');
  }

  function renderSRVariationList() {
    const container = el('srVariationList');
    if (!container) return;
    container.innerHTML = '';
    const defData = srVariationsData.find(v => v.id === 'default') || { id: 'default', nome: 'Default', propriedades: {}, conectores_leitor: [], sem_leitor: false };
    const defCount = (defData.conectores_leitor || []).length;
    const defItem = document.createElement('div');
    defItem.style.cssText = 'padding:10px 12px;border:1.5px solid #E0E4EF;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;';
    defItem.innerHTML = `<span style="font-size:13px;font-weight:700;color:#1a1a1a;">Default</span><span style="font-size:11px;color:#888;">${defCount} conector${defCount !== 1 ? 'es' : ''}</span>`;
    defItem.onclick = () => selectSRVariation('default');
    container.appendChild(defItem);
    const customs = srVariationsData.filter(v => v.id !== 'default');
    customs.forEach(v => {
      const count = (v.conectores_leitor || []).length;
      const item = document.createElement('div');
      item.style.cssText = 'padding:10px 12px;border:1.5px solid #E0E4EF;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;';
      item.innerHTML = `<span style="font-size:13px;font-weight:700;color:#1a1a1a;flex:1;">${v.nome}</span><span style="font-size:11px;color:#888;">${count} conector${count !== 1 ? 'es' : ''}</span><button style="background:none;border:none;color:#999;cursor:pointer;font-size:14px;padding:0 4px;" onclick="event.stopPropagation();deleteSRVariation('${v.id}')">×</button>`;
      item.onclick = () => selectSRVariation(v.id);
      container.appendChild(item);
    });
  }
```

**Verificação:** `grep -n "showSRView\|renderSRVariationList" ui.html` → pelo menos 2 definições. Fim do arquivo intacto.

---

### B5 — Função `selectSRVariation`

**Arquivo:** `ui.html`

Inserir logo após `renderSRVariationList` (antes de `showTabView`):
```javascript
  function selectSRVariation(id) {
    let varData = srVariationsData.find(v => v.id === id);
    if (!varData) {
      varData = { id, nome: id, propriedades: {}, conectores_leitor: [], sem_leitor: false, frameNodeId: null, instanceNodeId: null };
      srVariationsData.push(varData);
    }
    currentSRVariationId = id;
    leitorState.conectores = varData.conectores_leitor || [];
    leitorState.semLeitor = varData.sem_leitor || false;
    const label = el('srMainViewLabel');
    if (label) label.textContent = varData.nome || 'Default';
    if (id !== 'default' && !varData.frameNodeId) {
      parent.postMessage({ pluginMessage: { type: 'deactivate-sr-variation' } }, '*');
      parent.postMessage({ pluginMessage: { type: 'create-sr-variation-frame', nome: varData.nome, propriedades: varData.propriedades || {} } }, '*');
    } else if (id !== 'default' && varData.instanceNodeId) {
      parent.postMessage({ pluginMessage: { type: 'activate-sr-variation', instanceNodeId: varData.instanceNodeId } }, '*');
      showSRView('main');
    } else {
      parent.postMessage({ pluginMessage: { type: 'deactivate-sr-variation' } }, '*');
      showSRView('main');
    }
    renderLeitorList();
  }

  function deleteSRVariation(id) {
    const v = srVariationsData.find(v => v.id === id);
    if (v && v.frameNodeId) {
      parent.postMessage({ pluginMessage: { type: 'delete-sr-variation-frame', frameNodeId: v.frameNodeId } }, '*');
    }
    srVariationsData = srVariationsData.filter(v => v.id !== id);
    if (currentSRVariationId === id) {
      currentSRVariationId = 'default';
      const def = srVariationsData.find(v => v.id === 'default');
      if (def) { leitorState.conectores = def.conectores_leitor || []; leitorState.semLeitor = def.sem_leitor || false; }
      parent.postMessage({ pluginMessage: { type: 'deactivate-sr-variation' } }, '*');
    }
    renderSRVariationList();
  }
```

**Verificação:** `grep -n "selectSRVariation\|deleteSRVariation" ui.html` → pelo menos 2 definições. Fim do arquivo intacto.

---

### B6 — Funções do form de variação

**Arquivo:** `ui.html`

Inserir logo após `deleteSRVariation`:
```javascript
  function openSRVariationForm() {
    const input = el('srVarNomeInput');
    if (input) input.value = '';
    renderSRVariationProps();
    el('srVariationFormView').classList.add('open');
  }

  function closeSRVariationForm() {
    el('srVariationFormView').classList.remove('open');
  }

  function renderSRVariationProps() {
    const container = el('srVarPropsContainer');
    if (!container) return;
    container.innerHTML = '';
    if (!componentProperties || Object.keys(componentProperties).length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:#888;margin:0;">Nenhuma propriedade de variante disponível.</p>';
      return;
    }
    Object.entries(componentProperties).forEach(([key, prop]) => {
      if ((prop as any).type !== 'VARIANT') return;
      const row = document.createElement('div');
      row.className = 'touch-form-row';
      const options = ((prop as any).variantOptions || []).map((opt: string) =>
        `<option value="${opt}">${opt}</option>`
      ).join('');
      row.innerHTML = `<label>${key}</label><select class="touch-form-input" data-prop="${key}"><option value="">— manter padrão —</option>${options}</select>`;
      container.appendChild(row);
    });
  }

  function saveSRVariationForm() {
    const nome = (el('srVarNomeInput') as HTMLInputElement)?.value?.trim();
    if (!nome) return;
    const propriedades: Record<string, string> = {};
    el('srVarPropsContainer').querySelectorAll('select[data-prop]').forEach((sel: any) => {
      if (sel.value) propriedades[sel.dataset.prop] = sel.value;
    });
    const id = 'sr_' + Date.now();
    srVariationsData.push({ id, nome, propriedades, conectores_leitor: [], sem_leitor: false, frameNodeId: null, instanceNodeId: null });
    closeSRVariationForm();
    selectSRVariation(id);
  }
```

**Verificação:** `grep -n "openSRVariationForm\|closeSRVariationForm\|saveSRVariationForm\|renderSRVariationProps" ui.html` → 4 definições. Fim do arquivo intacto.

---

### B7 — Atualizar `setup-ui` para inicializar `srVariationsData`

**Arquivo:** `ui.html`

Localizar (linha ~893):
```javascript
        leitorState.rolesList = msg.rolesList || [];
        leitorState.conectores = msg.componentData?.conectores_leitor || [];
        leitorState.semLeitor = msg.componentData?.sem_leitor || false;
```
Substituir por:
```javascript
        leitorState.rolesList = msg.rolesList || [];
        srVariationsData = msg.componentData?.variacoes_leitor || [];
        if (!srVariationsData.find(v => v.id === 'default')) {
          srVariationsData.unshift({ id: 'default', nome: 'Default', propriedades: {}, conectores_leitor: msg.componentData?.conectores_leitor || [], sem_leitor: msg.componentData?.sem_leitor || false, frameNodeId: null, instanceNodeId: null });
        }
        currentSRVariationId = 'default';
        const defaultSRVar = srVariationsData.find(v => v.id === 'default');
        leitorState.conectores = defaultSRVar?.conectores_leitor || [];
        leitorState.semLeitor = defaultSRVar?.sem_leitor || false;
        renderSRVariationList();
        showSRView('list');
```

**Verificação:** `grep -n "srVariationsData\|renderSRVariationList\|showSRView" ui.html` → pelo menos 3 resultados. Fim do arquivo intacto.

---

### B8 — Sincronizar variação ativa ao salvar / `onSemLeitorChange` / `renderLeitorList`

**Arquivo:** `ui.html`

**Parte 1** — No final de `renderLeitorList` (antes do `}` de fechamento da função), adicionar sincronização com a variação ativa. Localizar dentro de `renderLeitorList`:

```javascript
      el('chk-sem-leitor').checked = leitorState.semLeitor;
      el('leitor-list-container').style.display = leitorState.semLeitor ? 'none' : '';
      el('leitorFooter').style.display = leitorState.semLeitor ? 'none' : 'flex';
```
Substituir por:
```javascript
      el('chk-sem-leitor').checked = leitorState.semLeitor;
      el('leitor-list-container').style.display = leitorState.semLeitor ? 'none' : '';
      el('leitorFooter').style.display = leitorState.semLeitor ? 'none' : 'flex';
      // Sincroniza de volta com srVariationsData
      const activeSRVar = srVariationsData.find(v => v.id === currentSRVariationId);
      if (activeSRVar) {
        activeSRVar.conectores_leitor = leitorState.conectores;
        activeSRVar.sem_leitor = leitorState.semLeitor;
      }
```

**Parte 2** — Em `onSemLeitorChange`, ao final da função (antes do `}`), após `leitorState.semLeitor = el('chk-sem-leitor').checked;`, adicionar:
```javascript
      const activeSRVar2 = srVariationsData.find(v => v.id === currentSRVariationId);
      if (activeSRVar2) activeSRVar2.sem_leitor = leitorState.semLeitor;
```

**Verificação:** `grep -n "activeSRVar" ui.html` → 2 resultados. Fim do arquivo intacto.

---

### B9 — Incluir `variacoes_leitor` no `run-handoff` + tratar `sr-variation-frame-created` + wiring dos botões

**Arquivo:** `ui.html`

**Parte 1** — No postMessage de `run-handoff`/`update-handoff`, localizar:
```javascript
        conectores_leitor: leitorState.conectores,
        sem_leitor: leitorState.semLeitor,
```
Substituir por (nas DUAS ocorrências — run-handoff e update-handoff):
```javascript
        conectores_leitor: leitorState.conectores,
        sem_leitor: leitorState.semLeitor,
        variacoes_leitor: srVariationsData,
```

**Parte 2** — Adicionar handler `sr-variation-frame-created` no bloco de mensagens recebidas do plugin. Localizar:
```javascript
      if (msg.type === 'tab-variation-frame-created') {
```
Inserir ANTES desse bloco:
```javascript
      if (msg.type === 'sr-variation-frame-created') {
        const targetVar = srVariationsData.find(v => v.id === currentSRVariationId)
          || srVariationsData[srVariationsData.length - 1];
        if (targetVar) {
          targetVar.frameNodeId = msg.frameNodeId;
          targetVar.instanceNodeId = msg.instanceNodeId;
        }
        if (currentSRVariationId && currentSRVariationId !== 'default') {
          const v = srVariationsData.find(v => v.id === currentSRVariationId);
          if (v?.instanceNodeId) {
            parent.postMessage({ pluginMessage: { type: 'activate-sr-variation', instanceNodeId: v.instanceNodeId } }, '*');
          }
        }
        renderSRVariationList();
        showSRView('main');
      }
```

**Parte 3** — Wiring dos botões. Localizar onde `btnAddTabVariation` é configurado (linha ~1640 aprox):
```javascript
    el('btnAddTabVariation').onclick = () => openTabVariationForm();
```
Inserir APÓS essa linha:
```javascript
    el('btnAddSRVariation').onclick = () => openSRVariationForm();
    el('btnBackToSRVariations').onclick = () => {
      parent.postMessage({ pluginMessage: { type: 'deactivate-sr-variation' } }, '*');
      showSRView('list');
      renderSRVariationList();
    };
    el('btnSRVariationFormCreate').onclick = () => saveSRVariationForm();
    el('btnSRVariationFormCancel').onclick = () => closeSRVariationForm();
```

**Verificação:**
- `grep -n "variacoes_leitor" ui.html` → pelo menos 3 resultados
- `grep -n "sr-variation-frame-created" ui.html` → 1 resultado
- `grep -n "btnAddSRVariation\|btnBackToSRVariations\|btnSRVariationFormCreate" ui.html` → 3 resultados em wiring
- Fim do arquivo intacto (`</html>` presente)

---

## Ordem de execução

```
A1 → A2 → A3 → A4 → A5 → A6 → A7
         ↓
     tsc --noEmit (deve passar limpo)
         ↓
B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9
         ↓
     verificar </html> no fim do arquivo
```

Cada task verifica: (1) o que foi inserido existe, (2) o que foi removido sumiu, (3) últimas 15 linhas intactas.
