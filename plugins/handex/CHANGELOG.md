# CHANGELOG — HANDEX Plugin

---

## v4.1.6 — 2026-06-11

### Resumo
Refinamentos de UX na ficha canvas e na view de escaneamento de tokens: remoção dos indicadores de conformidade por propriedade (decisão de produto — conformidade é responsabilidade do designer, não informação para o dev), filtragem inteligente de vetores e frames-container dos resultados de scan, ícone de localização explícito nos cards escaneados e correção do botão de recolher/expandir accordions.

---

### Ficha Canvas — Card User Interface

**Remoção dos dots de conformidade por propriedade**
- Os indicadores coloridos (verde/âmbar/vermelho) por linha de propriedade foram removidos da ficha.
- Razão: criavam uma falsa impressão de "100% conforme" pois refletiam apenas o resultado do scan automatizado, não a declaração de conformidade do designer. A acurácia de conformidade é responsabilidade do designer e já está registrada nos toggles do plugin.
- O badge de status do componente (DSC / AJUSTE / FORA), visível apenas quando a auditoria está ativa, permanece.

**Remoção da legenda de status do header**
- A legenda "● Conforme ● Atenção ● Fora" adicionada ao header do card foi removida junto com os dots que a justificavam.

---

### Escaneamento de Tokens — Filtragem de Resultados

**Vetores removidos completamente**
- Nós do tipo `VECTOR`, `BOOLEAN_OPERATION`, `ELLIPSE` e `RECTANGLE` não geram mais entradas nos resultados de scan.
- Razão: shapes primitivos não são elementos do DS — sua presença ou ausência de token não representa não-conformidade.

**Frames-container filtrados; apenas frames "puros" mantidos**
- Frames que contêm ao menos um descendente `INSTANCE` ou `COMPONENT` são removidos dos resultados.
- Razão: um frame que agrupa componentes é um contêiner de layout; a conformidade vive nos filhos, não no frame em si.
- Exceção preservada: frames sem nenhum filho DS (100% custom, sem uso de biblioteca) continuam aparecendo como alerta — indicam tela construída fora do DS.

---

### Scan — Ícone de Localização nos Cards

- Cada card de elemento escaneado exibe um ícone `locate` no canto direito do header, visível no hover.
- O card inteiro já era clicável e chamava `focusNode(item.nodeId)` — o ícone torna essa ação descobrível.

---

### Accordions — Recolher/Expandir Todos

**`collapseAllAccordions` inclui cards de frame**
- O botão `⇅` agora recolhe/expande também os cards de frame (accordions da view "Escanear Tokens"), não apenas os accordions internos (seções de tokens, medidas, specs).
- Implementado adicionando a classe `accordion-content` ao div `frame-body-{id}` e tratando a rotação do chevron via prefixo `frame-body-` no id.

**Correção de bug: chevron dos cards de frame não rotacionava**
- `toggleFrameAccordion` buscava `frame-arrow-{id}` mas o HTML renderizava `frame-chevron-{id}`.
- Corrigido para `frame-chevron-{id}` — o chevron agora rota corretamente ao abrir/fechar manualmente um card de frame.

---

### Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/plugin/code.js` | Remove dots de conformidade e legenda; filtro de vetores e frames-container em `addElement()` |
| `src/plugin/modules/core.js` | `collapseAllAccordions` inclui frame bodies; `toggleFrameAccordion` usa `frame-chevron` |
| `src/plugin/modules/specifications.js` | `frame-body` recebe classe `accordion-content`; ícone `locate` nos cards do scan |

---

## v4.1.5 — 2026-06-11

### Resumo
Melhorias na seção de Especificações da ficha canvas: chip de categoria semântico, link direto para o nó no canvas, exibição de propriedades técnicas e organização por grupos nomeados. Novo botão "Limpar todos os dados" na home com modal de confirmação e reset programático (sem tela branca). Padronização de `rounded-2xl` em todos os botões do plugin.

