# Changelog

## v2.0.1 — 2026-05-15

### Correções

- **Handoff dentro de Section não era detectado como atualização** — o check de `isUpdate` usava `figma.currentPage.children`, que não percorre Sections. Com isso, o botão aparecia como "Gerar Handoff" mesmo quando o handoff já existia, e ao clicar o plugin não encontrava o template e exibia erro. Corrigido para usar `buscarHandoffExistente()`, que busca recursivamente em toda a página incluindo Sections.

---

## v2.0.0 — 2026-05-14

- Versão inicial estável do DSC Handoff.
