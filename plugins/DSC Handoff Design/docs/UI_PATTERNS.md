# UI Patterns — DSC Handoff Plugin

Referência de padrões visuais e de interação estabelecidos. Seguir sempre ao implementar novos componentes.

---

## Cores principais

| Uso | Valor |
|-----|-------|
| Azul primário | `#0D47A1` |
| Azul hover | `#0a3a85` |
| Borda padrão | `#e0e0e0` / `#e8e8e8` |
| Borda sutil | `#E8ECF0` |
| Separador | `#e8e8e8` |
| Texto primário | `#1a1a1a` |
| Texto secundário | `#555` / `#666` |
| Texto desativado | `#888` / `#aaa` |
| Fundo app | `#fff` |
| Fundo card intro | `#F5F7FA` |
| Status loading bg | `#E3F2FD` |
| Status success bg | `#E8F5E9` |
| Status error bg | `#FFEBEE` |

> **Atenção:** O azul primário aqui é `#0D47A1` — diferente do DSC A11Y Handoff que usa `#2D4496`.

---

## Botões

### Botão primário (ação principal)
```css
background: #0D47A1; color: white; border: none;
padding: 10px 16px; border-radius: 8px;
font-size: 12px; font-weight: 600; cursor: pointer;
transition: background 0.15s, opacity 0.15s;
width: 100%;
```
Hover: `background: #0a3a85`
Disabled: `opacity: 0.5; cursor: not-allowed`
Classe: `.btn-action`
Usado em: "Gerar Handoff", "Atualizar Handoff", "Entendi" (intro)

### Botão ícone circular (settings / info)
```css
width: 22px; height: 22px; border-radius: 50%;
border: 1.5px solid #bbb; background: none;
font-size: 12px; font-weight: 700; color: #888;
cursor: pointer; display: flex; align-items: center; justify-content: center;
transition: border-color 0.15s, color 0.15s;
```
Hover: `border-color: #0D47A1; color: #0D47A1`
Classes: `.btn-settings`, `.btn-info`

### Botão fechar overlay (×)
```css
width: 24px; height: 24px; border: none; background: none;
font-size: 18px; color: #888; cursor: pointer;
display: flex; align-items: center; justify-content: center;
border-radius: 4px;
```
Hover: `background: #f0f0f0; color: #333`
Classe: `.btn-close`

---

## Intro Screen

Tela inicial exibida na primeira vez (flag `introVisto` no clientStorage). Centralizada, sem header.

```css
.intro-screen {
  display: none; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center; gap: 20px; flex: 1; padding: 16px 0;
}
.intro-screen.active { display: flex; }
```

### Ícone
```css
width: 48px; height: 48px; background: #0D47A1; border-radius: 12px;
display: flex; align-items: center; justify-content: center;
color: white; font-size: 22px; font-weight: 700;
```

### Título / Subtítulo
```css
.intro-title  { font-size: 16px; font-weight: 700; color: #1a1a1a; }
.intro-subtitle { font-size: 12px; color: #888; margin-top: -12px; }
```

### Cards informativos
```css
.intro-card {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 12px; border-radius: 8px;
  background: #F5F7FA; border: 1px solid #E8ECF0;
}
```
- Ícone: `font-size: 16px; flex-shrink: 0; line-height: 1.3`
- Texto: `font-size: 12px; line-height: 1.5; color: #444`
- Bold: `color: #1a1a1a`

---

## Header

```html
<div class="header">
  <div class="header-icon">H</div>  <!-- 28×28px, bg #0D47A1, br 6px, branco 13px 700 -->
  <h2>DSC Handoff</h2>              <!-- 14px 700 #1a1a1a, flex:1 -->
  <button class="btn-settings" id="btnSettings">⚙ (SVG)</button>
  <button class="btn-info" id="btnInfo">i</button>
</div>
```

---

## Overlays (Settings / Info)

Painéis que cobrem toda a tela quando abertos.

```css
.settings-panel, .info-panel {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0;
  background: #fff; z-index: 11;
  display: none; flex-direction: column; overflow-y: auto; padding: 24px;
}
.settings-panel.open, .info-panel.open { display: flex; }
```

### Cabeçalho do overlay
```html
<div class="info-header">
  <h3>Título</h3>
  <button class="btn-close" id="btnClose">&times;</button>
</div>
```
`.info-header`: `display:flex; align-items:center; justify-content:space-between; margin-bottom:16px`
`h3`: `font-size:13px; font-weight:700; color:#1a1a1a`

### Grupos de configuração
```css
.settings-group { display: flex; flex-direction: column; gap: 10px; }
.settings-group-title { font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.settings-divider { height: 1px; background: #e8e8e8; margin: 6px 0; }
```

---

## Tabs