---

### Ficha Canvas — Seção de Especificações

**Chip de categoria corrigido e semântico**
- O chip exibia "Geral" por usar `s.category` (ausente na estrutura de spec). Corrigido para `s.type || s.categoryLabel || s.category` com fallback para `'Geral'`.
- Cor do chip agora deriva de `spec.color`: background 12% saturado + borda na cor original + texto na cor original — alinhado à semântica visual das categorias do plugin.

**Seção única "Especificações"**
- "Especificações Visuais" e "Especificações Anotadas" mescladas em um único card; não havia diferença de conteúdo entre as duas.

**Link para o nó no canvas**
- Nome da spec sublinhado e com hyperlink `{ type: "NODE", value: spec.targetNodeId }` ao clicar diretamente no canvas do Figma.
- Guard `figma.getNodeById(spec.targetNodeId)` evita o erro `Invalid hyperlink target node specified` para specs cujo nó não existe mais no documento.

**Propriedades técnicas na ficha**
- Cada entrada de `spec.properties[]` é exibida como linha com `prop.label`, `prop.token` e `prop.value` dentro do card da spec.

**Organização por grupos nomeados**
- Specs agrupadas por letra com cabeçalho de nome do grupo quando `frame.specGroupNames[letra]` estiver definido.
- Grupos com `frame.specGroupVisible[letra] === false` são omitidos da ficha.

---

### Limpar Todos os Dados

- **Botão lixeira** (`trash-2`) adicionado à home ao lado do botão "Importar JSON".
- Clique abre modal de confirmação (`confirm-clear-modal`) com descrição do impacto e botão "Sim, limpar tudo" (vermelho).
- `confirmClearAllData()`: reseta `handoffData` em memória para o estado inicial do schema v2, limpa `localStorage['handex-state']` e `localStorage['handex-ann-categories-v2']`, esvazia `createdSpecs`, chama `restoreUIFromState()`, navega para home e exibe toast "Todos os dados foram removidos."
- **Correção de tela branca:** `location.reload()` não é suportado no WebView do Figma — substituído por reset programático em memória.

---

### UI — Border-radius consistente

- Todos os elementos `<button>` do plugin agora usam `rounded-2xl` (1 rem) — atualização via script em 12 arquivos de views e módulos.
- Antes: botões da home usavam `rounded-2xl` enquanto o restante do plugin usava `rounded-xl`/`rounded-lg`; agora todos estão padronizados.

---

### Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/plugin/code.js` | Chip semântico de categoria; link NODE com guard `getNodeById`; specs agrupadas por letra com header; propriedades na ficha; seção única |
| `src/plugin/modules/design-data.js` | `clearAllData()` + `confirmClearAllData()` com reset programático |
| `src/plugin/modules/core.js` | Exposição de `clearAllData` e `confirmClearAllData` no `window` |
| `src/plugin/views/home.html` | Botão lixeira ao lado de "Importar JSON" |
| `src/plugin/views/modals.html` | Modal `confirm-clear-modal` |
| `src/plugin/views/*.html` (8 arquivos) | `rounded-xl` → `rounded-2xl` em `<button>` |
| `src/plugin/modules/*.js` (4 arquivos) | `rounded-xl` → `rounded-2xl` em `<button>` |

---

## v4.1.4 — 2026-06-11

### Resumo
Importação de JSON com aplicação no canvas, rastreabilidade de specs via `targetNodeId`, correções de UX no scroll/header/acordeões, posicionamento da ficha e specs no canvas, otimização de performance e reestruturação da ficha em 3 cards.

---

### Importação JSON → Aplicar no Canvas

