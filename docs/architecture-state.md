# Estado da Arquitetura — Handex

Documento vivo. Atualizar a cada minor version (bump `5.x.0`) ou quando um agente de
feature fizer mudança que toque mais de um módulo. Última atualização: **2026-07-21**
(branch `main`, v5.0.0; beta segue em v5.1.0-beta.1).

---

## 1. Tamanho atual dos arquivos (linhas)

| Arquivo | Linhas | Funções top-level | Tendência |
|---|---|---|---|
| `src/plugin/code.js` (backend) | 4482 | ~40 handlers `msg.type ===` | crescendo ~250 linhas/leva de features |
| `src/plugin/modules/core.js` | 2284 | 114 | estável, é o hub |
| `src/plugin/modules/handoff.js` | 2511 | 42 | **maior módulo de frontend**, cresceu de ~2200 → 2511 nesta leva (+256 linhas só em beta) |
| `src/plugin/modules/specifications.js` | 2422 | 73 | segundo maior, mais funções que qualquer outro módulo além de core |
| `src/plugin/modules/measurement.js` | 444 | 12 | pequeno, coeso |
| `src/plugin/modules/messages.js` | 456 | 1 (dispatcher) + ~21 blocos `if (msg.type ===...)` | dispatcher único, cresce lentamente |
| `src/plugin/modules/design-data.js` | 241 | 7 | menor módulo, mais recente, sem BOM |

Total frontend (`modules/*.js`): **8358 linhas**. Total geral (+ backend): **12840 linhas**.

`handoff.js` continua sendo o maior módulo de frontend, como já registrado antes — e é
o que mais cresceu nesta leva de commits (controles de grupo de specs, chip de status,
resgate de versão da ficha, header secundário redesenhado nas 7 views passaram em parte
por lá).

---

## 2. Responsabilidades por módulo

- **`code.js`** — sandbox Figma (sem DOM). Todo acesso à API do Figma (`figma.currentPage`,
  criação/edição de nós, scan de tokens DSC, geração de specs/medidas/legendas no canvas,
  export). Único ponto que fala com `figma.ui.postMessage` / recebe `figma.ui.onmessage`.
- **`core.js`** — estado global (`handoffData`), navegação entre views, persistência
  (`saveToStorage`/`localStorage`), toasts, accordions genéricos, formulário de equipe/
  briefing/regras (Etapa 1 e 2), utilitários de UI compartilhados. **Hub central** — quase
  todo outro módulo de frontend depende dele, ele depende pouco dos outros (ver seção 4).
- **`handoff.js`** — geração da Ficha Técnica: `collectHandoffData`, `exportHandoff`,
  `getInteractiveHTMLContent` (HTML standalone da ficha com Tailwind/Lucide embutido),
  diff entre snapshots, comentários/dúvidas por projeto. Combina duas responsabilidades
  hoje: (a) coleta/serialização de dados e (b) geração de HTML de apresentação — ambas
  grandes, ainda coesas o bastante para não separar sem alinhamento (ver seção 6).
- **`specifications.js`** — scan de tokens, render de cards de spec/token, controles de
  grupo (ocultar linhas, ocultar grupo, cadeado), posicionamento manual, fluxos de tela.
  Maior número de funções (73) — é o módulo mais "interativo" (muitos handlers de clique).
- **`measurement.js`** — medidas no canvas (padding/gap/width/height), pequeno e sem
  sinais de inchaço.
- **`messages.js`** — dispatcher único de `window.onmessage`. Roteia por `msg.type` para
  funções definidas em outros módulos (chamadas quase sempre via `typeof fn === 'function'`
  antes de invocar — padrão defensivo consistente, 17 ocorrências revisadas em `core.js`
  sozinho).
- **`design-data.js`** — import/export de JSON de projeto, recriação de specs/medidas a
  partir de snapshot. Módulo mais novo e mais enxuto, sem BOM (foi criado depois do
  incidente do "vão fantasma").

---

## 3. O que está exclusivo em beta vs. já em main

Diff `main..beta/v4.3-melhorias-operacionais` (código, sem contar rebuilds de artefato):

