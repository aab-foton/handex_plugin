# Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestruturar a UI do DSC Handoff — substituir a intro estática por um waiting state reativo, unificar as tabs Gerar/Atualizar em Geral/Extras, e mover controles relevantes do settings para a tab Geral.

**Architecture:** `code.ts` passa a ouvir `selectionchange` e emite `selection-ready` (com nome do componente e flag `isUpdate`) ou `waiting-selection`. A `ui.html` reage a essas mensagens para alternar entre os dois estados da UI (aguardando vs. app ativo) e para definir o label do botão único de ação.

**Tech Stack:** TypeScript (Figma Plugin API), HTML/CSS/JS inline no `ui.html`, `tsc` para compilar. Sem framework de testes — verificação manual no Figma.

---

## Arquivos afetados

| Arquivo | O que muda |
|---------|-----------|
| `code.ts` | Adiciona listener `selectionchange`, remove lógica `intro-visto`, remove handler `intro-visto` |
| `ui.html` | Remove intro screen, adiciona waiting state, troca tabs, reorganiza controles, unifica botão |

---

### Task 1: code.ts — Adicionar listener de seleção

**Arquivos:**
- Modificar: `code.ts` (bloco de inicialização, ~linha 109–115; final do arquivo após handlers)

**Contexto:** Hoje o plugin só verifica `intro-visto` na inicialização. Precisamos que ele avalie a seleção do Figma a cada mudança e informe a UI se está pronto (`selection-ready`) ou aguardando (`waiting-selection`).

A função `resolverComponentSet` já existe no arquivo e resolve qualquer nó de seleção para um `ComponentSetNode`. A função `buscarHandoffExistente` já existe e busca o frame `[dsc] Handoff: X` na página.

- [ ] **Passo 1: Adicionar função `avaliarSelecao` em `code.ts`**

Adicionar logo após o bloco de inicialização (após linha 115), antes de `// === UTILITÁRIOS GERAIS ===`:

```typescript
async function avaliarSelecao(): Promise<void> {
  const selecao = figma.currentPage.selection;
  if (selecao.length === 0) {
    figma.ui.postMessage({ type: 'waiting-selection' });
    return;
  }
  // Ignorar o template na seleção, focar no componente
  const noComponente = selecao.find(n =>
    !(n.type === "INSTANCE" && n.name.toLowerCase().includes("[dsc-h] template handoff"))
  );
  if (!noComponente) {
    figma.ui.postMessage({ type: 'waiting-selection' });
    return;
  }
  const componentSet = await resolverComponentSet(noComponente);
  if (!componentSet) {
    figma.ui.postMessage({ type: 'waiting-selection' });
    return;
  }
  const nomeBase = componentSet.name.replace(/^\[.*?\]/, "").trim();
  const nomeFormatado = capitalizar(nomeBase);
  const handoffExistente = buscarHandoffExistente(componentSet);
  figma.ui.postMessage({
    type: 'selection-ready',
    componentName: nomeFormatado,
    isUpdate: !!handoffExistente,
  });
}
```

- [ ] **Passo 2: Substituir bloco de inicialização**

Substituir o bloco atual (linhas 111–115):
```typescript
// Verificar se é a primeira vez que o usuário abre o plugin
(async () => {
  const jaViuIntro = await figma.clientStorage.getAsync('dsc-handoff-intro-visto');
  figma.ui.postMessage({ type: 'intro-status', visto: !!jaViuIntro });
})();
```

Por:
```typescript
// Avaliar seleção inicial e registrar listener de mudança
avaliarSelecao();
figma.on('selectionchange', () => { avaliarSelecao(); });
```

- [ ] **Passo 3: Remover handler `intro-visto` de `figma.ui.onmessage`**

Remover o bloco (linhas 3902–3906):
```typescript
if (msg.type === 'intro-visto') {
  await figma.clientStorage.setAsync('dsc-handoff-intro-visto', true);
  return;
}
```

- [ ] **Passo 4: Compilar e verificar ausência de erros**

```bash
npm run build
```
Esperado: sem erros de TypeScript.