- **Modal pós-importação** (`import-apply-modal`) — ao importar um JSON de progresso, exibe um resumo com contadores de frames, specs, medidas e fluxos, e oferece três ações de canvas:
  - **Gerar Ficha Técnica** — aciona `createHandoffOnCanvas()` com os dados importados (sempre disponível).
  - **Recriar Cards de Especificação** — reenvia `create-unified-spec` para cada spec salva, usando `targetNodeId` preciso quando disponível.
  - **Reaplicar Medidas** — novo handler `reapply-measurements` em `code.js`; localiza cada elemento pelo nome dentro do frame e recria anotações W×H no canvas.
- **"Apenas restaurar"** fecha o modal sem tocar o canvas, preservando o comportamento anterior.
- Opções sem dados ficam desabilitadas automaticamente com mensagem explicativa.

### Rastreabilidade de Specs — `targetNodeId`

- **`code.js`** — a mensagem `spec-created` agora inclui `targetNodeId: node.id`, o ID Figma do elemento exato que foi anotado.
- **`messages.js`** — persiste o campo automaticamente em `frame.createdSpecs[]` (sem alteração de código — o push já copia o objeto inteiro).
- **`design-data.js`** — re-aplicação via JSON usa `spec.targetNodeId` como prioridade; cai para `frame.figmaId` como fallback para specs geradas antes desta versão (compatibilidade retroativa).
- **Habilitado para auditoria futura** — com o ID do nó original armazenado, será possível comparar as propriedades documentadas na spec com o estado atual do elemento no canvas, detectando drift de tokens.

### Correções de UX — Header, Scroll e Acordeões

- **Header sempre visível** — adicionado `position: relative` ao `<header>` para que `z-50` tenha efeito; antes o conteúdo das views sobrepunha o header por ordem DOM.
- **Reset de scroll sem flash** — `navigate()` reseta `scrollTop` de todas as sub-regiões **antes** de ativar a view (enquanto `display: none`), eliminando o flash de conteúdo defasado.
- **Botão "Recolher tudo" (Collapse All)** — corrigido seletor de `button[onclick*="toggleAccordion"]` para `[onclick*="toggleAccordion"]` (elementos usam `<div role="button">`, não `<button>`); botão adicionado também às views de Medidas e Frames (estava apenas em "Anotar Specs").

### Canvas — Posicionamento da Ficha e Specs

- **Ficha não gerada sobre o frame principal** — `mainContainer` agora é posicionado em `(-99999, -99999)` imediatamente após `appendChild`, antes de qualquer cálculo; se nenhum critério de posicionamento for satisfeito, o fallback é a borda direita do viewport.
- **Ficha desbloqueada** — `mainContainer.locked = false`; antes a ficha chegava travada, forçando o uso do painel de layers para movê-la.
- **Specs sempre à direita** — direção simplificada: toda nova spec é criada à direita do elemento anotado; mesma letra empilha verticalmente, letra diferente abre nova coluna.
- **Posicionamento persistente entre sessões** — substituído o `specColumnTracker` (objeto em memória, zerado ao fechar o plugin) por varredura de `figma.currentPage.children` a cada criação, reconstituindo o mapa de posições a partir do canvas.

### Performance

- **`findAll` → `children.forEach`** — `figma.currentPage.findAll()` percorre toda a árvore de nós da página (potencialmente milhares), causando lentidão perceptível em arquivos complexos. Substituído por `figma.currentPage.children.forEach()` para localizar grupos de spec e fichas — todos são filhos diretos da página.

### Layout da Ficha — 3 Cards Separados

- **Card 1 — Informações Básicas** (480 px): Informações Básicas + Equipe e Responsáveis.
- **Card 2 — Briefing Estratégico** (440 px): criado somente quando há perguntas respondidas; briefing extraído do card principal.
- **Card 3 — User Interface** (largura AUTO): colunas Componentes, Ícones, Vetores, Tipografia e Frames dispostas lado a lado, sem wrap. `specsRow` com `layoutWrap` removido e `itemSpacing: 24`.

### Visual