```
src/plugin/code.js                 |  12 +-
src/plugin/modules/core.js         |   9 +-
src/plugin/modules/handoff.js      | 256 +++++++++++++++++++--
src/plugin/modules/measurement.js  |  10 +
src/plugin/modules/messages.js     |  10 +
src/plugin/modules/specifications.js | 72 +++++-
```

**Exclusivo de beta (v5.1.0-beta.1), não em main (v5.0.0):**
- Controles de grupo de specs: ocultar linhas, ocultar grupo, cadeado de travamento
- Posicionamento manual de spec
- Ordenação de camadas (z-index) por tag hierárquica
- Header secundário redesenhado nas 7 views (`.fab-inline`, correção de BOM que causava
  "vão fantasma")
- Tags alfanuméricas (A1, A1.1) no empilhamento de specs
- Correção de chave de localStorage de dúvidas (`handex-comments-${projectId}` — bug do
  template literal com aspas erradas, corrigido em `199b6e7`)

**Já promovido/paralelo em main:**
- Resgate de versão da ficha existente no canvas
- Chip de status no Resumo do Projeto
- Auto-adição do designer na equipe (Etapa 1)
- Bloqueio do modal "Gerar Ficha" quando falta campo obrigatório

Esses itens aparecem via commits `chore: rebuild de artefatos apos cherry-pick` nos dois
branches — ou seja, o fluxo atual é cherry-pick manual de fixes reais para os dois lados,
como esperado pelas regras do projeto. **Risco de processo**: cherry-pick manual depende
de alguém lembrar de replicar; não há automação nem checklist. Se uma correção de bug
real ficar só em beta por esquecimento, main carrega o bug por mais tempo do que deveria.

---

## 4. Acoplamento cruzado (grep amplo, contagem real)

Chamadas de função de um módulo dentro do código de outro (nome de função definida em A,
contada como `nomeDaFuncao(` dentro de B):

| Direção | Chamadas |
|---|---|
| `core.js` → usado em `handoff.js` | 27 |
| `core.js` → usado em `specifications.js` | 111 |
| `core.js` → usado em `measurement.js` | 19 |
| `core.js` → usado em `messages.js` | 48 |
| `core.js` → usado em `design-data.js` | 15 |
| `handoff.js` → usado em `core.js` | 3 |
| `specifications.js` → usado em `core.js` | 12 |
| `measurement.js` → usado em `core.js` | 1 |
| `design-data.js` → usado em `core.js` | 0 |
| `handoff.js` → usado em `specifications.js` | 0 |
| `specifications.js` → usado em `handoff.js` | 2 |

**Leitura**: a arquitetura de fato observada é uma **estrela** centrada em `core.js`
(estado global + utilitários), não uma malha. `handoff.js` e `specifications.js` quase
não se chamam diretamente (0 e 2 ocorrências) — bom sinal, são módulos horizontalmente
independentes entre si. O acoplamento reverso (`core.js` chamando de volta funções de
`specifications.js`/`handoff.js`) é sempre via guard `typeof fn === 'function'`, um
padrão defensivo usado consistentemente — não é acoplamento rígido, é polimorfismo
informal (callback opcional). Não constitui risco imediato, mas **é frágil**: renomear
uma função sem atualizar o nome no guard falha silenciosamente (nenhum erro, a feature
simplesmente não dispara). Não há teste automatizado que pegue isso.

---

## 5. Contrato de mensagens `code.js` ↔ `messages.js`

- Backend (`figma.ui.onmessage`): **41 handlers** de mensagens recebidas do frontend
  (`msg.type === '...'`), **39 pontos de `figma.ui.postMessage`** enviando de volta.
- Frontend (`messages.js`, dispatcher único): **21 handlers** de `msg.type ===` tratando
  mensagens vindas do backend.
- Tipos postados pelo backend, cruzados contra handlers do frontend: a maioria bate.

**Bug real encontrado e corrigido nesta sessão**: o backend posta `type: 'toast'` em
5 pontos de `code.js` (linhas 193, 197, 232, 235, 321 — todos na feature de injeção de
cenário/exceção em card de spec no canvas), mas **não existia handler `msg.type === 'toast'`
em `messages.js`**. Esses toasts de sucesso/erro (ex: "Card não encontrado no grupo.",
"Cenário injetado no card de spec.") nunca apareciam na UI — silenciosamente descartados
pelo dispatcher. Corrigido em `src/plugin/modules/messages.js` adicionando o handler que
chama `showToast(msg.message)` (função já existente em `core.js`, compartilhada por
escopo global).