```css
.tabs { display: flex; border-bottom: 1px solid #e0e0e0; gap: 0; }
.tab {
  flex: 1; padding: 8px 0;
  font-size: 12px; font-weight: 600; font-family: 'Inter', sans-serif;
  border: none; background: none; cursor: pointer; color: #888;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.tab:hover:not(.active):not(:disabled) { color: #555; }
.tab.active { color: #0D47A1; border-bottom-color: #0D47A1; }
.tab:disabled { opacity: 0.5; cursor: not-allowed; }
```

### Tab panels
```css
.tab-panel { display: none; flex-direction: column; gap: 16px; }
.tab-panel.active { display: flex; }
```

---

## Tab Steps (lista numerada)

Lista de instruções passo a passo com numeração em círculo azul.

```css
.tab-steps {
  font-size: 12px; line-height: 1.5; color: #555; list-style: none;
  counter-reset: step; display: flex; flex-direction: column; gap: 6px;
}
.tab-steps li {
  counter-increment: step;
  display: grid; grid-template-columns: 16px 1fr; gap: 8px; align-items: start;
}
.tab-steps li::before {
  content: counter(step); background: #0D47A1; color: white;
  font-size: 9px; font-weight: 700; width: 16px; height: 16px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; margin-top: 1px;
}
.tab-steps strong { color: #333; }
```

---

## Alert Box

Alerta contextual (fundo amarelo claro).

```css
.alert {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 8px 10px; border-radius: 6px;
  background: #FFF8E1; border: 1px solid #FFE082;
  font-size: 11px; line-height: 1.5; color: #6D5600;
}
.alert-icon { flex-shrink: 0; font-size: 13px; line-height: 1; margin-top: 1px; }
```

---

## Status Bar

Feedback de progresso, sucesso ou erro após ação principal.

```css
.status-bar {
  display: none; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 8px;
  font-size: 12px; font-weight: 500;
}
.status-bar.loading { display: flex; background: #E3F2FD; color: #0D47A1; }
.status-bar.success { display: flex; background: #E8F5E9; color: #2E7D32; }
.status-bar.error   { display: flex; background: #FFEBEE; color: #C62828; }
```

Sucesso se auto-limpa após 4 segundos.

### Spinner (loading)
```css
.spinner {
  width: 16px; height: 16px;
  border: 2px solid #0D47A1; border-top-color: transparent;
  border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

---

## Form Controls

### Checkbox
```css
.checkbox-field {
  display: flex; flex-direction: row; gap: 8px;
  align-items: center; cursor: pointer;
  font-size: 12px; color: #333;
}
.checkbox-field input[type="checkbox"] {
  accent-color: #0D47A1; width: 14px; height: 14px; cursor: pointer;
}
```

### Select
```css
select {
  width: 100%; padding: 8px 12px; border: 1px solid #d0d0d0;
  border-radius: 8px; font-size: 12px; font-family: 'Inter', sans-serif;
  color: #333; background: #fff; cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,..."); /* chevron */
  background-repeat: no-repeat; background-position: right 12px center;
}
select:focus { outline: none; border-color: #0D47A1; }
select:disabled { opacity: 0.5; cursor: not-allowed; }
```

---

## Footer

```css
.footer { font-size: 10px; color: #aaa; text-align: center; margin-top: auto; padding-top: 12px; }
```

```html
<div class="footer" id="mainFooter">DSC Handoff v1.x.x</div>
```

---

## Divider

```css
.divider { height: 1px; background: #e8e8e8; }
```

---

## Waiting State

Estado exibido quando nenhuma seleção válida está presente. É a primeira coisa que o usuário vê ao abrir o plugin.

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

Trigger de entrada: mensagem `waiting-selection` de `code.ts` (seleção inválida ou vazia)
Trigger de saída: mensagem `selection-ready` de `code.ts` (contém `componentName` e `isUpdate`)

---

## Botão de ação único (tab Geral)

Label muda dinamicamente via JS com base na flag `isUpdate` recebida em `selection-ready`:
- `isUpdate = false` → "Gerar Handoff"
- `isUpdate = true` → "Atualizar Handoff"

`isUpdate` é determinado por `buscarHandoffExistente()` em `code.ts` — se existir um frame `[dsc] Handoff: X` na página para o componente selecionado.

---

## Estados dos botões de ação durante loading

Ao iniciar processamento (`setLoading`): desabilitar botões de ação + tabs + checkboxes.
Ao concluir (`setResult`): reabilitar tudo.

```js
function setLoading(message) {
  btnRun.disabled = true;
  btnUpdate.disabled = true;
  tabs.forEach(t => t.disabled = true);
  // checkboxes...
  statusBar.className = 'status-bar loading';
  statusBar.innerHTML = '<div class="spinner"></div>' + message;
}
```