- [ ] **Passo 5: Commit**

```bash
git add code.ts code.js
git commit -m "feat: adiciona listener de seleção e remove lógica de intro-visto"
```

---

### Task 2: ui.html — Substituir intro screen pelo waiting state

**Arquivos:**
- Modificar: `ui.html` (CSS da intro ~linhas 452–517; HTML da intro ~linhas 521–536; JS da intro ~linhas 673–695)

**Contexto:** A intro atual exibe texto estático e tem um botão "Entendi". O novo waiting state é um empty state reativo que aparece enquanto nenhuma seleção válida está presente — idêntico ao padrão do DSC A11Y Handoff.

- [ ] **Passo 1: Substituir CSS da intro**

Remover as classes `.intro-screen`, `.intro-screen.active`, `.intro-icon`, `.intro-title`, `.intro-subtitle`, `.intro-text`, `.intro-card`, `.intro-card-icon` (linhas 452–517).

Adicionar no lugar:
```css
/* Waiting state */
.waiting-state {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  flex: 1;
  padding: 40px 24px;
}
.waiting-state.active { display: flex; }
.waiting-cursor {
  width: 40px; height: 48px;
  background: #e8e8e8; border-radius: 20px 20px 16px 4px;
  margin-bottom: 8px;
}
.waiting-title {
  font-size: 14px; font-weight: 700; color: #aaa;
}
.waiting-subtitle {
  font-size: 12px; color: #bbb; margin-top: -4px;
}
```

- [ ] **Passo 2: Substituir HTML da intro**

Remover o bloco `<div class="intro-screen" id="introScreen">...</div>` (linhas 521–536).

Adicionar no lugar, como primeiro filho de `<body>`:
```html
<div class="waiting-state active" id="waitingState">
  <div class="waiting-cursor"></div>
  <div class="waiting-title">Aguardando seleção</div>
  <div class="waiting-subtitle">Selecione o Componente e o Template Handoff.</div>
</div>
```

- [ ] **Passo 3: Remover JS da intro (linhas 673–695)**

Remover:
```javascript
const introScreen = document.getElementById('introScreen');
const mainContainer = document.getElementById('mainContainer');
const mainFooter = document.getElementById('mainFooter');
const btnIntroOk = document.getElementById('btnIntroOk');

function mostrarApp() {
  introScreen.classList.remove('active');
  introScreen.style.display = 'none';
  mainContainer.style.display = '';
  mainFooter.style.display = '';
}

function mostrarIntro() {
  introScreen.classList.add('active');
  mainContainer.style.display = 'none';
  mainFooter.style.display = 'none';
}

btnIntroOk.onclick = () => {
  parent.postMessage({ pluginMessage: { type: 'intro-visto' } }, '*');
  mostrarApp();
};
```

Adicionar no lugar as funções de controle de estado:
```javascript
const waitingState = document.getElementById('waitingState');
const mainContainer = document.getElementById('mainContainer');
const mainFooter = document.getElementById('mainFooter');

function mostrarWaiting() {
  waitingState.classList.add('active');
  mainContainer.style.display = 'none';
  mainFooter.style.display = 'none';
}

function mostrarApp() {
  waitingState.classList.remove('active');
  mainContainer.style.display = '';
  mainFooter.style.display = '';
}
```

- [ ] **Passo 4: Atualizar handler de mensagens**

No `window.onmessage`, substituir o bloco `intro-status`:
```javascript
if (msg.type === 'intro-status') {
  if (msg.visto) { mostrarApp(); } else { mostrarIntro(); }
  return;
}
```

Por:
```javascript
if (msg.type === 'waiting-selection') {
  mostrarWaiting();
  return;
}
if (msg.type === 'selection-ready') {
  mostrarApp();
  return;
}
```

- [ ] **Passo 5: Verificar no Figma**

Abrir o plugin sem selecionar nada → deve aparecer o waiting state.
Selecionar um ComponentSet → deve aparecer o app principal (com as abas ainda antigas por ora).
Desselecionar → deve voltar ao waiting state.