**Dívida sinalizada, não corrigida**: `showToast(message)` em `core.js` (linha 1569) não
aceita/usa o segundo parâmetro `kind` (`'error'`/`'success'`/`'warning'`) que várias
chamadas já passam (ex: `showToast('Salvo automaticamente', 'success')`, e agora também
os toasts de `code.js` via `msg.kind`). O ícone exibido é sempre o verde de sucesso,
independente do `kind`. Não é um bug de mensagem quebrada (o toast aparece), mas é uma
inconsistência visual — um toast de erro parece de sucesso. Ficou fora do escopo desta
correção porque mudar `showToast` afeta ~15 chamadas existentes e é mudança de
comportamento visual observável, não puramente estrutural.

**Código morto documentado (não é bug)**: `map-prototype-flows` /
`prototype-flows-mapped` (mapeamento de fluxos de protótipo) existe só como bloco
comentado em `code.js` (linhas ~1978–2028), com instruções de como ativar. Não há
handler correspondente no frontend porque a feature nunca foi ativada — é um esqueleto
para trabalho futuro, propositalmente inerte.

`annotations-added` tem handler em `messages.js` (linha 188) mas não encontrei mais
nenhum `figma.ui.postMessage({ type: 'annotations-added' ... })` em `code.js` — handler
órfão inofensivo (não quebra nada, apenas nunca dispara). Não corrigido nesta sessão por
ser puramente cosmético/morto e não haver certeza de que não é construído dinamicamente
em algum ponto que o grep léxico não capturou; merece checagem futura antes de remover.

---

## 6. Sinais de monolito e recomendações de escopo maior (NÃO executadas)

- **`handoff.js` (2511 linhas) combina duas responsabilidades grandes**: coleta/
  serialização de `handoffData` (`collectHandoffData`, diff de snapshots) e geração de
  HTML standalone da ficha (`getInteractiveHTMLContent`, provavelmente a maior função
  single do projeto — gera todo o markup da ficha interativa via template strings).
  Essas duas responsabilidades são coesas *internamente* mas são conceitualmente
  distintas (dados vs. apresentação). Dividir em `handoff-data.js` + `handoff-render.js`
  reduziria o tamanho de arquivo e o custo cognitivo de navegar o módulo, mas é uma
  mudança estrutural que toca build (`build.cjs`), ordem de concatenação, e não é trivial
  de fazer "sem mudar comportamento observável" com segurança total — recomendo, não
  executo.
- **`specifications.js` (2422 linhas, 73 funções)** é o módulo com mais funções do
  projeto depois de `core.js`. Ainda é coeso (tudo gira em torno de specs/tokens/fluxos),
  mas se crescer mais na direção de "fluxos de tela" como responsabilidade separada de
  "specs/tokens", pode valer a pena separar `flows.js` no futuro. Hoje ainda não
  justifica — não há evidência de que fluxos e specs estejam se atrapalhando.
- **Cherry-pick manual entre `main` e beta** é um processo, não um problema de módulo,
  mas é um risco arquitetural de fato: não há registro automatizado de quais commits já
  foram replicados. Recomendo (não executei, é decisão de processo do Augusto) manter
  uma lista simples de "commits de fix pendentes de cherry-pick para main" enquanto o
  beta estiver ativo.

---

## 7. O que foi corrigido nesta sessão (10/07)

- `src/plugin/modules/messages.js` — adicionado handler `msg.type === 'toast'` (faltava,
  5 postagens do backend caíam no vazio). Rebuild de `ui.html` aplicado.
- Nenhuma outra mudança de código. `_skeleton.json` e `code.bundle.js` foram gerados
  durante verificação mas revertidos por não terem mudança de conteúdo relevante (só
  timestamp de refs).

## 8. Preparação para publicação na Figma Community (21/07)