- **Chip "Novo Componente" na ficha** — trocado de retângulo violeta sólido (`cornerRadius: 4`, texto branco) para pill com fundo lilás suave (`#F0EBFF`), borda `#B399F5` e texto roxo `#6130C7` — alinhado visualmente ao chip de papel da seção Equipe.

---

## v4.1.3 — 2026-06-10

### Resumo
Refinamentos de scan, UX e layout da ficha canvas: scan percorre todo o frame (incluindo interior de componentes DSC), tokens clicáveis no plugin e na ficha, reorganização do layout da ficha, correção do loading persistente e ajustes visuais.

---

### Scan — Granularidade Completa

- **Remoção do skip de filhos em instâncias DSC** — `extractSpecs` agora percorre toda a árvore do frame sem interromper em componentes da biblioteca. Tipografia, ícones, vetores e frames internos a componentes DSC aparecem nos seus respectivos accordions de resultado.

### Tokens Clicáveis

- **Plugin UI** — cada linha de propriedade (cor, espaçamento, tipografia, raio, etc.) nos cards de scan tem `onclick="focusNode(nodeId)"`, focando o nó correspondente no canvas do Figma ao clicar.
- **Ficha canvas** — o nome de cada elemento nas colunas de componentes, ícones, tipografia, vetores e frames aparece como link azul sublinhado apontando para `figma.com/design/{fileKey}?node-id={nodeId}`.

### Layout da Ficha Canvas

- **Briefing ao lado das Informações Básicas** — criada linha horizontal `topInfoRow`: coluna esquerda contém Informações Básicas + Equipe; coluna direita contém Briefing Estratégico.
- **Vetores ao lado de Ícones** — nas colunas de componentes UI, Ícones e Vetores agora formam uma coluna vertical dupla posicionada lado a lado com Componentes, Tipografia e Frames.
- **Chip de papel (Equipe)** — `roleTag` trocado de botão sólido azul para pill com fundo azul-claro, borda suave e texto azul.

### Correções

- **Loading persistente** — adicionado handler para `handoff-error` em `messages.js`; qualquer exceção durante a geração da ficha agora fecha o overlay e exibe toast de erro.
- **Snackbar "Informações preenchidas"** — corrigidos dois problemas: (1) `localStorage` trocado por `sessionStorage` (mostrava apenas uma vez na vida inteira); (2) adicionado trigger na entrada da view para janelas onde o conteúdo não requer scroll.

### UX / Visual

- **Botão "Voltar ao topo"** — contraste elevado no estado default: fundo `slate-900/20` translúcido com borda `slate-900/20`; hover mantém azul `#0070af`. Compilador Tailwind corrigido de v4 para v3 (`tw3`) para que classes com modificador `/` sejam geradas corretamente.
- **Botão "Publicar no SharePoint"** — ocultado (integração em discussão técnica).

### Versionamento

- `manifest.json` — adicionado campo `version: "4.1.2"` (antes ausente).
- Badge visual no header do plugin atualizado de `v4.1.1` para `v4.1.2`.
- `bundle:css` corrigido para usar `tw3` (Tailwind v3) em vez de `tailwindcss` (v4), resolvendo incompatibilidade de config.

---

## v4.1.2 — 2026-06-10

### Resumo
Melhorias significativas na detecção de conformidade DSC — correção do bug central de auditoria, novo status "Conforme com ressalvas", ressalvas salvas na documentação, detecção por `variable.remote`/`style.remote`, e refinamentos de UX no contraste visual e comportamento do plugin minimizado.

---

### Conformidade DSC — Correções e Novos Comportamentos

**Bug crítico corrigido — `auditProperty` bloqueava todo lookup em modo normal**
- `audit.js`: a guard `if (!isAudit || ...)` impedia qualquer verificação de chave quando `isAudit: false` (todos os scans normais). Reestruturado em dois passes: Pass 1 (lookup por chave Figma — sempre roda) e Pass 2 (soft matching — só em modo auditoria).

