# Guia de uso do grafo de conhecimento do hac

`docs/knowledge-graph.json` é um grafo de conhecimento próprio do hac —
construído do zero, lendo o código real (branch `beta/a11y-mobile-handoff`,
2026-09-22), inspirado no FORMATO de nós/arestas do `.ua/knowledge-graph.json`
(plugin Understand Anything, já instalado no projeto), mas **não depende
dele nem reaproveita seu conteúdo**. O `.ua/` é genérico (imports/calls
estáticos) e não captura NENHUMA aresta de `postMessage` — que é exatamente
a amarra mais frágil e mais cara deste projeto (ver `patterns` e
`propagatesField` no JSON). Este grafo existe para preencher esse buraco
específico, não para substituir o `.ua/` como ferramenta geral.

Não há motor de query. É um arquivo JSON estático — a "consulta" é grep ou
leitura direta.

**Visualização navegável (2026-09-22)**: `docs/knowledge-graph-view.html`
apresenta o mesmo conteúdo de forma navegável (busca por mensagem, filtro
por direção, campos propagados, padrões, arquivos/dependências) — útil pra
explorar visualmente, mas não substitui o JSON como fonte de verdade.
**Gerada** por `docs/build-knowledge-graph-page.cjs` — nunca editar o
`.html` à mão; depois de qualquer mudança em `knowledge-graph.json`, rodar:
```
node docs/build-knowledge-graph-page.cjs
```

---

## Quando consultar este grafo

**Antes de:**
- Adicionar, remover ou renomear um campo de payload em qualquer mensagem
  `postMessage` (frontend→backend ou backend→frontend).
- Adicionar um novo `msg.type` (ou uma nova função que dispara um tipo
  existente de um lugar novo).
- Mexer em qualquer um dos 3 fluxos paralelos de clone (Ordem de Tabulação /
  Trilha de Swipe / Leitor de Tela-Specs) — mesmo que a mudança pareça
  isolada a um dos três.
- Investigar um sintoma "campo undefined no frontend" ou "resposta não
  chegou" — provavelmente é um handler com múltiplos pontos de disparo
  divergentes, ou um campo que não foi propagado em todos os pontos.

Se a resposta não estiver no grafo (campo novo, mensagem nova desde
2026-09-22), **grep no código real primeiro** (é o que este documento
ensina a fazer) — o grafo é um ponto de partida, não a fonte de verdade
absoluta; ele fica desatualizado se o código mudar e ninguém regenerar.

---

## Receitas de consulta

### "Vou mudar/adicionar um campo X numa mensagem Y — quem mais depende disso?"

1. Abra `docs/knowledge-graph.json` e procure o nó da mensagem em `messages[]`
   pelo `id` (`message:nome-da-mensagem`) — confira `payloadFields`,
   `senders` (quem dispara) e `consumers` (quem trata a resposta).
2. Se o campo já existe em `propagatesField[]` (procure por
   `"field": "X"`), você tem a lista completa dos pontos que leem/escrevem
   esse campo hoje — TODOS esses pontos são candidatos a precisar da mesma
   mudança.
3. Se o campo NÃO está em `propagatesField[]` (campo novo ou não mapeado
   ainda), grep real no código:
   ```
   grep -rn "nomeDoCampo" src/plugin/backend/ src/plugin/modules/ src/plugin/code.js
   ```
   Todo resultado é um ponto que precisa ser avaliado antes de declarar a
   mudança pronta.
4. Depois de terminar a mudança, se o campo se tornou compartilhado por 2+
   pontos, **adicione uma entrada nova em `propagatesField[]`** (ou estenda
   uma existente) — mantém o grafo útil pra próxima pessoa/sessão.

### "Vou adicionar um novo tipo de mensagem — onde ele deveria ser tratado?"

- Frontend→backend: handler entra em `src/plugin/backend/onmessage.js`
  (dispatcher único — ver `direction: "frontend-to-backend"` no grafo para
  o padrão `if (msg.type === "...")`). Exceção conhecida:
  `resolve-manual-spec-match` delega para `dsc-matching.js`
  (`_resolveManualSpecMatchAndNotify`) — só esse caso hoje foge do
  dispatcher central.
- Backend→frontend: handler entra em `src/plugin/modules/messages.js`
  (dispatcher único — ver `direction: "backend-to-frontend"`). Exceção
  conhecida: `manual-spec-match-resolved` é o único enviado de fora de
  `onmessage.js` (sai de `dsc-matching.js`).

### "Estou mexendo em um dos 3 fluxos de clone (Tabulação/Swipe/Specs) — o que preciso espelhar nos outros 2?"

Leia `patterns[0]` (`pattern:3-parallel-clone-flows`) no JSON — lista as
funções espelhadas (`_createTabOrderCloneForArea` /
`_createSwipePathCloneForArea` / `_createSpecCloneForArea`, e as três
`_resolveActive*Clone`), as mensagens de gatilho/resposta de cada fluxo, e
as **assimetrias já conhecidas e documentadas** (`knownAsymmetries`) —
campos que hoje só existem em UM dos três fluxos (`workAnchor`/`savedAnchor`
só em Specs; `nodeMap` ausente em Specs). Se sua mudança toca um desses
campos, decida explicitamente se a assimetria deveria continuar ou ser
corrigida — não assuma que "espelhar" é sempre a resposta certa, os
comentários no código já mostram que ao menos uma das assimetrias
(`workAnchor`) parece proposital (só Specs precisa de posição fixa entre
sessões).

