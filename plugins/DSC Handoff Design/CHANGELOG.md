# Changelog

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