- [ ] **Passo 6: Commit**

```bash
git add ui.html
git commit -m "feat: substitui intro screen pelo waiting state reativo"
```

---

### Task 3: ui.html — Substituir tabs Gerar/Atualizar por Geral/Extras

**Arquivos:**
- Modificar: `ui.html` (HTML das tabs ~linhas 638–666; CSS das tabs já existe, só adaptar)

**Contexto:** O sistema de tabs atual tem "Gerar" e "Atualizar", cada um com seu painel independente. O novo sistema tem "Geral" (ação principal) e "Extras" (funcionalidades extras). O CSS de `.tabs`, `.tab`, `.tab-panel` não precisa mudar — só o HTML.

- [ ] **Passo 1: Substituir HTML das tabs e panels**

Remover o bloco das tabs e seus dois panels (linhas 638–666):
```html
<div class="tabs">
  <button class="tab active" data-action="run">Gerar</button>
  <button class="tab" data-action="update">Atualizar</button>
</div>
<div id="panel-run" class="tab-panel active">...</div>
<div id="panel-update" class="tab-panel">...</div>
```

Substituir por:
```html
<div class="tabs">
  <button class="tab active" data-tab="geral">Geral</button>
  <button class="tab" data-tab="extras">Extras</button>
</div>

<div id="panel-geral" class="tab-panel active">
  <!-- Conteúdo da tab Geral — preenchido na Task 4 -->
</div>

<div id="panel-extras" class="tab-panel">
  <!-- Conteúdo da tab Extras — preenchido na Task 6 -->
</div>
```

- [ ] **Passo 2: Substituir JS de navegação de tabs**

Remover o bloco de navegação de tabs atual (referencia `data-action`, `panel-run`, `panel-update`, `currentAction`):
```javascript
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
// ...
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // ...
    currentAction = tab.dataset.action;
    // ...
  });
});
```

Adicionar no lugar:
```javascript
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
});
```

- [ ] **Passo 3: Verificar no Figma**

Selecionar um componente → app abre, duas tabs visíveis (Geral | Extras), Geral ativa por padrão.
Clicar em Extras → troca para o panel-extras (vazio por ora).

- [ ] **Passo 4: Commit**

```bash
git add ui.html
git commit -m "feat: substitui tabs Gerar/Atualizar por Geral/Extras"
```

---

### Task 4: ui.html — Conteúdo da Tab Geral

**Arquivos:**
- Modificar: `ui.html` (panel-geral vazio da Task 3; CSS a adicionar)

**Contexto:** A tab Geral recebe: (1) card com nome do componente, (2) checkbox Formatar Component Set, (3) grupo Seções a atualizar, (4) botão único de ação, (5) status bar. Os checkboxes de seções e o de Component Set existem hoje no settings panel — serão reposicionados aqui. Os IDs (`settingIncluirComponente`, `settingSecaoAnatomia`, etc.) são mantidos para não quebrar os handlers existentes de `run-handoff` / `update-handoff`.

- [ ] **Passo 1: Adicionar CSS necessário para os novos grupos**

No bloco `<style>`, adicionar após os estilos existentes:
```css
.section-label {
  font-size: 11px; font-weight: 700; color: #888;
  text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 6px;
}
.component-card {
  background: #F0F4FF; border: 1px solid #C7D2F0;
  border-radius: 8px; padding: 10px 12px;
  font-size: 13px; font-weight: 700; color: #0D47A1;
  display: flex; align-items: center; gap: 8px;
}
.component-card-icon {
  font-size: 16px; flex-shrink: 0;
}
.geral-group {
  display: flex; flex-direction: column; gap: 10px;
}
```

- [ ] **Passo 2: Preencher o panel-geral**

Substituir `<!-- Conteúdo da tab Geral — preenchido na Task 4 -->` por:

