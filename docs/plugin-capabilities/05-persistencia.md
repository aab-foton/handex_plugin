# 05 — Persistência

## Capacidades

`figma.clientStorage` (assíncrono, por arquivo Figma): chaves `handoffData`, `handex-scan-cache-v1`, `handex-history-{fileKey}` (máx 5 snapshots). `localStorage` (síncrono, por navegador): `theme`, categorias de anotação customizadas, flag de onboarding.

## Erro real observado e sua causa raiz confirmada

Console mostrou: `Initialization error (continuing without saved state): Failed to get client storage key "handoffData": Error: Cannot access client storage without a plugin ID` e `Storage save failed (possibly missing plugin ID in manifest)`.

**Confirmado no código**: `code.js:3264-3266` já trata essa falha explicitamente com `.catch(err => console.warn("Storage save failed (possibly missing plugin ID in manifest):", err))` — o próprio código já antecipa esse cenário exato. A causa é que `figma.clientStorage` exige um `id` publicado no manifesto do plugin; sem ele, toda leitura/escrita falha **silenciosamente** (o plugin continua funcional, só sem persistência entre sessões). Isso é consistente com rodar o plugin em modo de desenvolvimento local sem publicação — não necessariamente um bug, mas uma limitação real do ambiente de teste que precisa ser comunicada: **sem plugin ID publicado, não há persistência entre sessões**.

## Migração de schema

Ausência de `_schemaVersion: 2` no `handoffData` salvo → **descarte total e reinício limpo**, sem migração parcial (documentado em `BUSINESS_RULES.md` §1, "Regra de Migração de Schema"). Um projeto documentado no formato antigo (v1, wizard) não é recuperável automaticamente.

## Limitação de ambiente

`localStorage` é bloqueado em contexto `data:` URL (modo dev específico do Figma) — capturado via `SecurityError` no código, mas significa que preferências de tema/onboarding podem não persistir em determinados modos de execução do plugin.

## Leitura de produto

A persistência funciona bem no fluxo normal de uso (plugin publicado, `clientStorage` disponível), mas **depende de um pré-requisito de ambiente** (plugin ID) que nem sempre está presente durante desenvolvimento/teste local — isso deve ser considerado explicitamente ao demonstrar o produto em ambientes não publicados, para não ser confundido com um bug real de perda de dados.
