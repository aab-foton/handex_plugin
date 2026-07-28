# 06 — Pipeline de Build e Segurança

## Pipeline de build

- **`bundle:ui`** = `bundle:css` + `bundle:refs` + `build.cjs`: concatena `modules/core.js`, `handoff.js`, `measurement.js`, `specifications.js`, `design-data.js`, `messages.js` como **texto puro** em um único `<script>` dentro de `ui.html` — sem ES modules, escopo global compartilhado em runtime.
- Sanity-check contra caracteres `U+2028`/`U+2029` no skeleton/code-mappings antes de embutir como string literal (`build.cjs:46-52,64-67`) — proteção real contra um bug conhecido do Figma (esses caracteres quebram o parsing de `ui.html`).
- **`bundle:code`** usa `esbuild.buildSync` sobre `code.js`, injetando a versão do `package.json` via `define`.

## Pipeline de atualização de refs DSC — status não totalmente verificável localmente

`refs:fetch` → `fetch-design-refs.cjs` (requer `FIGMA_TOKEN`) → `refs:rebuild`/`build-skeleton.cjs`. O README de `refs/` descreve um job de CI GitLab (`refresh-dsc-skeleton`, agendado semanal, cria Merge Request, nunca push direto em main) — **porém o arquivo `.gitlab-ci.yml` não foi encontrado no working tree local durante o levantamento**. Isso deve ser tratado como não-verificado: ou o arquivo existe fora do repo local sincronizado, ou a automação é aspiracional/documentada sem implementação commitada atualmente. Recomenda-se confirmar diretamente no GitLab antes de citar essa automação como capacidade ativa em qualquer justificativa de produto.

## Segurança

- `FIGMA_TOKEN`: design documentado é nunca embarcar em `ui.html`/`code.bundle.js`/artefato distribuído, vivendo só em `.env` local (gitignored) ou CI variable protected+masked. Verificável localmente apenas para o fetch via `.env`/dotenv — a garantia da pipeline CI não pôde ser confirmada (ver acima).
- Refs DSC (`_manifest.json`, `{slug}.json`, `_skeleton.json`) contêm apenas keys/nomes/contagens, **nunca valores resolvidos** (hex, fontSize) — resolução ocorre em runtime via Plugin API dentro do Figma. Arquitetura deliberada para manter o pipeline de build livre de segredos/dados de design no cliente.

## Leitura de produto

O pipeline de build e a arquitetura de segurança do skeleton DSC (nunca embarcar valores resolvidos) são pontos fortes reais e documentáveis com confiança. A automação de CI de atualização de refs precisa de confirmação direta antes de ser citada como capacidade ativa. Não há integração de IA generativa no produto hoje.
