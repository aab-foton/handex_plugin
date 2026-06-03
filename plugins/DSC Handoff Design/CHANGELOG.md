# Changelog

## v2.1.0 — 2026-06-03

### Novidades

- **Seletor de Eixo Y da Matriz de Estados** — o plugin agora detecta automaticamente todas as propriedades VARIANT não-estado do componente e exibe chips interativos na UI para o usuário escolher quais usar como eixo Y da matriz. Por padrão as 2 primeiras são selecionadas. Propriedades de slot, swap e change são excluídas automaticamente.
- **Matriz de estados agora inclui todas as props VARIANT** — a lista de candidatos ao eixo Y deixou de ser uma whitelist de nomes fixos (`variant`, `type`, `color`, etc.) e passou a considerar qualquer prop VARIANT do componente que não seja estado, device ou breakpoint.

### Correções

- **Variante Danger (e outras) não era aplicada nas variações** — `setProperties` falhava silenciosamente para props VARIANT quando só uma propriedade era alterada de cada vez. Corrigido com busca direta via `variantProperties` no ComponentSet: o plugin agora localiza o ComponentNode exato que corresponde à combinação pedida (usando o variant padrão como base para as demais dimensões) e cria a instância a partir dele.
- **Cards da Matriz de Estados não redimensionavam verticalmente** — a altura do card ficava fixa no valor do template mesmo quando o componente era maior. Corrigido com `layoutSizingVertical = "HUG"`.
- **Componente horizontal cortado na Matriz de Estados** — a largura da célula era calculada apenas com o variant padrão (ex: Vertical). Corrigido para medir todas as combinações do eixo Y e usar a maior largura.
- **Erro `Cannot unwrap symbol` em `set_strokeWeight`** — `sincronizarPropriedadesLayout` atribuía `strokeWeight` sem checar se era `figma.mixed`. Corrigido com guarda de tipo.

### UI

- Janela redimensionada para 380×600px.
- Tabs maiores e mais legíveis (13px, padding 10px, borda 2px edge-to-edge).
- Header com ícone 30px e título 14px.
- Botão de ação com fonte 13px bold e padding 12px.
- Chips de seleção substituem checkboxes no seletor de Eixo Y (mais compactos).
- `truePrimeiro` agora é enviado corretamente também no fluxo de atualização.

---

## v2.0.3 — 2026-05-28

### Correções

- **Formatar Component Set detachava sub-instâncias dos variants** — ao mover o component set para um container ainda "órfão" (fora da página), o Figma convertia internamente as instâncias dentro dos variants em frames. Corrigido ancorando o docFrame na página antes de mover o component set para o setWrapper.
- **Checkboxes de seção ignoradas no update** — ao desmarcar todas (ou parte das) seções antes de "Atualizar Handoff", a lógica de filtro tratava um array vazio `[]` como "sem filtro" e atualizava tudo. Corrigido para tratar `[]` como "não atualizar nenhuma seção".

---

## v2.0.2 — 2026-05-26

### Correções

- **Formatar Component Set deletava conteúdo do frame pai** — ao executar "Formatar Component Set" com o componente dentro de um frame, section ou grupo, o plugin subia até o ancestral raiz e removia o nó inteiro, apagando todo o conteúdo do container. Corrigido para mover apenas o component set para fora e só remover o frame raiz se ele foi gerado por uma execução anterior desta mesma função (identificado via `pluginData`).

---

## v2.0.1 — 2026-05-15

### Correções

- **Handoff dentro de Section não era detectado como atualização** — o check de `isUpdate` usava `figma.currentPage.children`, que não percorre Sections. Com isso, o botão aparecia como "Gerar Handoff" mesmo quando o handoff já existia, e ao clicar o plugin não encontrava o template e exibia erro. Corrigido para usar `buscarHandoffExistente()`, que busca recursivamente em toda a página incluindo Sections.

---

## v2.0.0 — 2026-05-14

- Versão inicial estável do DSC Handoff.