**Detecção por `variable.remote` e `style.remote`**
- `code.js`: `getVar()` agora retorna `remote: true` quando a variável vem de biblioteca publicada
- Função `audit()` aceita novo parâmetro `isRemote` — se `true`, retorna `EXACT` sem consultar o skeleton
- Aplicado a: cores (fill), tipografia, espaçamentos, paddings, bordas, raios e efeitos
- Mitiga o problema de `variables: 0` nas bibliotecas cujos tokens não foram buscados via REST API

**Tipografia — nova regra de conformidade**
- Se o nó TEXT tem estilo vinculado (`styleKey != null`) e a fonte é CAIXAstd → `isDS: true`
- Antes: tipografia com token DSC aplicado continuava aparecendo como não conforme

**Instâncias remotas → conformes (não mais "revisão")**
- Componentes e ícones com `mainComponent.remote = true` agora recebem `isDS: true` (antes `'warning'`)
- Ícones da lib Fundamentos Visuais paravam de aparecer indevidamente no alerta

**Frames fora de padrão → aparecem no alerta**
- `addElement("frames")` calcula `isDS` com base nas props de estilo: todos DSC → `true`; mix → `'warning'`; nenhum → `false`
- Frames não conformes aparecem na lista "Itens para revisar:" com label "Frame"

**Novo status "Conforme com ressalvas"**
- Quando `semDesvios = true` mas o scan ainda aponta itens: status âmbar "Conforme com ressalvas"
- Quando `semDesvios = true` e scan está limpo: status verde "Conforme"

**Ressalvas salvas na documentação**
- Ao ativar "Sem desvios encontrados", snapshot dos itens pendentes é salvo em `frame.audit.ressalvas[]`
- Cada ressalva contém: `{ category, label, name, nodeId, status }`
- Incluídas na ficha canvas (seção "Ressalvas DSC") e no arquivo MD exportado (com Node ID para rastreabilidade em auditoria futura)

**Novo Componente — conformidade ocultada**
- Toggle "Novo Componente" esconde a seção inteira de Conformidade DSC
- Frames novos passarão por revisão dedicada no time DSC — não faz sentido auditar contra a lib existente
- Status do cabeçalho: "Novo Componente" (violeta), imune a chamadas de `_updateFrameAuditSubtitle`

**Label do alerta**
- "Itens para adequação" → "Itens para revisar:"

---

### Fetch de Refs — Variáveis

- `fetch-design-refs.cjs`: tenta buscar `/v1/files/{fileKey}/variables/local` por biblioteca
- Se o token tiver acesso de editor, popula `designTokens.variables[]` no skeleton
- Falha silenciosa com aviso (não quebra o build) caso o token não tenha acesso ao arquivo

---

### UX

**Contraste visual**
- Fundo do plugin: `bg-white` → `#eef2f7` (cinza-azulado suave)
- Header e rodapé: `bg-light-surface` (`#ffffff`) com borda `#dde3ec`
- Palette `light` adicionada ao `tailwind.config.cjs`: `light-bg`, `light-surface`, `light-line`

**Botão "Voltar ao topo" oculto quando minimizado**
- `toggleCollapse()` força ocultação do `btn-top` ao minimizar
- `handleScroll` não exibe o botão enquanto `isCollapsed = true`

---

### Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/plugin/audit.js` | Reestrutura `auditProperty` em dois passes |
| `src/plugin/code.js` | `getVar` + `remote`; `audit()` + `isRemote`; `isDS` para frames e tipografia; instâncias remotas → `true` |
| `src/plugin/modules/core.js` | Status "Conforme com ressalvas"; snapshot de ressalvas; conformidade oculta p/ novo componente; `btn-top` no collapse |
| `src/plugin/modules/specifications.js` | Frames no alerta; label "Itens para revisar:"; `conformance-section` com `id` |
| `src/plugin/modules/handoff.js` | `auditMD` usa `semDesvios`/`checkDone`/`ressalvas`; seção "Ressalvas DSC" na ficha canvas e no MD |
| `src/plugin/build.cjs` | `bg-light-bg`, `bg-light-surface`, `border-light-line` no body/header/footer |
| `src/plugin/styles/tailwind.config.cjs` | Palette `light` adicionada |
| `src/plugin/refs/fetch-design-refs.cjs` | Endpoint `/variables/local` |

