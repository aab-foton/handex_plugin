# Referências da DSC

Esta pasta contém os artefatos da DSC consumidos pela auditoria do plugin.

## Estrutura

| Arquivo | Origem | Versionado? | Conteúdo |
|---------|--------|-------------|----------|
| `_manifest.json` | curado | sim | Lista das libs DSC: `slug`, `name`, `fileKey`, contagens |
| `{slug}.json` | `fetch-design-refs.cjs` | sim | Por lib: meta + styles + components (só keys/nomes) |
| `_skeleton.json` | `build-skeleton.cjs` | sim | Bundle agregado embarcado em `ui.html` (901 KB) |
| `code-mappings.json` | curado | sim | DSC lib name → import path do monorepo |

> ⚠ Nada aqui contém **valores resolvidos** (hex, fontSize, etc.). Os valores são
> resolvidos em runtime via Plugin API dentro do Figma — esse é o desenho que
> mantém o pipeline livre de tokens no cliente.

## Comandos locais

```bash
# Atualizar refs do Figma (precisa FIGMA_TOKEN)
FIGMA_TOKEN=<seu_token> npm run refs:fetch

# Refazer o skeleton a partir das refs já baixadas
npm run bundle:refs

# Atalho: fetch + rebuild
FIGMA_TOKEN=<seu_token> npm run refs:rebuild

# Rebuild completo do ui.html (já inclui bundle:refs)
npm run bundle:ui

# Limitar a uma lib específica
FIGMA_TOKEN=<token> node src/plugin/refs/fetch-design-refs.cjs --only fundamentos-visuais
```

## Automatização via GitLab CI

O job `refresh-dsc-skeleton` em [`.gitlab-ci.yml`](../../../.gitlab-ci.yml) roda
em pipelines agendadas (recomendado: semanal) ou manuais e:

1. Busca refs do Figma com `FIGMA_TOKEN` (CI variable, **protected + masked**)
2. Regenera `_skeleton.json`
3. Se houve mudança, cria branch `bot/dsc-skeleton-YYYYMMDD-HHMM-pipNNN`
4. Abre **Merge Request** automaticamente para revisão humana
5. Nunca faz push direto em `main` — rollback é fechar o MR

### Setup inicial (uma vez)

1. **GitLab → Settings → Access Tokens → Project Access Token**
   - Nome: `handex-bot`
   - Role: `Developer` (ou `Maintainer` se precisar mergear)
   - Scopes: `api`, `write_repository`
   - Copiar o token gerado

2. **GitLab → Settings → CI/CD → Variables**
   - `FIGMA_TOKEN` (Masked + Protected): Personal Access Token Figma com leitura nas libs DSC
   - `HANDEX_BOT_TOKEN` (Masked + Protected): o Project Access Token criado acima

3. **GitLab → Build → Pipeline schedules → New schedule**
   - Cron: `0 6 * * 1` (segunda 6h UTC) ou conforme conveniente
   - Target branch: `main`
   - Variables: nenhuma (usa as do projeto)

## Onde está o token e onde **não** está

- ✓ `FIGMA_TOKEN` vive **apenas** em CI variable (criptografada, masked nos logs)
- ✗ Nunca embarcado em `ui.html`, `code.bundle.js`, nem qualquer artefato distribuído
- ✗ Nunca commitado no código (CI rejeita push de arquivos com formato de token)
- ✓ Rotação: trocar o token no Figma → atualizar a variável no GitLab. Sem rebuild necessário do plugin.
