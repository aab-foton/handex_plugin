# Handex — Capacidades e Limitações Técnicas

> Documento de referência para justificativa de produto. Mapeia o que o plugin **realmente faz hoje** (verificado no código, não descrição de marketing) e onde estão as fronteiras técnicas reais. Levantamento feito em 2026-07-08 a partir de leitura de `src/plugin/code.js`, `modules/specifications.js`, `modules/handoff.js`, `modules/measurement.js`, `refs/`, e cruzamento com `CLAUDE.md`/`BUSINESS_RULES.md`/`DATA_MODEL.md`.

## Índice

- [01 — Scan e Auditoria de Conformidade DSC](01-scan-auditoria-dsc.md)
- [02 — Criação de Specs](02-criacao-specs.md)
- [03 — Medidas e Fluxos de Tela](03-medidas-fluxos.md)
- [04 — Ficha de Handoff e Export](04-ficha-e-export.md)
- [05 — Persistência](05-persistencia.md)
- [06 — Pipeline de Build e Segurança](06-pipeline-seguranca.md)

## Como usar este documento

Cada arquivo segue o mesmo formato: **Capacidade** (o que funciona, com referência de código) → **Limite técnico explícito** (constantes/validações no próprio código) → **Limitação implícita** (o que não é tratado). Serve tanto para conversas de produto internas (Fóton/CAIXA) quanto para priorização de roadmap.

Este documento reflete o estado do código na data do levantamento (versão 4.2.2 no `package.json`). Nota: `CLAUDE.md` menciona "v4.1.6" em texto — desalinhamento de documentação interna identificado durante o levantamento, não uma limitação de produto.