---

## v4.1.1 — 2026-06-09

### Resumo
Correções de bugs de backend, melhorias de UX consistentes em todas as views, arquivamento de funcionalidades fora de escopo e limpeza geral do código-fonte.

---

### Correções de Backend (`code.js`)

| Bug | Causa | Correção |
|---|---|---|
| `MIN is no longer a supported value for layoutAlign` (~30 avisos) | 6 ocorrências de `layoutAlign = "MIN"` em `code.js` | Substituídas por `"INHERIT"` (valor correto na API atual do Figma) |
| `set_selection: The selection of a page can only include nodes in that page` | `figma.currentPage.selection = [node]` chamado com nó de outra página | Adicionada função `_nodeOnCurrentPage()` e guard nos handlers `scroll-node-into-view` e `focus-node` |
| `localStorage SecurityError` repetido | `localStorage.getItem/setItem` chamado em contexto `data:` URL | Todos os acessos em `messages.js` e `core.js` envolvidos em `try/catch` |

---

### "Ocultar todas as medidas" não funcionava com medidas por frame

- `_getAllMeasurements()` agora agrega `handoffData.measurements` global + medidas de todos os `handoffData.frames[]`
- `updateHideAllMeasuresButtonState` e `toggleAllMeasuresVisibility` atualizados para usar a função agregada

---

### Canvas — Geração da Ficha Técnica

- **Nome do frame sempre inclui data** — formato: `Handex | Ficha de Projeto | {Título} | {Data}`
- **Locking automático** — todos os nós gerados pelo plugin (specs, medidas, fluxos, ficha) são criados com `node.locked = true`
- **Chip de status com semântica de cor:**
  - `rascunho` → cinza
  - `em-revisao` → amarelo
  - `pronto-para-dev` → azul
  - `finalizado` → verde
- **Tokens escaneados** — ficha e exportação MD/HTML agora listam os nomes reais dos tokens por categoria (até 10 + contagem de excedente), em vez de exibir apenas "sim/não"
- **Tags de categoria no HTML** — estilo `cursor:default; pointer-events:none` para não parecerem botões clicáveis
- **Specs do canvas** agregam specs de todos os frames (`frames[].components`), não apenas `step2.specs`

---

### Exceções — Injetar observação no frame de spec

- `exc.obs` agora exibido na UI do plugin (texto itálico abaixo do título da exceção)
- Novo checkbox **"Injetar observação no frame de especificação"** na modal de exceção
  - Visível apenas quando obs está preenchida e a exceção tem `nodeId` de spec
  - Ao confirmar, envia `inject-obs-to-spec` que cria um frame `[Obs]` no canvas abaixo do frame de spec correspondente

---

### UX — Espaçamento e Tipografia

- **Header das views** — padding ajustado para `pt-0 pb-3`: sem espaço acima do título, 12 px de respiro abaixo
- **Conteúdo das views** — top padding reduzido de `p-4` para `pt-1 px-4 pb-4`
- **Fontes padronizadas** em todas as views:
  - Views simples: `font-bold text-[18px]`
  - Views com subtítulo (Handoff, Conformidade DSC, Laboratório): `font-bold text-[16px]`