### "Quantos lugares disparam esta mensagem? Isso é uma ponta solta?"

Olhe o array `senders` do nó da mensagem. Um `senders.length > 1` não é
automaticamente um bug — pode ser:
- **Mutuamente exclusivo dentro do mesmo handler** (ex: branch de sucesso
  vs. branch de erro do mesmo `if (msg.type === ...)`) — baixo risco, só
  confira que ambos os branches propagam os mesmos campos (mesmo que com
  valor `null`).
- **Múltiplos módulos disparando o mesmo tipo de utilitário genérico** (ex:
  `delete-node`, `id` + nada mais) — baixo risco, payload trivial.
- **Múltiplos pontos no MESMO módulo do frontend disparando com a MESMA
  assinatura de payload** (ex: `start-spec-copy` em `accessibility.js:997`
  e `accessibility.js:6830`) — risco médio, vale perguntar ao
  `accessibility-specialist` se deveria ser consolidado numa função só.
- **Mensagem sem handler correspondente** (ex: `clear-highlight`, 5 pontos
  de disparo, handler removido) — isso É uma ponta solta real, já marcada
  explicitamente no campo `note` do nó correspondente.

Cada nó com mais de 1 sender tem uma nota (`note`) classificando o risco —
leia antes de assumir que é bug.

---

## Estado atual (resumo, 2026-09-22)

- **93 mensagens mapeadas** (tipos distintos, contando direções
  separadamente — `start-spec-copy` e `spec-copy-started` são 2 nós, não 1).
- **25 mensagens com mais de 1 ponto de disparo/tratamento** — a maioria
  são branches mutuamente exclusivos do mesmo handler (sucesso/erro) ou
  utilitários genéricos (`delete-node`); uma pequena minoria é risco real
  (ver `clear-highlight`, ponta solta confirmada; `start-spec-copy` e
  `create-unified-spec`, 2 pontos de disparo idênticos no frontend, candidatos
  a consolidação).
- **6 campos com arestas `propagatesField` explícitas**: `workAnchor`,
  `savedAnchor`, `nodeMap`, `a11yDscComponentName`, `areaId`, `generation`.
- **1 mensagem morta confirmada**: `clear-highlight` (5 sends, 0 handlers).
- **1 handler sem sender conhecido**: `toast` (em `messages.js`, nenhum
  `postMessage` encontrado que o dispare — provável resíduo herdado do
  Handex).
- **1 padrão estrutural documentado**: os 3 fluxos paralelos de clone, com
  2 assimetrias de campo já identificadas e não resolvidas
  (`workAnchor`/`savedAnchor` só em Specs; `nodeMap` ausente em Specs).

---

## Exemplo concreto

**Pergunta**: "Vou mudar o campo `workAnchor` da mensagem `spec-created` —
o que mais preciso tocar?"

**Como responder usando o grafo:**

1. Abra `docs/knowledge-graph.json`, procure `"field": "workAnchor"` em
   `propagatesField[]`. A entrada lista 10 pontos:
   - `message:start-spec-copy` (envia `savedAnchor`, campo irmão)
   - `_createSpecCloneForArea` (onmessage.js:2862 — calcula/retorna)
   - `_resolveActiveSpecClone` (onmessage.js:2940 — propaga)
   - `message:spec-copy-started` (devolve, só na 1ª criação)
   - `message:spec-created` (devolve, mesmo raciocínio)
   - `messages.js:227-228` (spec-created: grava via `_saveA11yAreaWorkAnchor`)
   - `messages.js:391-392` (spec-copy-started: mesmo padrão)
   - `accessibility.js:836-866` (`_getA11yAreaWorkAnchor`/`_saveA11yAreaWorkAnchor`)
   - `onmessage.js:4880` e `onmessage.js:5181` (leem `area.workAnchor` como
     `savedAnchor` ao resolver o clone em `create-unified-spec` e
     `prepare-ficha-section-edit`)
2. `gapsIdentified` da mesma entrada já avisa: `_createTabOrderCloneForArea`
   e `_createSwipePathCloneForArea` NÃO recebem/retornam `workAnchor` — se a
   mudança pretendida for "mudar o FORMATO do valor" (ex: de `{x,y}` para
   `{x,y,rotation}`), isso não quebra os outros 2 fluxos (eles nem usam o
   campo) — mas se a intenção for "estender `workAnchor` para os 3 fluxos",
   este é o ponto exato onde replicar (mesma assinatura de
   `_createSpecCloneForArea`/`_resolveActiveSpecClone`).
3. Antes de declarar a tarefa pronta: confirmar com grep real
   (`grep -rn "workAnchor" src/plugin/`) que nenhum ponto novo apareceu
   desde 2026-09-22 (o grafo pode estar desatualizado).
4. Sinalizar para `qa-plugin` a mudança de contrato (mesmo padrão que
   `architecture-guardian` já segue) — mudança de payload de mensagem é
   sempre candidata a smoke test manual dos 3 fluxos de clone.
