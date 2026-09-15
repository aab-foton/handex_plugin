# hac — regras de trabalho

## Versionamento a cada commit

Toda entrega commitada no hac (fix, feature, refactor — qualquer mudança em
`src/plugin/`) precisa bumpar a versão em `package.json` (e por consequência
`code.bundle.js`, gravada pelo bundler) **no mesmo commit**. Não commitar
código novo sem também rodar `npm run version:patch` (ou editar
`package.json` manualmente para minor/major quando fizer sentido) antes do
`bundle:code`.

**Por quê**: de `e16a67c` (commit inicial) até `412588d`, dezenas de commits
reais (fixes, features, refactors) passaram sem nenhum bump — a versão ficou
travada em `0.1.0-beta.1` o tempo todo. Sem o número mudando, não dá para
saber, olhando o plugin exportado, qual entrega ele reflete — nem distinguir
"testei isso" de "testei a versão de ontem".

**Como aplicar**:
1. Antes de commitar: `npm run version:patch` (ou editar `package.json` para
   minor/major).
2. `npm run bundle:code` (grava a versão nova no `code.bundle.js`).
3. `npm run export:plugin`.
4. Commitar tudo junto — código + `package.json` + bundles.

Pré-release (`-beta.N`) não usa `npm version patch` direto — esse comando
promove a pre-release pra release estável (`0.1.0-beta.1` → `0.1.0`), o que
normalmente não é a intenção. Para incrementar o sufixo beta, editar
`package.json` manualmente (`0.1.0-beta.1` → `0.1.0-beta.2`).