```html
<!-- Card do componente -->
<div class="component-card" id="componentCard">
  <span class="component-card-icon">⬡</span>
  <span id="componentNameLabel">Componente</span>
</div>

<!-- Formatar Component Set -->
<div class="geral-group">
  <label class="checkbox-field">
    <input type="checkbox" id="settingIncluirComponente">
    <span>Formatar Component Set na página</span>
  </label>
</div>

<div class="divider"></div>

<!-- Seções a atualizar -->
<div class="geral-group">
  <div class="section-label">Seções a atualizar</div>
  <label class="checkbox-field">
    <input type="checkbox" id="settingSecaoAnatomia" checked>
    <span>Anatomia</span>
  </label>
  <label class="checkbox-field">
    <input type="checkbox" id="settingSecaoTabela" checked>
    <span>Tabela de propriedades</span>
  </label>
  <label class="checkbox-field">
    <input type="checkbox" id="settingSecaoVariacoes" checked>
    <span>Variações</span>
  </label>
  <label class="checkbox-field">
    <input type="checkbox" id="settingSecaoEstados" checked>
    <span>Matriz de estados</span>
  </label>
</div>

<div class="divider"></div>

<!-- Botão de ação único -->
<button id="action-btn" class="btn-action">Gerar Handoff</button>

<!-- Status bar -->
<div id="status" class="status-bar"></div>
```

- [ ] **Passo 3: Atualizar handler `selection-ready` para exibir nome do componente**

No `window.onmessage`, dentro do bloco `selection-ready`, adicionar:
```javascript
if (msg.type === 'selection-ready') {
  mostrarApp();
  document.getElementById('componentNameLabel').textContent = msg.componentName || 'Componente';
  document.getElementById('action-btn').textContent = msg.isUpdate ? 'Atualizar Handoff' : 'Gerar Handoff';
  return;
}
```

- [ ] **Passo 4: Verificar no Figma**

Selecionar um ComponentSet → card mostra o nome do componente, checkboxes visíveis, botão "Gerar Handoff".
Selecionar ComponentSet com handoff já existente na página → botão muda para "Atualizar Handoff".

- [ ] **Passo 5: Commit**

```bash
git add ui.html
git commit -m "feat: preenche tab Geral com card de componente, seções e botão dinâmico"
```

---

### Task 5: ui.html — Unificar handler do botão de ação

**Arquivos:**
- Modificar: `ui.html` (handlers de `btnRun` / `btnUpdate` e funções `setLoading` / `setResult`)

**Contexto:** Hoje existem dois botões (`action-run`, `action-update`) e dois handlers separados. A Task 4 criou um único botão `action-btn`. Agora precisamos um único handler que lê se é Gerar ou Atualizar e envia a mensagem correta para `code.ts`. As funções `setLoading` / `setResult` referenciam `btnRun` e `btnUpdate` — precisam referenciar `action-btn`.

- [ ] **Passo 1: Remover variáveis e handlers antigos de btnRun / btnUpdate**

Remover:
```javascript
const btnRun = document.getElementById('action-run');
const btnUpdate = document.getElementById('action-update');
// ... (toda a lógica de currentAction, btnRun.onclick, btnUpdate.onclick)
```

- [ ] **Passo 2: Adicionar variável de estado e handler único**

```javascript
const actionBtn = document.getElementById('action-btn');
let _isUpdate = false;

actionBtn.onclick = () => {
  const incluirComponente = document.getElementById('settingIncluirComponente').checked;
  const secaoCheckboxes = [
    [document.getElementById('settingSecaoTabela'), 'table'],
    [document.getElementById('settingSecaoAnatomia'), 'anatomy'],
    [document.getElementById('settingSecaoVariacoes'), 'variants'],
    [document.getElementById('settingSecaoEstados'), 'states'],
  ];
  const secoesAtualizar = secaoCheckboxes.filter(([cb]) => cb.checked).map(([, nome]) => nome);

  if (_isUpdate) {
    setLoading('Atualizando handoff...');
    parent.postMessage({ pluginMessage: {
      type: 'update-handoff',
      mode: 'design',
      syncTemplate: document.getElementById('settingSyncTemplate').checked,
      manterEdicoes: document.getElementById('settingManterEdicoes').checked,
      incluirComponente,
      secoesAtualizar,
    }}, '*');
  } else {
    setLoading('Gerando handoff...');
    parent.postMessage({ pluginMessage: {
      type: 'run-handoff',
      mode: 'design',
      syncTemplate: true,
      incluirComponente,
      preencherDescricao: document.getElementById('settingPreencherDescricao').checked,
      truePrimeiro: document.getElementById('settingTruePrimeiro').checked,
    }}, '*');
  }
};
```