- **"CONFIGURAÇÃO"** — label desnecessária removida da view Informações do Projeto
- **Jornada / Feature** — descrição movida para linha separada abaixo do checkbox (era inline à direita, cortava o texto)
- **Hint `?` de Especificações** — agora abre o guia completo diretamente (`openHelp()`), sem popover intermediário
- **Hint de layers bloqueadas** (Como Usar) — movido para o final do card; descrição atualizada: "Para remover ou recriar um item, utilize os botões de exclusão dentro do próprio plugin."

---

### Performance

- `snapshot-load` e `scan-cache-load` removidos do handler `init-plugin` — carregamento diferido elimina lentidão na abertura do plugin

---

### Arquivamento de funcionalidades fora de escopo

Movidos para `src/plugin/_unused/` (código preservado, fora do bundle):

| Arquivo | Funcionalidade |
|---|---|
| `views/lab.html` | Laboratório de Design |
| `views/audit.html` | Conformidade DSC |
| `modules/lab.js` | Lógica do Laboratório |
| `modules/audit.js` | Lógica de Auditoria (UI) |

- Referências removidas de `build.cjs` e `modules/core.js`
- Bundle reduzido de ~1471 KB para ~1442 KB (−29 KB)

---

### Arquivos Modificados

| Arquivo | Tipo de mudança |
|---|---|
| `src/plugin/code.js` | Fix `layoutAlign "MIN"`, guard cross-page selection, `_nodeOnCurrentPage()` |
| `src/plugin/modules/core.js` | Fix `localStorage`, remove `navigateToAudit` |
| `src/plugin/modules/messages.js` | Fix `localStorage` em `applyFigmaTheme` |
| `src/plugin/modules/measurement.js` | `_getAllMeasurements()` agrega medidas por frame |
| `src/plugin/modules/specifications.js` | Exibe `exc.obs`, checkbox injetar obs |
| `src/plugin/modules/handoff.js` | Tokens com nomes reais, tags não-clicáveis |
| `src/plugin/build.cjs` | Remove lab/audit do bundle |
| `src/plugin/views/specifications.html` | Hint `?` abre guia direto |
| `src/plugin/views/dados-projeto.html` | Remove label "Configuração", descrição jornada/feature em linha separada |
| `src/plugin/views/guide.html` | Hint de layers no final, descrição atualizada |
| `src/plugin/views/*.html` (todas) | Padding de header e fontes padronizados |
| `src/plugin/_unused/` | Lab e Audit arquivados |

---

## v4.0.0-beta — 2026-06-02

### Resumo
Refatoração arquitetural completa: eliminação do wizard linear de 5 etapas e introdução de ferramentas independentes acessíveis diretamente pela home. Novo schema de dados (`_schemaVersion: 2`), novos campos de contexto e melhorias de acessibilidade em todo o plugin.

---

### Nova Arquitetura — Home com cards independentes

- **Antes:** fluxo linear obrigatório de 5 etapas (wizard)
- **Agora:** home com 6 cards de ferramentas independentes
  - Como usar o plugin
  - Informações do Projeto
  - Escanear Tokens
  - Anotar Specs
  - Anotar Medidas
  - Fluxos de Tela
- Botão "Gerar Ficha de Handoff" fixo na home, sempre acessível
- Importar JSON mantido como ação utilitária no rodapé

---

### Novas Views

| View | Descrição |
|---|---|
| `view-frames` | Hub por Frame — scan de tokens, medidas, specs e conformidade por frame |
| `view-flows` | Fluxos de navegação extraídos como view standalone |
| `view-dados-projeto` | Informações do projeto acessíveis a qualquer momento |
| `view-handoff-summary` | Resumo e exportação do handoff |

---

### Novos Campos — Jornada e Feature

- Campos `jornada` e `feature` adicionados ao schema (`handoffData.step1`)
- Propagados para **todos** os formatos de exportação:
  - Ficha no canvas (Figma)
  - Exportação Markdown (.md)
  - Exportação JSON
  - Exportação HTML interativa

---

### Correções de Bug

