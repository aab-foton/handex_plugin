# UI Patterns — DSC A11Y Handoff Plugin

Referência de padrões visuais e de interação estabelecidos. Seguir sempre ao implementar novos componentes.

---

## Botões

### Botão primário (ação principal)
```css
background: #2D4496; color: #fff; border: none;
border-radius: 8px; padding: 12px;
font-size: 13px; font-weight: 700; cursor: pointer;
```
Usado em: "Confirmar", "Criar", "Gerar Handoff"

### Botão cancelar (text link, dentro de form overlay)
```css
background: none; border: none; color: #2D4496;
font-size: 12px; font-weight: 700; cursor: pointer; padding: 4px 0;
```
Padrão: botão azul filled em cima ("Confirmar / Criar / Salvar") + link de texto azul embaixo ("Cancelar").
Usado em: "Cancelar" nos footers de form overlay (Área de Toque, Variação, Tabulação)

### Botão de adicionar item (dashed, full width)
```css
width: 100%; padding: 10px; background: none;
border: 1.5px dashed #BBBFC8; border-radius: 10px;
color: #2D4496; font-size: 12px; font-weight: 700; cursor: pointer;
```
Hover: `border-color: #2D4496; background: #F5F7FF`
Exemplos: "Adicionar área de toque", "Adicionar foco de tabulação"

### Cards de tipo/preset (dois lado a lado)
```css
flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
padding: 10px 12px; border: 1.5px solid #EBEBEB; border-radius: 10px;
background: #fff; cursor: pointer; text-align: left;
transition: border-color 0.15s, background 0.15s;
```
Estado active: `border-color: #2D4496 !important; background: #EEF2FF !important;`
Hover: `border-color: #2D4496; background: #EEF2FF`
- Label (cima): `font-size: 10px; font-weight: 600; color: #999;`
- Valor (baixo): `font-size: 13px; font-weight: 700; color: #2D4496;`

---

## Formulários / Overlays (views absolutas)

### Estrutura padrão de form overlay
```
position: absolute; top: 0; left: 0; right: 0; bottom: 0;
background: #fff; flex-direction: column; z-index: 10;
display: none; → .open { display: flex; }
```

### Header do form
```html
<div style="padding:12px 16px; border-bottom:1px solid #EEE;
     display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
  <span style="font-size:13px; font-weight:700;">Título do Form</span>
  <button onclick="closeForm()" style="background:none;border:none;font-size:18px;color:#999;cursor:pointer;">×</button>
</div>
```

### Footer do form (ações empilhadas verticalmente)

Padrão visual: botão filled azul em cima + link de texto azul embaixo (sem borda, sem background).

```html
<div class="touch-actions" style="padding:12px 16px; border-top:1px solid #EEE;">
  <button class="touch-btn-primary" id="btnConfirm">Salvar</button>
  <button onclick="closeForm()" style="background:none;border:none;font-size:12px;font-weight:700;color:#2D4496;cursor:pointer;padding:4px 0;">Cancelar</button>
</div>
```

`.touch-actions` tem `display:flex; flex-direction:column; gap:8px` — definido no CSS global.
`.touch-btn-primary` — botão filled azul — definido no CSS global.
Cancelar usa inline style (text link azul, sem borda).

### Box de instrução contextual (fundo azul claro)

Usado quando o plugin aguarda uma ação do usuário (posicionar frame, selecionar camadas, etc.).
Estrutura sempre com título bold azul + texto hint cinza, fundo `#EEF2FF`, centralizado.

```html
<div style="background:#EEF2FF; border-radius:8px; padding:12px; text-align:center;">
  <div style="font-size:12px; font-weight:700; color:#2D4496; margin-bottom:4px;">Título da ação</div>
  <p style="font-size:11px; color:#666; margin:0;">Descrição do que o usuário deve fazer.</p>
</div>
```

Exemplos em uso:
- Área de Toque: "Posicione o frame no Figma" / "Mova e redimensione o frame rosa, depois clique Concluir."
- Tabulação (seleção): "Selecione no canvas" / "Escolha as camadas e clique em Salvar."
- Tabulação (componente): "Componente ativo" / "O componente será adicionado como foco único."

### Seção com instrução simples
```html
<p style="font-size:12px; color:#666; margin:0 0 12px;">Instrução para o usuário</p>
```

---

## Checkbox "Sem X"

### Padrão (ex: "Sem tabulação", "Sem toque")
```html
<div style="padding:12px 16px; border-bottom:1px solid #EEE; background:#fff; flex-shrink:0;">
  <label class="checkbox-field">
    <input type="checkbox" id="chkSemX" onchange="onSemXChange()">
    <span>Sem X</span>
  </label>
</div>
```
Comportamento: quando marcado → oculta botão de adicionar + limpa lista + salva `sem_x: true`

---

## Listas de itens

### Card de item na lista principal
```html
<div class="selected-item-card">
  <div class="item-content">
    <span class="item-title">Nome do item</span>
    <span class="item-desc">descrição secundária</span>
  </div>
  <button class="remove-btn" onclick="removeItem(i)">×</button>
</div>
```

### Estado vazio (empty state)
```html
<div style="text-align:center; padding:32px 16px; color:#BBB; font-size:12px;
     border:2px dashed #EEE; border-radius:12px; margin:16px;">
  Mensagem explicando o que fazer.
</div>
```

---

## Panels com footer fixo

### Estrutura padrão de panel com footer
```css
/* Panel ativo */
#panel-X.tab-panel.active { display: flex; flex: 1; flex-direction: column; padding: 0; overflow: hidden; }
#panel-X { position: relative; overflow: hidden; }

/* Área de lista scrollável */
#xListWrapper { flex: 1; overflow-y: auto; padding: 16px; }

/* Footer fixo */
.x-footer { padding: 10px 16px 14px; border-top: 1px solid #F0F0F0; background: #fff; flex-shrink: 0; }
```

---

## Cores principais

| Uso | Valor |
|-----|-------|
| Azul primário | `#2D4496` |
| Azul claro (hover/active bg) | `#EEF2FF` |
| Borda padrão | `#E5E5E5` |
| Borda sutil | `#EBEBEB` |
| Borda tracejada add | `#BBBFC8` |
| Separador | `#EEE` / `#F0F0F0` |
| Texto primário | `#1a1a1a` |
| Texto secundário | `#666` |
| Texto placeholder | `#AAA` / `#BBB` |
| Fundo app | `#FAFAFA` |

---

## Painéis com variações — Padrão 3 Views

Painéis que suportam variantes parametrizadas do componente usam 3 views dentro do mesmo painel:

| View | ID (prefixo) | Visível quando |
|------|-------------|----------------|
| Lista de variações | `{x}VariationListView` | Painel abre / usuário clica Voltar |
| Main (conteúdo da variação ativa) | `{x}MainView` | Usuário seleciona uma variação |
| Form nova variação | `{x}VariationFormView` | Usuário clica "+ Nova variante" |

**CSS base:**
```css
#{x}VariationListView { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
#{x}VariationListView.hidden { display: none !important; }
#{x}MainView { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
#{x}MainView.hidden { display: none !important; }
#{x}VariationFormView { display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #fff; flex-direction: column; z-index: 20; }
#{x}VariationFormView.open { display: flex; }
```

**Regra de reset:** ao trocar de aba, chamar `show{X}View('list')` para resetar o painel para a lista.

**Implementado em:** Tabulação (`tab`), Leitor de Tela (`sr`).