- [ ] **Passo 3: Atualizar `selection-ready` para salvar `_isUpdate`**

No handler `selection-ready`:
```javascript
_isUpdate = msg.isUpdate || false;
```

- [ ] **Passo 4: Atualizar `setLoading` e `setResult` para referenciar `actionBtn`**

```javascript
function setLoading(message) {
  actionBtn.disabled = true;
  statusBar.className = 'status-bar loading';
  statusBar.innerHTML = '<div class="spinner"></div>' + message;
}

function setResult(type, message) {
  actionBtn.disabled = false;
  statusBar.className = 'status-bar ' + type;
  statusBar.textContent = message;
  if (type === 'success') {
    setTimeout(() => {
      statusBar.className = 'status-bar';
      statusBar.textContent = '';
    }, 4000);
  }
}
```

Remover também a referência a `statusBar` que pode estar apontando para `#status` com o ID antigo — confirmar que `const statusBar = document.getElementById('status')` aponta para o elemento correto da Task 4.

- [ ] **Passo 5: Verificar no Figma — fluxo Gerar**

Selecionar ComponentSet + template (instância) → botão "Gerar Handoff" → clicar → handoff gerado com sucesso.

- [ ] **Passo 6: Verificar no Figma — fluxo Atualizar**

Com handoff existente na página, selecionar ComponentSet → botão "Atualizar Handoff" → clicar → handoff atualizado.

- [ ] **Passo 7: Commit**

```bash
git add ui.html
git commit -m "feat: unifica handlers de gerar/atualizar em botão único dinâmico"
```

---

### Task 6: ui.html — Tab Extras com placeholder

**Arquivos:**
- Modificar: `ui.html` (panel-extras vazio da Task 3)

- [ ] **Passo 1: Adicionar CSS do badge "Em breve"**

```css
.extras-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px; border: 1px solid #e8e8e8; border-radius: 8px;
  background: #fff;
}
.extras-item-label {
  font-size: 13px; color: #555;
}
.badge-soon {
  font-size: 10px; font-weight: 700; padding: 2px 8px;
  border-radius: 10px; background: #F5F5F5; color: #aaa;
  border: 1px solid #e0e0e0;
}
```

- [ ] **Passo 2: Preencher panel-extras**

Substituir `<!-- Conteúdo da tab Extras — preenchido na Task 6 -->` por:

```html
<div class="extras-item">
  <span class="extras-item-label">Ocultar nome da section</span>
  <span class="badge-soon">Em breve</span>
</div>
```

- [ ] **Passo 3: Verificar no Figma**

Clicar na tab Extras → exibe o item "Ocultar nome da section" com badge "Em breve". Nenhuma interação acontece ao clicar no item.

- [ ] **Passo 4: Commit**

```bash
git add ui.html
git commit -m "feat: adiciona tab Extras com placeholder de ocultar nome da section"
```

---

### Task 7: ui.html — Limpar settings panel

**Arquivos:**
- Modificar: `ui.html` (settings panel ~linhas 551–610)

**Contexto:** Os checkboxes `settingIncluirComponente`, `settingSecaoAnatomia`, `settingSecaoTabela`, `settingSecaoVariacoes`, `settingSecaoEstados` foram movidos para a tab Geral. Os elementos HTML no settings panel precisam ser removidos para não criar duplicação de IDs. O grupo "Seções a atualizar" e o item "Formatar Component Set" saem do settings. Permanecem: "Preencher descrição", "True primeiro", "Atualizar template", "Manter alterações manuais".

- [ ] **Passo 1: Remover do settings: grupo "Geral" parcialmente e grupo "Seções a atualizar" completo**