| Bug | Causa | Correção |
|---|---|---|
| Scan de tokens, medidas e specs parou de funcionar | `_lucideTimer` em TDZ — declaração `let` após chamada síncrona em `core.js` | Movido `_lucideTimer` + `_refreshIcons` para o topo do arquivo |
| Cards de tipo de fluxo não respondiam ao clique | `selectFlowType()` usava classes Tailwind CDN não compiladas (`bg-blue-50/30`) | Reescrito com `el.style.*` inline |
| `confirmDecisionConnection is not defined` | Função referenciada no HTML do modal mas nunca definida | Adicionada em `specifications.js` |
| Duas barras de rolagem na home | Wrapper externo e `view-home` ambos com `overflow-y-auto` | Wrapper alterado para `overflow-hidden` |

---

### Acessibilidade (WCAG 2.1 AA)

- `text-slate-400` (#94a3b8 — ratio 2.85:1 ❌) substituído por `text-slate-500` (#64748b — ratio 5.91:1 ✅) em todos os 205 pontos dos arquivos fonte
- `dark-muted` ajustado de `#94a3b8` para `#b4c6d8` — passa de ~4.2:1 para ~6.5:1 sobre `dark-surface`

---

### Performance

- **Onboarding removido** — modal de 3 slides com `lucide.createIcons()` disparado no `window.load` causava lentidão perceptível na abertura do plugin
- `_refreshIcons` com debounce de 30ms — evita múltiplas chamadas a `lucide.createIcons()` durante renderizações em sequência

---

### UI / UX

- Headers de todas as views de ferramentas compactados (`pt-5/6 pb-4` → `pt-3 pb-3`)
- `mb-6` e `mb-4` extras removidos de measurement e specifications
- Home ajustada para caber sem scroll na janela padrão do Figma (~500px)
- Laboratório de Design removido da home
- Subtítulo da home atualizado para comunicar o propósito do plugin

---

### Schema v2

```js
handoffData = {
  _schemaVersion: 2,
  step1: {
    titulo: '',
    versao: 'v1.0',
    objetivo: '',
    status: 'rascunho',
    jornada: '',       // NOVO
    feature: '',       // NOVO
    equipe: []
  },
  step2: { ... },
  frames: [],
  createdFlows: [],
  nextFlowNumber: 1
}
```

Estados salvos com schema anterior (`_schemaVersion` ausente) são descartados automaticamente no init.

---

### Arquivos Modificados

| Arquivo | Tipo de mudança |
|---|---|
| `src/plugin/modules/core.js` | Fix TDZ, schema v2, campos jornada/feature, restoreUIFromState |
| `src/plugin/modules/handoff.js` | collectHandoffData com jornada/feature, HTML interativo atualizado |
| `src/plugin/modules/specifications.js` | selectFlowType reescrito, confirmDecisionConnection adicionado |
| `src/plugin/modules/messages.js` | Detecção de schema antigo |
| `src/plugin/modules/measurement.js` | Ajustes de UI |
| `src/plugin/modules/audit.js` | Ajustes de contraste |
| `src/plugin/code.js` | Ficha canvas com jornada/feature |
| `src/plugin/build.cjs` | dark-muted corrigido, wrapper overflow-hidden |
| `src/plugin/views/home.html` | Nova grade, nomes de ferramentas, textos revisados |
| `src/plugin/views/handoff.html` | Hub por Frame |
| `src/plugin/views/flows.html` | Nova view standalone |
| `src/plugin/views/dados-projeto.html` | Campos jornada/feature adicionados |
| `src/plugin/views/handoff-summary.html` | Linhas jornada/feature condicionais |
| `src/plugin/views/modals.html` | Onboarding removido |
| `src/plugin/views/measurement.html` | Header compactado |
| `src/plugin/views/specifications.html` | Header compactado |
| `src/plugin/views/audit.html` | Header compactado |

---

*Gerado em 2026-06-02*
