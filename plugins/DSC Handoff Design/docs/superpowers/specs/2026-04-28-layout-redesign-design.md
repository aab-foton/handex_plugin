# Design Spec — Redesign de Layout (DSC Handoff)

**Data:** 2026-04-28  
**Status:** Aprovado

---

## Objetivo

Reestruturar a UI do plugin DSC Handoff para:
- Substituir a intro estática por um waiting state reativo (padrão do DSC A11Y Handoff)
- Unificar as duas tabs "Gerar" / "Atualizar" em uma única aba "Geral" com botão dinâmico
- Criar uma segunda aba "Extras" para funcionalidades adicionais
- Mover controles relevantes do settings para a tab Geral

---

## Estados da UI

O plugin opera em dois estados mutuamente exclusivos:

### Estado 1 — Aguardando seleção

Exibido quando a seleção no Figma é inválida (plugin abre, usuário deseleciona, troca de página, etc.).

- Tela inteira, sem header, sem tabs, sem footer
- Ícone de cursor (igual ao A11Y)
- Título: **"Aguardando seleção"**
- Subtítulo: "Selecione o Componente e o Template Handoff."
- Substitui completamente a intro screen atual (`.intro-screen` + lógica de `introVisto`)

**Trigger de entrada:** mensagem `waiting-selection` vinda do `code.ts`  
**Trigger de saída:** mensagem `component-ready` (ou equivalente) vinda do `code.ts`

### Estado 2 — App ativo

Exibido quando seleção válida (componente + template detectados).

Estrutura:
```
[ Header ]
[ Tabs: Geral | Extras ]
[ Tab Panel ativo ]
[ Footer com versão ]
```

---

## Header (Estado 2)

Sem alterações estruturais em relação ao atual:
- Ícone `H` (28×28px, `#0D47A1`, `border-radius: 6px`)
- Título "DSC Handoff"
- Botão ⚙ (settings) — abre settings panel
- Botão `i` (info) — abre info panel

---

## Tab Geral

Conteúdo de cima para baixo:

### 1. Card do componente
Nome do componente detectado, exibido como identificação contextual. Já existe hoje na lógica — apenas renderizar na tab.

### 2. Formatar Component Set
Checkbox movido do settings para cá.
- Label: "Formatar Component Set na página"
- ID: `settingIncluirComponente`
- Posição: logo abaixo do card do componente

### 3. Seções a atualizar
Grupo de checkboxes movidos do settings para cá. Exibidos sempre (não apenas no modo Atualizar).

Label do grupo: **"Seções a atualizar"**

| Checkbox | ID | Default |
|----------|----|---------|
| Anatomia | `settingSecaoAnatomia` | `checked` |
| Tabela de propriedades | `settingSecaoTabela` | `checked` |
| Variações | `settingSecaoVariacoes` | `checked` |
| Matriz de estados | `settingSecaoEstados` | `checked` |

### 4. Botão de ação único
Label muda dinamicamente conforme o estado do template:

| Condição | Label |
|----------|-------|
| Template é `ComponentNode` ou instância (não teve detach) | **Gerar Handoff** |
| Template é `FrameNode` com ID de handoff salvo (já teve detach) | **Atualizar Handoff** |

- Classe: `.btn-action`
- Sempre visível; fica `disabled` se a seleção ficar inválida enquanto o app está ativo
- Ao clicar: lê os checkboxes de seções e envia para `code.ts` (unifica lógica de `run-handoff` e `update-handoff`)

### 5. Status bar
Abaixo do botão. Estados: `loading` / `success` / `error`. Comportamento idêntico ao atual.

---

## Tab Extras

Conteúdo inicial mínimo:

### Ocultar nome da section
- Label: "Ocultar nome da section"
- Badge: "Em breve"
- Sem interatividade — apenas visual indicando que a funcionalidade está planejada
- Implementação a definir após análise de plugins de referência

---

## Settings Panel (o que permanece)

Os itens que **não** sobem para a tab Geral continuam no settings:

**Grupo Geral:**
- Preencher descrição do componente (se vazia) — `settingPreencherDescricao`
- True sempre na frente nas variações booleanas — `settingTruePrimeiro`

**Grupo Atualização:**
- Atualizar template do documento de Handoff — `settingSyncTemplate`
- Manter alterações manuais — `settingManterEdicoes`

---

## O que é removido

| Elemento | Destino |
|----------|---------|
| `.intro-screen` (HTML + CSS + lógica `introVisto`) | Removido — substituído pelo waiting state |
| Tab "Gerar" | Removido — unificada na tab Geral |
| Tab "Atualizar" | Removido — unificada na tab Geral |
| `settingIncluirComponente` no settings | Movido para tab Geral |
| Checkboxes de seções no settings | Movidos para tab Geral |

---

## Impacto em `code.ts`

- A lógica de detecção de template (ComponentNode vs FrameNode com ID) já existe — só precisa ser exposta via mensagem para a UI definir o label do botão
- O handler do botão único precisa unificar o que hoje são dois handlers separados (`action-run` / `action-update`), roteando para `run-handoff` ou `update-handoff` conforme o estado do template
- Mensagem `waiting-selection` já existe e dispara o estado 1

---

## Arquivos afetados

- `ui.html` — toda a estrutura de estados, tabs e reorganização de controles
- `code.ts` — possível ajuste de mensagem para indicar tipo do template (Gerar vs Atualizar)