No settings panel, remover:
- `<label>` com `settingIncluirComponente` (dentro do grupo "Geral")
- Todo o grupo "Seções a atualizar" (label + 4 checkboxes)
- O `<div class="settings-divider">` que separava "Atualização" de "Seções a atualizar"

Resultado do settings panel após limpeza:
```html
<div style="display:flex; flex-direction:column; gap:16px;">
  <div class="settings-group">
    <div class="settings-group-title">Geral</div>
    <label class="checkbox-field">
      <input type="checkbox" id="settingPreencherDescricao" checked>
      <span>Preencher descrição do componente (se vazia)</span>
    </label>
    <label class="checkbox-field">
      <input type="checkbox" id="settingTruePrimeiro">
      <span>True sempre na frente nas variações booleanas</span>
    </label>
  </div>
  <div class="settings-divider"></div>
  <div class="settings-group">
    <div class="settings-group-title">Atualização</div>
    <label class="checkbox-field">
      <input type="checkbox" id="settingSyncTemplate" checked>
      <span>Atualizar template do documento de Handoff</span>
    </label>
    <label class="checkbox-field">
      <input type="checkbox" id="settingManterEdicoes" checked>
      <span>Manter alterações manuais</span>
    </label>
  </div>
</div>
```

- [ ] **Passo 2: Verificar que os IDs dos checkboxes que foram movidos não aparecem mais no settings**

Inspecionar o HTML resultante — `settingIncluirComponente`, `settingSecaoAnatomia`, `settingSecaoTabela`, `settingSecaoVariacoes`, `settingSecaoEstados` devem aparecer **apenas** no panel-geral.

- [ ] **Passo 3: Verificar no Figma**

Abrir settings (⚙) → deve mostrar apenas os 4 itens restantes, sem erros de JavaScript.

- [ ] **Passo 4: Commit**

```bash
git add ui.html
git commit -m "refactor: remove itens migrados para tab Geral do settings panel"
```

---

### Task 8: Atualizar UI_PATTERNS.md e build final

**Arquivos:**
- Modificar: `docs/UI_PATTERNS.md`
- Build final: `code.js`

- [ ] **Passo 1: Adicionar padrão "Waiting State" ao UI_PATTERNS.md**

```markdown
## Waiting State

Estado exibido quando nenhuma seleção válida está presente. Substitui a intro screen.

```css
.waiting-state {
  display: none; flex-direction: column; align-items: center;
  justify-content: center; text-align: center;
  gap: 12px; flex: 1; padding: 40px 24px;
}
.waiting-state.active { display: flex; }
.waiting-cursor { width: 40px; height: 48px; background: #e8e8e8; border-radius: 20px 20px 16px 4px; }
.waiting-title  { font-size: 14px; font-weight: 700; color: #aaa; }
.waiting-subtitle { font-size: 12px; color: #bbb; margin-top: -4px; }
```

Trigger de entrada: mensagem `waiting-selection` de `code.ts`
Trigger de saída: mensagem `selection-ready` de `code.ts` (contém `componentName` e `isUpdate`)
```

- [ ] **Passo 2: Build final**

```bash
npm run build
```
Esperado: `code.js` gerado sem erros.

- [ ] **Passo 3: Teste de regressão completo no Figma**

1. Abrir plugin sem seleção → waiting state aparece
2. Selecionar ComponentSet → app abre, nome correto no card, botão "Gerar Handoff"
3. Selecionar ComponentSet com handoff existente → botão "Atualizar Handoff"
4. Gerar handoff → sucesso, status bar verde
5. Atualizar handoff → sucesso
6. Abrir settings → apenas Geral (Preencher desc, True primeiro) + Atualização (Sync, Manter edições)
7. Tab Extras → item "Ocultar nome da section" com badge "Em breve"
8. Desselecionar → waiting state volta

- [ ] **Passo 4: Commit final**

```bash
git add docs/UI_PATTERNS.md code.js
git commit -m "docs: atualiza UI_PATTERNS com waiting state; build final v1.11.0"
```
