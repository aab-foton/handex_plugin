# Release notes — Figma Community

Texto pronto para colar no campo de descrição de cada publicação em Community → Manage → Publish new version. Mantido separado do `CHANGELOG.md` (que é técnico/interno) porque este é escrito para o usuário final do plugin, sem jargão de código.

---

## Version 9 — v6.1.1 (2026-07-29)

> Publicada sem este texto colado no campo de release notes da Figma — ver nota no `CHANGELOG.md` v6.1.1. Reaproveitar aqui na próxima publicação, ou adicionar retroativamente se a Figma permitir editar a descrição de uma versão já publicada.

**Correções e melhorias**

**Especificações sem frame associado agora permanecem salvas**
Especificações criadas sem vincular a um frame específico podiam desaparecer da lista ao navegar entre telas do plugin. Corrigido — elas agora persistem normalmente, junto com as especificações vinculadas a frames.

**Ficha de handoff exportada sem mais duplicações**
A ficha HTML exportada podia mostrar a mesma especificação duas vezes em seções diferentes. Agora cada especificação aparece uma única vez.

**Importação de backup (JSON) mais confiável**
Ao restaurar um backup, especificações e medidas que não estavam vinculadas a um frame específico eram ignoradas — o resumo da importação mostrava contagem zerada e nada era recriado no canvas. Agora esses dados são reconhecidos e recriados corretamente.