**Manifest (`src/plugin/manifest.json`) ganhou 3 campos exigidos pelo fluxo de submissão
do Figma:**
- `id` fixo do plugin.
- `networkAccess.allowedDomains: ["https://unpkg.com", "https://cdnjs.cloudflare.com"]`
  — os únicos dois domínios que o plugin de fato contata em runtime dentro do iframe
  (Lucide sempre; jsPDF/JSZip via cdnjs, sob demanda na exportação em PDF). Confirmado
  por dois agentes independentes que nenhum outro domínio referenciado em `ui.html`
  (Google Fonts, Tailwind CDN, links `designsystem.caixa.gov.br`) é carregado dentro do
  sandbox do plugin — são texto de uma template string (`fullHTML`, ficha standalone
  exportada) ou `window.open()` de navegação, não requisições do iframe.
- `documentAccess: "dynamic-page"` — obrigatório para novos plugins, mas com risco real
  de compatibilidade: **este campo faz o Figma carregar em memória só a página
  atualmente aberta**, não o documento inteiro.

**Risco identificado e corrigido nesta sessão**: `src/plugin/code.js` resolvia
`frame.figmaId` (persistido em `handoffData.frames`, podendo estar em qualquer página
de um arquivo com múltiplas páginas — cenário real de handoff de projetos com várias
telas) via `figma.getNodeById(...)` **síncrono**, em ~20 pontos. Sob `dynamic-page`,
isso retorna `null` silenciosamente para nós de páginas não carregadas — o frame
"desaparece" do handoff sem erro visível. Migrado todo o arquivo para
`await figma.getNodeByIdAsync(...)`, que carrega a página do nó automaticamente se
necessário. Detalhe da migração:
- `_writeSharedPluginData(data)` virou `async` (único caller, em `save-storage`, já
  ganhou `await`).
- 5 cadeias de `.forEach` viraram `for...of` (`forEach` não suporta `await` no corpo):
  frames/createdSpecs pendentes de lock em `create-handoff`, a seção "Especificações"
  (3 níveis aninhados, resolve `s.id` pra montar hyperlink de nó), `hide-spec-lines` e
  `unlock-spec-group`.
- `figma.currentPage.selection` / `.findOne` / `.findAll` / `.findChildren` **não foram
  tocados** — operam só em nós já resolvidos da página atual, sem o mesmo risco.
- Validado por dois agentes independentes (o que fez a migração + uma segunda revisão):
  0 `getNodeById` síncrono restante, 21 usos de `getNodeByIdAsync`, `tsc --noEmit`
  limpo, nenhum `forEach` remanescente com `await` no corpo (checado
  programaticamente), nenhum handler virou fire-and-forget incorretamente.

**Risco residual, não verificável por análise estática**: o cenário que motivou a
migração (nó de página não carregada) só se manifesta de fato dentro do Figma desktop.
Roteiro de teste manual recomendado antes de publicar: abrir arquivo multi-página,
garantir que a página de um frame documentado não foi visitada na sessão, e testar
`Gerar Ficha`, `lock-spec`, `hide-spec-lines`, `unlock-spec-group`,
`reapply-measurements`, `delete-node`/`rename-node`/`focus-node`, e `save-storage`
nesse frame — confirmando que o node é resolvido corretamente em vez de falhar
silenciosamente.

**Limpeza relacionada**: removida a dependência `@google/genai` do `package.json`
(instalada mas sem nenhuma chamada no código-fonte, confirmado por grep). Referências
a ela em documentação (`docs/plugin-capabilities/06-pipeline-seguranca.md` e três
arquivos de agente em `.claude/agents/`, este último não versionado) foram corrigidas
para não apontar um agente futuro a investigar uma dependência que não existe mais.

---

## 9. Verificado e sem problema (não precisou de ação)

- BOM em `views/*.html`: nenhum arquivo de view tem BOM hoje — o incidente do "vão
  fantasma" (documentado em `frontend-ui.md`/`design-ux.md`) não regrediu.
- Padrão do bug de template literal com aspas erradas (`"chave-${var}"` em vez de
  crase): grep amplo em todos os módulos + `code.js` não encontrou outra ocorrência.
- Acoplamento `handoff.js` ↔ `specifications.js`: baixíssimo (0 e 2 chamadas) — não há
  sinal de dependência cruzada escondida entre esses dois módulos grandes.
