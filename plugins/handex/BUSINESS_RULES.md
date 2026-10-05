# HANDEX — Regras de Negócio, Travas, Disclaimers e Jornadas

> Documento de referência técnica e funcional do plugin Handex v4.1+
> Última atualização: 2026-06-11 (v4.1.6)

---

## Sumário

1. [Estrutura de Dados](#1-estrutura-de-dados)
2. [Regras de Negócio por Funcionalidade](#2-regras-de-negócio-por-funcionalidade)
3. [Travas e Condições de Bloqueio](#3-travas-e-condições-de-bloqueio)
4. [Comportamentos Automáticos](#4-comportamentos-automáticos)
5. [Disclaimers e Mensagens ao Usuário](#5-disclaimers-e-mensagens-ao-usuário)
6. [Jornadas de Usuário](#6-jornadas-de-usuário)
7. [Persistência e Armazenamento](#7-persistência-e-armazenamento)
8. [Integrações com o Backend Figma](#8-integrações-com-o-backend-figma)
9. [Limites Técnicos](#9-limites-técnicos)
10. [Glossário](#10-glossário)

---

## 1. Estrutura de Dados

### Schema v2 (`handoffData`)

```js
{
  _schemaVersion: 2,
  step1: {
    titulo: '',           // obrigatório para gerar ficha
    versao: 'v1.0',       // obrigatório, default 'v1.0'
    objetivo: '',         // obrigatório para gerar ficha
    status: 'rascunho',   // rascunho | em-revisao | pronto-para-dev | finalizado
    jornada: '',          // opcional, auto-fill via frame selecionado
    feature: '',          // opcional, auto-fill via frame selecionado
    equipe: []            // min 1 membro com nome preenchido para gerar ficha; email é opcional, mas validado por formato se preenchido
  },
  step2: {
    briefingEnabled: false,
    briefingQuestions: [],  // [{ id, categoria, pergunta, resposta }]
    regras: [],             // [{ id, titulo, link, notas }]
    anexos: [],
    selectedLibSlugs: [],
    auditReferences: []
  },
  frames: [],              // hub de frames documentados (ver estrutura abaixo)
  createdFlows: [],        // fluxos de tela criados
  nextFlowNumber: 1,
  currentUser: null,
  _fichaGenerated: false,  // controla modal de versionamento
  specs: [],               // specs globais (fora de frame)
  docs: {
    proto:    { link: '' },
    a11y:     { link: '' },
    research: { link: '' }
  }
}
```

### Estrutura de cada Frame

```js
{
  id: '<timestamp>',
  figmaId: '<nodeId>',
  nome: 'Nome do Frame',
  isNewComponent: false,
  newComponentObservations: '',
  specs: null,                    // resultado do scan de tokens
  audit: {
    checkDone: false,       // Check Designs realizado
    semDesvios: false,      // designer declara conformidade
    observacoes: '',        // texto livre de desvios/justificativa
    ressalvas: []           // snapshot dos itens não conformes no momento da declaração
                            // [{ category, label, name, nodeId, status: 'error'|'warning' }]
  },
  measurements: [],
  nextMeasurementNumber: 1,
  createdSpecs: [],
  excecoes: [],
  specGroupNames: {},             // { letra: 'nome do grupo' }
  specGroupVisible: {},           // { letra: boolean }
  measurementsGroupVisible: true
}
```

### Regra de Migração de Schema

- Se o estado salvo não contém `_schemaVersion`, ele é descartado automaticamente no `init-plugin`
- Não há migração parcial — descarte total com reinício limpo
- Razão: evitar estados híbridos entre schema v1 (wizard) e v2 (ferramentas independentes)

---

## 2. Regras de Negócio por Funcionalidade

### 2.1 Informações do Projeto

| Campo | Obrigatório | Validação | Comportamento |
|---|---|---|---|
| Título | Sim | Min 1 caractere | Habilita "Gerar Ficha" |
| Versão | Sim | Padrão `v{major}.{minor}` | Default `v1.0` |
| Objetivo | Sim | Min 1 caractere | Habilita "Gerar Ficha" |
| Status | Não | Enum fixo | Default `rascunho` |
| Jornada | Não | Texto livre | Auto-fill do frame selecionado |
| Feature | Não | Texto livre | Auto-fill do frame selecionado |
| Equipe | Sim (1 nome) | Nome não vazio | Min 1 membro com nome preenchido |

**Papéis de equipe disponíveis:** Designer · DEV · PO · QA · Outro (papel não é obrigatório para nenhum membro específico)

**Validação de email (opcional):** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — aplicada apenas quando o campo é preenchido, não bloqueia avanço/geração de ficha se vazio.
- Feedback visual: borda vermelha se formato inválido, verde temporária se válido
- Validação dispara ao blur do campo email

**Auto-fill de título:** ao abrir o plugin, tenta preencher `s1-titulo` com `figma.root.name` se o campo estiver vazio.

**Auto-fill de Jornada / Feature:** quando o checkbox é marcado, envia `get-context-name` ao backend, que retorna o nome do frame selecionado no canvas no momento do clique.

---

### 2.2 Contexto de Negócio

Toda a seção é opcional. Nenhum campo bloqueia avanço ou geração de ficha.

**Briefing Estratégico**
- Ativado por toggle
- Perguntas pré-categorizadas por: Contexto · Escopo · Stakeholders · UX/Design · Pesquisa
- Cada pergunta tem: categoria, texto e campo de resposta (textarea)
- Ilimitado número de perguntas; removíveis individualmente

**Regras de Negócio**
- Campos: título (obrigatório por item) · link (URL, validado ao blur) · notas (textarea)
- Ilimitado número de regras; removíveis individualmente

**Documentação Externa**
- Protótipo navegável · Acessibilidade · Pesquisa de UX
- Todos opcionais; validação de URL ao blur

---

### 2.3 Escanear Tokens (Hub de Frames)

**Tipos de nó aceitos para registro:**
`FRAME` · `COMPONENT` · `INSTANCE` · `SECTION` · `GROUP`

**Fluxo de registro de frame:**
1. Usuário seleciona frame no canvas do Figma
2. Clica em "+ Escanear Frame" no plugin
3. Plugin envia `get-selection-info` ao backend
4. Backend retorna `{ nodeId, name }` do nó selecionado
5. `addFrame(figmaId, nome)` cria entrada em `handoffData.frames[]`

**Escaneamento de tokens:**
- Categorias selecionáveis: Componentes · Ícones · Tipografia · Frames e Layouts · Vetores
- Envia `scan-frame` com `{ frameId, nodeId, categories, selectedLibSlugs }`
- Resultado organizado em accordion por tipo; exibe contagem por categoria
- Se > 10 itens em uma seção: exibe campo de busca

**Filtragem automática de resultados:**

| Tipo de nó | Comportamento |
|---|---|
| `VECTOR`, `BOOLEAN_OPERATION`, `ELLIPSE`, `RECTANGLE` | Removidos sempre — shapes primitivos não representam conformidade DS |
| `FRAME` / `GROUP` com filhos `INSTANCE` ou `COMPONENT` | Removidos — são contêineres de layout; a conformidade vive nos filhos |
| `FRAME` / `GROUP` sem nenhum filho DS (100% custom) | Mantidos como alerta — indicam construção fora do DS |

Razão da regra: a conformidade não se aplica ao contêiner, mas ao que está dentro dele. Exibir frames de layout como "não conformes" induz o dev a erro sobre a natureza do problema.

**Ícone de localização nos cards escaneados:**
- Cada card de elemento exibe ícone `locate` no header (visível no hover)
- O card inteiro é clicável e chama `focusNode(item.nodeId)` para navegar ao nó no canvas

**Novo Componente:**
- Toggle por frame
- Se marcado: exibe campo de observações (`newComponentObservations`), muda subtítulo para "Novo Componente" (azul da marca) e **oculta a seção de Conformidade DSC**
- Justificativa: componente inédito passará por revisão dedicada no time DSC — auditoria contra a lib existente não se aplica
- Frames marcados como "Novo Componente" são destacados na ficha e nos documentos exportados

**Conformidade DSC** (visível apenas quando `isNewComponent = false`):
- `checkDone` — declaração de que o Check Designs foi executado
- Se `checkDone = true`:
  - Toggle "Sem desvios encontrados" (`semDesvios`)
  - Ao ativar `semDesvios`: snapshot dos itens não conformes salvo em `audit.ressalvas[]`
  - Textarea de observações visível quando `semDesvios = false` ou há itens no scan

**Status do frame (subtítulo do card)** — fonte única: `_getFrameStatusView` (`core.js`), usada no primeiro desenho do card e em toda atualização. A legenda é a modal "Status do frame" (`#frame-status-modal`) e precisa ficar sincronizada com esta tabela. "Item fora do padrão" = item de componentes, ícones, tipografia ou vetores com `isDS === false` no scan; o âmbar (`isDS === 'warning'`) não entra na conta.

Avaliação em ordem, a primeira condição verdadeira vale:

| # | Condição | Status | Cor (token `st-*`) |
|---|---|---|---|
| 1 | `isNewComponent = true` | Novo Componente | Azul da marca (`info`, #005ca9) |
| 2 | `checkDone = false` | Pendente | Cinza (`neutral`, #64747a) |
| 3 | há item fora do padrão **e** `audit.observacoes` preenchida | Desvio justificado | Âmbar (`warn`, #654c02) |
| 4 | há item fora do padrão, sem observações | Não Conforme | Vermelho (`err`, #b22c2c) |
| 5 | `semDesvios = true` | Conforme | Verde (`ok`, #127527) |
| 6 | demais casos (`semDesvios = false`) | Não Conforme | Vermelho |

Cores: valores reais da lib "DSC | Fundamentos Visuais" (`color/content/*`), no degrau que passa 4,5:1 em texto de 11px; variantes `-dark` para o tema escuro. Antes de 2026-10-01 o card usava classes padrão do Tailwind (violet, green-600, red-500, amber-500), com contraste abaixo do mínimo.

**Marcadores dos itens escaneados** (lista "Tokens Escaneados", resultado automático por item — não são o status do frame, mas alimentam o item 3 a 5 acima):

| Marcador | Origem (`isDS`) | Efeito no status do frame |
|---|---|---|
| Em conformidade (verde) | `true` | nenhum |
| Necessita revisão (âmbar; inclui "Componente personalizado" e "Personalizado — fora do padrão da lib") | `'warning'` | nenhum — só alerta |
| Fora do padrão (vermelho) | `false` | impede Conforme; com justificativa vira Desvio justificado |
| Lib legada, precisa migrar (cinza) | `item.legacyLib` | nenhum — só informa |

Dica de leitura: os nomes parecidos não são o mesmo conceito. "Em conformidade" e "Necessita revisão" descrevem um **item**; "Conforme" e "Desvio justificado" descrevem o **frame**.

> **Divergência conhecida (2026-10-01):** as exportações — Markdown (`handoff.js`, `_auditStatus`) e prévia HTML do resumo (`fConformStatus`) — ainda usam o modelo anterior (Conforme / Conforme com ressalvas / Não Conforme, calculado por `audit.ressalvas`) e podem divergir do card para o mesmo frame. Pendente de decisão de produto sobre alinhar as duas saídas ao status acima.

**Ressalvas:**
- Ao marcar `semDesvios = true`, o plugin salva um snapshot dos itens `isDS === false/warning` em `audit.ressalvas[]`
- As ressalvas são incluídas na ficha canvas e no MD exportado com Node ID para rastreabilidade em auditoria futura
- Ao desmarcar `semDesvios`, `ressalvas` é limpo

**Detecção de conformidade (scan):**
- Conformidade é decidida **só pela chave** (`variableKey`/`styleKey`/`componentKey`) contra o skeleton das libs DSC — nunca pela flag `remote`. `remote = true` significa apenas "vem de alguma biblioteca publicada", não "é do DSC" (v6.8.3; atalho `remote` fechado na v6.32.0 e na Fase 1, 2026-09-30)
- Token/estilo remoto **sem** chave no skeleton → `isDS: "warning"` (`matchedBy: "remote-unverified"`, lib publicada fora do DSC cadastrado); sem skeleton disponível → `isDS: "warning"` (`matchedBy: "unverified-no-skeleton"`), nunca conforme
- Componente: vínculo = `componentKey` próprio no skeleton **ou** ancestral com chave no skeleton (`matchedBy: "ancestor-key"`, Fase 3); sem vínculo → `"warning"` + "Componente Personalizado", nunca vermelho
- Tipografia: **sem atalho por família de fonte** (Fase 4, 2026-09-30) — a regex `/caixa/i` que aprovava estilo de texto fora do skeleton foi removida (a fonte vigente do DSC é Roboto); conformidade só pela chave do estilo/variável no skeleton, igual às demais propriedades
- **Espessura de borda (Border Width) sem whitelist** (Fase 4): `1px`/`0px` deixaram de ser sempre conformes (`matchedBy: "value"`); passam pela checagem normal por chave. O DSC tem tokens de espessura em 3 libs (Fundamentos Visuais `border/width/none|hairline|thin|thick|heavy|strong`; Super DSC | Web e DSC | Super App `dsc/border/width/*`), então borda sem token é tratada como qualquer outra propriedade sem token
- **Lib legada — precisa migrar** (Fase 4, decisão 2026-09-30): componente cujo vínculo (próprio ou por ancestral) vem de lib de tier `legacy` (Fundamentos Visuais, Web Angular & React) continua **conforme**, mas recebe `legacyLib: true` e o aviso "LIB LEGADA — PRECISA MIGRAR" (card do scan, Ficha no canvas, Ficha HTML, Markdown e `_aiContext.componentesDSC[].libLegada`). Não altera `isDS` nem a agregação. Re-escanear frames existentes: bordas de 1px sem token e textos em CAIXA Std sem token podem mudar de cor. **Aviso DESLIGADO por flag em 2026-10-01** (`LEGACY_LIB_MIGRATION_HINT_ENABLED = false`, topo de `code.js`): a Super DSC | Web ainda não foi adotada nos projetos (só a Super App existe de fato), então o aviso não faz sentido agora; nenhum dos pontos acima o exibe ou exporta. Os dados (`legacyLib`, `matchedTier`, `libLegada`) seguem calculados e gravados; a exibição consulta a flag (enviada à UI no `init-plugin` como `legacyLibHintEnabled`, lida em `window._handexLegacyLibHint`), então valores salvos em scans anteriores não reaparecem. A conformidade não muda. Para religar: trocar a flag para `true` e rodar `bundle:ui` + `bundle:code`.
- **Personalização de componente DSC** (Fase 5b, decisão 2026-09-30): instância com vínculo próprio na lib é comparada ao componente principal (variante atual, propriedades de componente aplicadas = estado do "Reset" do Figma). Diferenças em token, tamanho/espaçamento (gap, padding, largura/altura fixas, raio, borda) ou subcomponente trocado manualmente viram âmbar ("Personalizado — fora do padrão da lib") com a lista "campo: valor atual (padrão da lib: valor)". Texto, visibilidade e valores de propriedades de componente não contam. Desvio de token (vermelho) tem precedência. Se o padrão da lib não puder ser lido, a personalização fica "não avaliada" (nunca verde nem âmbar). Aparece no scan, na Ficha HTML, no Markdown e no contexto para IA; Especificações/Rápidas ainda não.
- Nome de camada **nunca** decide vínculo (a convenção `[dsc]` foi removida na Fase 3, 2026-09-30)
- Nó dentro de uma instância/componente cuja chave está no skeleton é **parte dele** (herança por ancestral, `matchedBy: "ancestor-key"`, `matchedIn` = nome real da lib do ancestral): tratado como vinculado; frames internos a ele não entram como item; fica de fora do `componentesDSC` do `_aiContext`
- Sem chave própria nem ancestral com chave → "componente personalizado" (âmbar), nunca vermelho
- Chave da instância presente em `componentKeys[]` do skeleton → `isDS: true` (match exato)
- W/H Sizing e variantes/propriedades de instância → `isDS: null` + `matchedBy: "not-evaluated"` (não checados contra a lib até a Fase 5): mostram o valor com traço neutro, sem selo verde, e não entram na agregação de conformidade do componente/frame

#### Casamento spec ↔ elemento escaneado (Fase A do card de elemento único, 2026-10-02)

Base para a Ficha por tela com um card por elemento (`docs/plano-card-de-elemento-unico.md`). Esta fase só adiciona dados e a função de casamento; a Ficha não muda.

- **`nodeIds`:** cada item do scan guarda `nodeIds: string[]` com os ids de TODOS os nós que a dedup agrupou sob o mesmo `_dedupKey` (o primeiro continua em `nodeId`), sem repetição, limite de 50. Preservado no re-scan junto de `isMarkedCustom`/`uiDepth`/`customDecided` (o item anterior é achado por `nodeId` ou por qualquer id de `nodeIds`). Item antigo sem `nodeIds` equivale a `[nodeId]`; só ganha a lista ao reescanear o frame.
- **Mensagem `resolve-spec-owners`** (UI → backend): `{ frameId?, frameRootId, specs: [{ id, targetNodeId }], items: [{ key, nodeId, nodeIds }] }`. Resposta `spec-owners-resolved`: `{ frameId, results: [{ specId, itemKey|null, via: 'exact'|'ancestor'|'none' }] }`.
- **Regra:** (a) `targetNodeId` em `nodeIds` de um item → `exact`; (b) senão sobe por `parent` até o primeiro nó cujo id esteja em `nodeIds` de algum item (o item MAIS PRÓXIMO) → `ancestor`; a subida para em `frameRootId` ou na página; (c) sem casamento → `none`.
- **Em dúvida, não anexar:** falso positivo é pior que ausência. Nenhuma spec some: spec com `none` (ou nó removido) continua existindo sozinha, sem dono.
- **Custo:** sem `findAll`; só `getNodeByIdAsync` + `parent`, memoizado por nó visitado, em lotes de 12, teto de 400 specs por chamada. Falha em uma spec vira `none` e nunca derruba a resposta.
- `request-spec-properties` com `targetNodeId` funciona com o `nodeId` de um item (fluxo existente, inalterado).
- **Pré-criações automáticas (revisão de 2026-10-02):** o scan não cria botões de spec no card do item. Itens fora do padrão (`isDS === false`), em revisão (`'warning'`), personalizados (`isCustomComponent`) ou com personalização (`customizations`) que ainda não têm spec casada aparecem em **Anotar Especificações > "Vindos do scan"**, derivados a cada render (nada novo é persistido, exceto `specDismissed`). O designer **Especifica** (abre o fluxo normal da Especificação com o elemento fixado) ou **Dispensa** ("Não precisa de spec", reversível). **Nada entra na Ficha, no Markdown, na Ficha HTML nem nos contadores sem o designer concluir a spec**: o julgamento do que merece spec é dele.

---

### 2.4 Inserir Anotações e Anotar Especificações

O Handex tem **duas ferramentas de anotação** na home, com propósitos diferentes. Nomenclatura vigente (decisão do Augusto em 2026-10-05): **"Anotações"** (card "Inserir Anotações"; antes "Specs Rápidas", e antes disso "Spec Express") e **"Especificações"** (card "Anotar Especificações"; antes "Specs Detalhadas"/"Anotar Specs"). **Anotações vêm sempre antes de Especificações** na home, no "Como usar o plugin", no onboarding e na documentação: é o passo mais leve, e **uma anotação pode virar especificação** (2.4.1). "Anotações" do Handex não é o recurso nativo de Annotations do Dev Mode do Figma.

**Princípio (decisão de produto, 2026-09-30):** o designer precisa conseguir distinguir quando usar cada uma — por isso o critério aparece dentro do plugin (cards da home, onboarding, "Como usar o plugin" e empty-state).
- **Anotações** = o **essencial** para o dev que **não tem acesso ao DevMode do Figma** olhar e já conseguir executar o trabalho: valores reais do elemento (cor, espaçamento, tipografia, dimensões, raio, efeitos, componente), com o token e a biblioteca quando existem, mais uma observação opcional por elemento. Sem categoria nem exceção; não entra na Ficha; é consulta pontual.
- **Especificações** = o **aprofundamento**. Superconjunto da anotação: traz os mesmos valores (token + valor) e mais categoria, nota, link, cenários de exceção e posicionamento escolhido pelo designer, e entra na Ficha de Handoff como documentação formal.

**Posicionamento dos cards de Anotações (revisto em 2026-10-05):** cada card nasce numa coluna ao lado do frame, na altura do próprio elemento; colisões empurram o card de baixo, considerando também lotes anteriores do mesmo frame (detalhes em 2.4.1).

**Qual usar? Critério prático:**

| Pergunta | Se a resposta é SIM |
|---|---|
| A informação precisa chegar ao dev dentro da Ficha de Handoff / Markdown / JSON exportado? | **Especificações** |
| Existe uma decisão do designer a registrar (comportamento, regra de negócio, dado da API, exceção)? | **Especificações** |
| O dev só precisa consultar valores de propriedade de um elemento (cor, tamanho, espaçamento, tipografia) e não tem acesso ao DevMode do Figma? | **Anotações** |
| É consulta pontual, de rascunho, sem compromisso de virar documentação formal? | **Anotações** |

Regra de bolso: **Anotação** responde "quais são os valores deste elemento?"; **Especificação** responde "o que o dev precisa saber e implementar sobre este elemento?". Um elemento que começou como anotação e passou a merecer documentação formal pode ser convertido em especificação (ver 2.4.1).

**Comparativo:**

| Aspecto | Inserir Anotações | Anotar Especificações |
|---|---|---|
| Natureza | Essencial para o dev sem DevMode: consulta pontual de valores, rascunho | Spec formal e aprofundada, artefato entregue ao dev |
| Persistência | Lista da UI efêmera (reseta ao fechar o plugin); propriedades gravadas no próprio card do canvas (pluginData), recuperadas ao reabrir | `handoffData` — sobrevive a tudo, entra em export/import JSON |
| Conteúdo | Valores reais do elemento, com o token e a biblioteca de origem quando existem — sem categoria, nota nem exceção | Categoria (Informação Extra / Comportamento / Regra de Negócio / Dados da API), nota livre, link opcional, propriedades (token + valor, como na Rápida), cenários de exceção |
| Conformidade DSC | Não avaliada — achados brutos, sem veredito de conformidade | Não avaliada pela spec em si (vive no scan de Escanear Tokens) |
| Captura | Em lote por Shift+clique; o plugin colapsa numa barrinha durante a seleção | Fluxo multi-etapa: dados básicos → propriedades → posicionamento manual no canvas (fantasma arrastável) → exceção |
| Visual no canvas | Cards numa coluna ao lado do frame, cada um na altura do seu elemento, ligados por linha guia cinza semi-transparente | Azul de marca, GROUP + contour, letra/tag sequencial por frame |
| Ficha de Handoff e Markdown | **Não entra** (decisão de produto) — nem nos contadores do handoff formal | **Entra** |
| `_aiContext` (contexto para IA externa) | Entra num bloco separado (`especificacoesRapidas`), marcado como achados brutos sem conformidade DSC avaliada | Entra como spec formal |
| Conversão | Botão "Converter em Especificação" no item da lista: o card da anotação é substituído pela especificação formal, e a observação vira a nota | — |

#### 2.4.1 Inserir Anotações — regras

Módulo isolado (`modules/quick-spec.js`, view `view-quick-spec`); nunca chama nem é chamado pela ferramenta de Especificações nem pelo scan de tokens.

**Fluxo:** Escanear → modal de filtro (categorias de propriedade a buscar, lista fixa) → plugin colapsa numa barra com contador + Cancelar/Concluir → designer marca elementos no canvas com **Shift+clique** (só o que foi marcado com Shift entra, evitando capturar cliques de passagem) → Concluir → propriedades são lidas e viram uma lista plana de accordions, 1 por elemento, com tag sequencial (A, B, C…) por sessão.

**Regras:**
- Lê **só o elemento marcado** com Shift+clique — nunca a subárvore (filhos e descendentes não entram; para consultar um filho, marque-o também).
- Sem conformidade DSC avaliada, sem categoria, sem nota, sem exceção. O que aparece são valores brutos (e o token/biblioteca de origem quando existir) — não há veredito "conforme/fora do padrão".
- A lista da UI é efêmera: não vai para `handoffData`, `localStorage` nem para export/import JSON. Cards já inseridos no canvas guardam as propriedades em pluginData e são recuperados ao reabrir o plugin/entrar na tela (`quick-spec-list-canvas-cards`). Cards legados (criados antes dessa gravação) voltam sem propriedades ("não disponível").
- "Inserir no canvas" cria 1 card por elemento numa coluna ao lado do frame, cada card na altura do seu elemento (centro do card no centro do elemento, para a linha sair reta); se dois colidem, o de baixo desce o necessário, contando também cards de lotes anteriores do mesmo frame. Sem Auto Layout: o lote fica num frame só para agrupar e cada card pode ser movido livremente; se uma observação faz um card crescer, os de baixo descem e a linha deles é refeita. A modal de grade (colunas × linhas) foi removida em 2026-10-05. As linhas do lote nunca se cruzam: ordenadas pela altura do elemento, as que precisam descer dobram em faixas verticais escalonadas (a do elemento mais alto dobra mais perto dos cards, cada uma abaixo um passo mais à esquerda). O card é ligado ao elemento de origem por linha guia cinza semi-transparente. A linha nasce na borda do contorno tracejado do elemento, e a tag (A, B, C…) fica nesse ponto de saída, em círculo cinza sólido (`#64747a`, lib) com letra branca, no lugar do antigo dot de início (2026-10-05).
- "Ocultar" alterna a visibilidade na lista e, se o card já está no canvas, também do card e da linha guia.
- Excluir individualmente fecha o buraco na sequência de tags, só entre itens ainda sem card no canvas; tags de itens já inseridos nunca são renumeradas.
- **Não entra** na Ficha de Handoff, no Markdown exportado, nem nos contadores da home/Resumo. Não tem badge de check no card da home.
- Entra no `_aiContext` num bloco próprio (`especificacoesRapidas`, só itens não ocultos), rotulado como achados brutos sem conformidade DSC avaliada.
- "Converter em Especificação" abre o fluxo normal de Especificações para o elemento; ao concluir, o card da anotação é substituído pela spec formal.
- **Observação (2026-10-01):** cada elemento pode ter uma observação livre (texto curto, até 280 caracteres). Aparece no fim do card da anotação no canvas (bloco "Observação", cinza neutro), é gravada no card (`handexQuickSpecNote`), recuperada ao reabrir o plugin e pode ser editada depois de inserida (`quick-spec-update-note`, sem recriar o card). Não vai para a Ficha enquanto a spec for Rápida.
- **Conversão (2026-10-01):** a especificação continua relendo as propriedades do elemento (sem duplicar dado); a **nota da especificação passa a ser a observação da Rápida** (antes era preenchida com as propriedades). O alvo da leitura é o elemento fixado na conversão (`targetNodeId` em `request-spec-properties`), não a seleção atual do canvas; sem alvo válido, cai na seleção.
- "Limpar Dados"/limpar canvas tem opção própria para os cards de Anotações.

---

#### 2.4.2 Anotar Especificações — estrutura e regras

**Estrutura de uma spec:**
```js
{
  id: '<figmaNodeId>',
  targetNodeId: '',   // ID Figma do elemento anotado (para link NODE na ficha e reimportação)
  name: '',           // obrigatório (editável inline)
  letter: 'A',        // 1-2 chars, uppercase, obrigatório
  color: '#005ca9',   // hex — cor semântica da categoria
  type: '',           // campo primário da categoria (alias de categoryLabel); usado na ficha como chip
  category: '',       // slug interno da categoria (ex: 'comportamento', 'layout')
  categoryLabel: '',  // label legível; fallback quando type estiver ausente
  note: '',
  link: '',
  guideSide: 'right', // right | left | top | bottom
  properties: [],     // [{ label, token, value }]
  obs: '',
  excecoes: [],
  visible: true
}
```

**Validações do formulário:**
- Tag (letter): formato `[A-Z]\d*(\.\d+)*` (ex: A, B, A1, A2, A1.1, A1.2), máx 8 caracteres, obrigatório, convertido para uppercase
- Categoria: pode ser "Sem categoria"
- Link: opcional; validado como URL ao blur
- Propriedades: seleção múltipla via modal `spec-properties-modal`
- Linha guia: o lado de saída é escolhido pelas caixas do elemento e do card, não só pelos centros. Vale o lado em que o card está totalmente separado do elemento; em diagonal, o de maior folga. Um lado pedido (ex.: "direita" padrão) só é mantido se o card estiver mesmo daquele lado, senão a linha cruzaria o card (2026-10-05).

**Categorias padrão de spec:**

| Valor | Label | Cor |
|---|---|---|
| `info` | Informação extra | slate |
| `comportamento` | Comportamento | pink |
| `regra` | Regra de Negócio | blue |
| `api` | Dados da API | lime |
| `layout` | Layout | indigo |
| `interacao` | Interação | emerald |
| `acessibilidade` | Acessibilidade | purple |
| `componente` | Componente | rose |
| `tipografia` | Tipografia | yellow |
| `cor` | Cor | teal |
| `conteudo` | Conteúdo | cyan |

**Categorias personalizadas:**
- Armazenadas em `localStorage['handex-ann-categories-v2']`
- Criáveis, renomeáveis e removíveis pelo usuário
- Se localStorage bloqueado (data: URL), as categorias padrão são carregadas sem persistência

**Agrupamento por frame:**
- Specs são agrupadas por letra (A, B, C…) com conectores coloridos
- Nome do grupo editável por letra
- Visibilidade togglável por spec e por grupo

### 2.5 Anotar Medidas

**Tipos de medida disponíveis:**

| Tipo | Descrição |
|---|---|
| `wh` | Altura e Largura (Width / Height) |
| `outer` | Espaçamento Externo (Margin) |
| `inner` | Padding Interno |
| `spacing` | Padding e Gaps |

**Regras:**
- Pelo menos 1 tipo deve ser selecionado para executar
- Numeração sequencial por frame (`frame.nextMeasurementNumber`)
- Opção "Armazenar no frame pai" (`storeInParent`) — disponível mas oculto por padrão
- Resultado retornado como array de `{ name, number, nodeId, details[], visible }`

---

### 2.6 Fluxos de Tela

**Tipos de fluxo:**

| Tipo | Elementos necessários | Descrição |
|---|---|---|
| `event_start` | 1 | Início de jornada |
| `event_end` | 1 | Fim de jornada |
| `line_solid` | 2 | Conexão sequencial |
| `line_dashed` | 2 | Conexão de mensagem |
| `diamond` | 2 | Decisão (com texto obrigatório) |
| `diamond_dashed` | 2 | Decisão opcional |
| `gateway_parallel` | 2+ | Fork / Join paralelo |

**Campos condicionais:**
- `decisionText`: obrigatório para tipos `diamond` e `diamond_dashed`
- `chipText`: opcional para `line_solid` e `line_dashed` (ex: "Sim", "Não")
- `anchorSide`: posição da seta — `auto` · `top` · `bottom` · `left` · `right`

**Cor da conexão (2026-10-02):** cada conexão (`createdFlows[].color`, `#rrggbb`) tem cor própria, aplicada à linha, seta, marcador de origem, losango da decisão e borda/texto do chip; vale por conexão, com opção de aplicar à jornada inteira (a UI envia uma edição por fluxo). A cor é livre quanto ao significado (ex.: erro/sucesso). Paleta **limitada** às cores reais da lib DSC | Fundamentos Visuais (todas com contraste mínimo 3:1 sobre branco): Neutro escuro `#22292e` (padrão), Azul `#005ca9`, Verde `#127527`, Vermelho `#b22c2c`, Laranja escuro `#a65e00`, Turquesa `#216e62`, Informação `#026273`, Cinza médio `#64747a`. Valor fora da lista ou ausente (fluxos antigos) cai no padrão. A cor também é gravada em pluginData (`handexFlowColor`) do grupo, para o redesenho reproduzi-la. Marcadores Início (verde `#127527`) e Fim (vermelho `#b22c2c`) mantêm cor própria de significado e não mudam.

**Regra de seleção:**
- Tipos Início/Fim: exatamente 1 elemento selecionado no canvas
- Demais tipos: exatamente 2 elementos selecionados

---

### 2.7 Exceções de Spec

**Tipos disponíveis:**

| Tipo | Cor | Ícone |
|---|---|---|
| Erro | red-500 | x-circle |
| Sucesso | green-500 | check-circle |
| Confirmação | blue-500 | help-circle |
| Alerta | amber-500 | alert-triangle |

**Campos:**
- Tipo (obrigatório para confirmar)
- Título (texto livre)
- Link âncora (URL opcional)
- Observações (checkbox + textarea condicional)
- "Injetar no frame de spec": visível apenas se a exceção tem `nodeId` de spec associado E `obs` preenchida

**Exceções na Ficha (2026-10-01):** exceções vivem só atreladas à spec — aparecem no card da spec em "Documentação Visual" (e, no futuro, no card User Interface), nunca como seção agregada "Cenários de Exceção" solta (removida). Cada exceção usa a semântica do tipo, com cores da lib DSC | Fundamentos Visuais: Erro = negative (`#8c2424` texto, `#b22c2c` borda, `#fbebeb` fundo), Alerta = attention (`#654c02`/`#977203`/`#fff9e6`), Sucesso = positive (`#0d581d`/`#127527`/`#e7f4ea`), Confirmação = azul de marca (`#005ca9` sobre `#e5f2fc`); tipo desconhecido cai em neutro. Retângulo de acento na lateral esquerda na cor do tipo.

**Mesma regra nos outros formatos (2026-10-01):** a Ficha HTML e o Markdown também não têm seção agregada de exceções — cada exceção aparece sob a sua spec (HTML: bloco "Exceções" no card da spec, rótulo do tipo em português com cor/fundo do tipo; Markdown: sub-item `[Erro]`/`[Alerta]`/`[Sucesso]`/`[Confirmação]`). Texto do rótulo usa a variante escura da cor (`#8c2424`, `#654c02`, `#0d581d`, `#005ca9`) para contraste AA; "Aviso" (nome legado) é lido como Alerta. Specs sem frame vinculado entram num grupo "Specs sem frame vinculado" para suas exceções não sumirem. O resumo por frame mostra só a contagem ("Exceções nas specs: N"). No `_aiContext`, `cenariosExcecao` é agrupado por spec (`[{ spec, frame, excecoes: [{ tipo, titulo, obs }] }]`).

**Injeção de obs no canvas:**
- Ao confirmar com "Injetar" marcado: backend cria frame `[Obs]` abaixo do frame de spec correspondente no canvas

---

### 2.8 Geração da Ficha no Canvas

**Pré-requisitos obrigatórios:**
1. `step1.titulo` não vazio
2. `step1.objetivo` não vazio
3. Pelo menos 1 membro de equipe com nome preenchido (e-mail e papel não são obrigatórios)

**Nomeação automática do frame:**
```
Handex | Ficha de Projeto | {titulo} | {DD/MM/AAAA}
```

**Versionamento:**
- Se `_fichaGenerated === true`: abre modal de versionamento antes de gerar
- Opções: Major (v1.0 → v2.0) ou Minor (v1.0 → v1.1)
- Campo de versão editável para customização livre

**Documentação Visual — recorte ampliado das medidas (2026-10-01):**
No bloco "Medidas aplicadas" de cada frame, além do snapshot do frame inteiro (visão geral), cada grupo de medida gera um recorte ampliado ("Detalhe: {elemento}", ou "Detalhe: {nome da medida}" quando só a caixa das marcações é conhecida) da região do elemento medido + marcações + 24px de respiro, mostrando só as marcações daquela medida. O elemento alvo é lido do `pluginData` `handexMeasureTargetId` do grupo de medida (gravado na criação; medidas antigas usam a caixa das marcações). Recorte pulado quando a região passa de 80% da área do frame ou quando o mapeamento imagem↔região não é confiável. Tetos: 8 recortes por frame, 20 por geração da Ficha, sempre sequenciais. É só imagem na Ficha: nada novo em `handoffData`, Markdown, JSON ou `_aiContext`. Medidas avulsas não recebem recorte.

Specs avulsas (sem frame vinculado) entram na "Documentação Visual" num bloco "Specs avulsas" (linha de apoio: "Anotadas direto no canvas, sem um frame escaneado em Escanear Tokens."; medidas análogas em "Medidas avulsas"; sem snapshot, só o card de detalhe). Gerar/atualizar a Ficha com 0 frames escaneados no plugin é recusado (erro visível) quando a Ficha atual já tem "Frames Escaneados"/"User Interface" — evita apagar essas seções por estado carregado incompleto; use "Nova Versão" (preserva a anterior) ou reescaneie.

**Locking automático:**
Todos os nós gerados pelo plugin são criados com `node.locked = true`:
- Frame principal da ficha
- Grupos de spec individual
- Frame de legenda de fluxos
- Frame injetado de observação de exceção
- Grupos de medida

**Chip de status — semântica de cor:**

| Status | Cor |
|---|---|
| rascunho | cinza (#94a3b8) |
| em-revisao | amarelo (#f59e0b) |
| pronto-para-dev | azul (#0070af) |
| finalizado | verde (#22c55e) |

**Seção de Especificações na ficha:**

- As seções "Especificações Visuais" e "Especificações Anotadas" foram **mescladas** em um único card "Especificações"
- Specs são organizadas por letra (grupo), com cabeçalho de nome do grupo quando `frame.specGroupNames[letra]` estiver definido
- Grupos com `frame.specGroupVisible[letra] === false` são omitidos da ficha
- Cada spec exibe:
  - **Chip de categoria** com cor semântica proveniente de `spec.color` (bg suave + borda colorida) e o label de `spec.type || spec.categoryLabel || spec.category` (fallback: `'Geral'`)
  - **Nome da spec** — se `spec.targetNodeId` existir e o nó estiver no documento, o nome é sublinhado e funciona como hyperlink `type: "NODE"` para o elemento anotado no canvas
  - **Propriedades técnicas** — cada entrada de `spec.properties[]` é exibida como linha com `prop.label`, `prop.token` e `prop.value`

**Card User Interface — indicadores de propriedade:**

- Cada propriedade escaneada exibe um ícone semântico por tipo (espaçamento direcional, tipografia, cor como swatch real, borda, raio etc.) seguido de label e valor
- **Dots de conformidade por propriedade foram removidos** — a acurácia de conformidade é responsabilidade do designer e não é informação acionável para o dev
- O badge de status do componente (DSC / AJUSTE / FORA) permanece visível no header do card do elemento, mas apenas quando a auditoria está ativa (`data.isAudit = true`)

**Card User Interface — redesenho "dev de UI" (2026-10-01):** o card deixou de listar `item.properties` (foto do scan) e passou a **ler o nó marcado direto do canvas** (só `isMarkedCustom`, sem `findAll`, tetos: profundidade 4, 40 nós, 12 imagens por geração; cada leitura protegida — falha omite o grupo). Grupos fixos, vazios omitidos, na ordem "O que é? → Como se organiza? → Como se parece? → O que muda? → De que é feito?":
1. Cabeçalho (nome com link, categoria, "precisa ser construído") e **imagem de referência** do item (PNG, proporcional, máx. 848×420, nunca corta).
2. **Resumo:** tipo, "Baseado em" (família + lib, vindos do skeleton/Plugin API), tamanho, descrição/links de documentação do componente.
3. **Diferenças em relação à lib** (destaque; só instância DSC com `customizationsStatus`): camada, campo, valor atual e padrão da lib. Dado do scan (Fase 5b) — re-escanear para atualizar.
4. **Layout** (direção, distribuição, alinhamento, espaço entre itens/linhas, espaço interno agrupado "16px nos 4 lados", dimensionamento Fixa/Ajusta/Preenche, limites mín./máx., posição absoluta, overflow, rotação), **Aparência** (todos os fills/strokes incl. gradiente/imagem, espessura/posição/estilo da borda, raio por canto, sombras completas, desfoque, opacidade, mistura), **Texto** (estilo/fonte/tamanho/altura de linha/letras/alinhamento/decoração/caixa/truncamento/cor). Onde há token: `token · valor`.
5. **Estados e variantes** (só COMPONENT/COMPONENT_SET): propriedades, opções e padrão; **Interações** de protótipo em linguagem simples (gatilho → ação/destino/transição); **Composição interna** (mesmo formato por filho; instância DSC continua "reutilizar, não construir"; filhos ocultos por propriedade booleana aparecem com a propriedade que os controla); **Configuração do componente** no fim, em linha única, só o que está ligado ou fora do padrão (nunca ids de nó: slots de troca mostram o NOME do componente). **Divisor entre grupos:** cada grupo tem uma linha de 1px sob o título e termina com uma linha divisória de 1px (retângulos "Divisor/Título" e "Divisor/Grupo", não stroke por lado — este não renderizou no Figma); o grupo "Diferenças" (âmbar, borda própria) e o último grupo do card ficam sem divisor.
- Texto de exemplo (`characters`) **não** entra: é conteúdo, não especificação.
- Decisão de produto: `_qsExtractNodeProperties` (Anotação) não foi alterada — o card tem leitor próprio (`_hdUi*`, `code.js`).

**Card User Interface — dois níveis, Essencial × Completo (2026-10-01):** o designer escolhe, por item marcado, quanto detalhe a Ficha leva. Campo opcional `uiDepth: 'essential' | 'full'` no item do scan (`frame.specs[cat][i].uiDepth` e `step2.specs`), no mesmo caminho de `isMarkedCustom`; ausente ou desconhecido = Essencial (Fichas antigas, sem o campo, saem Essenciais). Sem bump de schema. O re-scan preserva o valor por `nodeId` (mesma herança de `isMarkedCustom`, `code.js`). O cabeçalho do card mostra `<Categoria> · Personalizado, construir · Essencial|Completo`.

**Detalhamento completo: o que é e quando usar (2026-10-01):** *Essencial* (padrão) leva imagem de referência, o que é o item, tamanho, espaçamento, cores, textos principais e as diferenças em relação à biblioteca. *Completo* soma todas as propriedades de layout e aparência, a composição interna (todos os elementos que formam o item), as interações do protótipo e as opções do componente, quando disponíveis, e deixa a Ficha mais longa. Use Completo quando o dev precisar construir o item sem acesso ao DevMode; a escolha é por item (toggle no card, ou "Revisar detalhamento" para vários). No card e no modal, o texto de apoio é propositalmente curto; a explicação completa vive aqui, no onboarding e em "Como usar o plugin".

**Card User Interface — padrão em frame de Novo Componente (2026-10-01):** em frame com `isNewComponent` marcado, itens **personalizados detectados** pelo scan (`isCustomComponent === true`: componente/ícone sem vínculo próprio nem por ancestral com o DSC) entram na Ficha **por padrão** (`isMarkedCustom: true`); o designer pode desmarcar item a item. Campo `customDecided` (boolean, default false) registra que o designer mexeu no toggle "Vai para a Ficha" daquele item: o re-scan herda `isMarkedCustom` e `customDecided` por `nodeId`, e a regra de padrão só vale para item **novo** (sem item anterior) — nunca sobrescreve decisão manual. O frontend aplica a mesma regra retroativamente ao ligar "Novo Componente" depois do scan (só itens com `customDecided` false). O backend lê `msg.isNewComponent` no `scan-frame`. Frames não marcados como Novo Componente continuam 100% manuais.
- **Essencial** (mais barato, sem leitura profunda): imagem de referência, Resumo, Diferenças em relação à lib, Layout e Aparência compactos (valores neutros omitidos: distribuição/alinhamento no início, largura e altura "Ajusta/Ajusta", espaço interno 0, sem preenchimento/borda, raio 0, opacidade 100%, posição da borda interna), Texto (estilo ou fonte+tamanho, alinhamento e cor), Interações só do componente raiz e Composição interna como **lista de nomes** (até 2 níveis, `Nome · Tipo` ou `Nome · Lib · reutilizar` para instância DSC). O que ficou de fora é dito em linhas curtas (só se a contagem for maior que zero): composição interna (N elementos), interações do protótipo (N) e opções do componente, mais uma linha final: "Detalhamento completo disponível no Figma, ou peça ao designer para gerar a Ficha no nível Completo."
- **Completo:** fluxo anterior, inalterado (Estados e variantes, Interações de todos os filhos, Composição interna detalhada, Configuração do componente).
- **Rótulos (copy aprovada):** Alinhamento vertical/horizontal conforme a direção do auto layout (Topo/Centro/Base ou Esquerda/Centro/Direita), Distribuição horizontal/vertical ("Distribuídos, ocupando toda a largura/altura" para espaço entre itens), "Largura e altura", "Conteúdo que passa da borda", "Largura/altura mín. e máx.", "Posicionamento" (fora do fluxo do auto layout), "Elemento não encontrado no canvas; dados do último scan" e "Não foi possível comparar este item com a biblioteca."
- **Card ≠ export:** o nível vale só para o card da Ficha no canvas. Markdown, Ficha HTML e `_aiContext` continuam sempre completos.

**Card de elemento no padrão do handoff do DSC (2026-10-02, Fase B; flag `FICHA_DSC_STYLE_ENABLED` no topo de `code.js`):** o card de cada item `isMarkedCustom` da Ficha (o que monta a Documentação Visual / seção "User Interface") passa a seguir a estrutura do handoff de componente do DSC, medida em `docs/referencia-handoff-dsc.md`. **Atualização 2026-10-05 (pedido do Augusto: "padrão CAIXA na Ficha toda"):** a linguagem visual do handoff do DSC passa a valer para a **Ficha inteira** no canvas; conteúdo, ordem das seções, coluna única vertical e largura em cascata (1080 → 952 → 904 → 872, altura Hug) **não mudam**. Convertidas: header, Informações Básicas (status como chip), Equipe, Briefing, Regras de Negócio e HUs e Docs e Anexos (tabelas: cabeçalho `#ebf1f2`, células brancas, borda `#d0e0e3`, raio 8), Frames Escaneados (card + tabela de elementos), User Interface, Documentação Visual (painel `#ebf1f2` com borda `#9eb2b8`, tag "Preview", imagens com borda; card de spec com propriedades em chips por tipo e exceções como alertas por tipo; medidas em tabela; recortes), Specs/Medidas avulsas, Fluxos de Tela (tabela) e os blocos legados Design Specs/Auditoria (fonte, títulos, borda). Tipografia: toda a Ficha usa a fonte resolvida uma vez por geração (`_hdFicheFonts`: CAIXA Std → Roboto → Inter; código/tokens Fira Code → Roboto Mono), título de seção 22 semibold `#005ca9`, textos `#22292e`/`#404b52`, tags/chips com raio 4. Fundo externo (`mainContainer`) segue `#004d8d`; a folha (`fichaTecnica`) ganhou borda `#404b52` 2px e raio 16 como na referência. As **cores das categorias de spec** seguem como documentadas (exceção aprovada). Fontes só valem durante a geração da Ficha (`_hdFichaGen`): cards de Anotação e demais desenhos do canvas continuam em Inter. Com a flag `FICHA_DSC_STYLE_ENABLED` em `false` volta o visual anterior da Ficha inteira (Inter, cards cinza, pílulas, card `_hdBuildUiItemCard`). Também recai no card anterior, por item, se a montagem do novo falhar. (Texto original de 2026-10-02, escopo restrito ao card, superado nesta data.)
- **Estrutura (ordem fixa):** (1) Título: nome do elemento, selo da categoria de cada spec casada (cor da categoria mantida) e "Baseado em <componente> · <lib>"; (2) Descrição de Funcionalidade: a nota da spec casada, omitida quando não há spec; (3) Propriedades: tabela Propriedade \| Valor (valores possíveis, padrão em negrito) \| Descrição ("—" quando o Figma não tem descrição), só para COMPONENT/COMPONENT_SET/INSTANCE com propriedades; (4) Anatomia: painel "Preview" com a imagem do elemento e marcadores numerados (círculo + conector) sobre as partes (a própria base + até 7 filhos diretos visíveis; excedentes viram "N partes não exibidas"), seguido de uma coluna por parte com linhas `propriedade:` + chip; (5) Espaçamento e Alinhamento; (6) Variações e Estados; (7) Notas.
- **Níveis:** Essencial = Título, Descrição, Propriedades, Anatomia e Notas. Completo (`uiDepth: 'full'`) soma Espaçamento e Alinhamento (gap/padding desenhados sobre a imagem, fundo `#a0d2fc`, e rótulo de alinhamento) e Variações e Estados (só quando o elemento é COMPONENT_SET, variante de um conjunto ou instância cujo conjunto seja legível; cada variante numerada, só o que muda em relação à variante padrão, até 6 por card com a linha "N variantes não exibidas"; falha de leitura omite a seção sem erro). No Essencial, gap e padding da base aparecem na própria Anatomia; no Completo ficam na seção de Espaçamento.
- **Chips por tipo:** cor (fundo `#e5f2fc`, borda `#005ca9`, amostra de 16px); número/medida (`#fff3d6`, `#d19400`); componente da lib (`#eac9de`, borda `#93537d`, selo "DSC Library" `#753c61`); valor bruto `NNpx | N.NNrem` (`#ebf1f2`, `#9eb2b8`, rem com base 16 e até 3 casas). Token exibido como variável CSS (`dsc/color/bg/highlight/4` vira `--dsc-color-bg-highlight-4`: `/` e espaços em `-`, minúsculas, prefixo `--`); o nome Figma original fica no nome da camada do chip e no pluginData `handexTokenName`.
- **Notas:** exceções da spec casada como alertas (fundo branco, borda de 2px com lateral esquerda mais grossa, raio 4, ícone info), com a cor por tipo já aprovada (Erro `#b22c2c`, Alerta `#977203`, Sucesso `#127527`, Confirmação `#005ca9`, informativo `#038299`); link da spec e "Diferenças em relação à lib" entram como alertas informativos.
- **Componente do DSC sem alteração** (instância com vínculo com a lib e personalização avaliada sem diferenças): o card traz só a nota da spec, as exceções e uma linha "Componente do DSC — reutilizar" (chip de componente), sem Anatomia/Variações.
- **Casamento spec ↔ elemento (backend):** `_hdMatchSpecsToItems`, mesmo critério de `resolve-spec-owners`: `targetNodeId` igual a `nodeId`/`nodeIds` do item; senão sobe por `parent` até o primeiro item escaneado ou o frame (specs avulsas só casam por igualdade); em dúvida, não anexa; várias specs no mesmo item saem ordenadas por letra.
- **Fontes:** Roboto (400/600/700, fonte vigente da lib DSC | Fundamentos Visuais; decisão do Augusto em 2026-10-05, a CAIXA Std da referência dependia de a fonte estar disponível em cada máquina) e Fira Code (regular/medium) para rótulos de propriedade e chips, resolvidas uma vez por geração (`_hdFicheFonts`, `figma.listAvailableFontsAsync` + `loadFontAsync`). Fallback silencioso e obrigatório: Inter / Roboto Mono. Escala reduzida da folha de 2400px para os 856px úteis da seção (nome 24, título de seção 22, descrição 14, parte 13, tabela 13, chips 12, marcador 18), mantendo raios (chip 4, painel/tabela 8, card 16) e cores da referência.
- **Tetos e segurança:** sem `findAll`; leituras por `_hdUiSafe` (falha omite a parte); 12 imagens por geração (cada variante conta); a mesma imagem serve a Anatomia e ao Espaçamento. Pendência de decisão: enquanto a Fase C não existe, a Documentação Visual por frame continua exibindo o card de detalhe da spec, então nota e exceções de uma spec casada aparecem também no card do elemento.

**Leitor único de propriedades (`_readNodeSpec`) e vocabulário do plugin (2026-10-01):** `code.js` tem uma só leitura das propriedades de um nó, `_readNodeSpec(node, { level: 'quick'|'essential'|'full', include: { layout, appearance, text, componentProps }, propKeys })`, que devolve linhas neutras `[{ group, cat, key, label, value, raw, token, tokenKey, libName, state }]` (sem texto pronto de apresentação). Chamadores: Especificação (`request-spec-properties`, formato `{ key, label, value, token }`), Anotação (`_qsExtractNodeProperties`, formato `{ label, value, tokenName, libName }`, nível `quick`) e os grupos Layout/Aparência/Texto/Configuração do card User Interface (`_hdUi*Rows`, que só formatam as linhas). O **scan** (`extractNodeProperties`) continua com leitura própria porque cada linha precisa de `audit()` por chave; ele compartilha os helpers de leitura (`_specStrokeWidths`, `_specComponentName`). A composição interna (filhos) segue em `_hdCollectUiComposition`, que chama o leitor por filho. Toda linha tem `key` estável, independente do rótulo (no scan, o campo equivalente é `propId`, porque `key` do scan já é a chave do token).

- **Vocabulário (`HD_GLOSSARY`, espelhado em `HX_GLOSSARY`, `modules/core.js`):** comunicação em português (títulos de grupo, frases, avisos); nomenclatura técnica do Figma/CSS em inglês, como no Dev Mode, sem traduzir: `Auto layout` (Horizontal/Vertical/Wrap), `Gap`, `Row gap`, `Padding` (`Top/Right/Bottom/Left` ou `16px (all sides)`), `Width`/`Height` (`Fixed 360px`/`Hug contents`/`Fill container`), `Min/Max width/height`, `Primary axis`/`Counter axis` (`Min`/`Center`/`Max`/`Space between`/`Baseline`), `Fill`, `Border color`/`Border width`/`Border position` (`Inside`/`Outside`/`Center`)/`Dash`, `Radius`, efeitos `Drop shadow`/`Inner shadow`/`Layer blur`/`Background blur` (`X`/`Y`/`Blur`/`Spread`/`Color`), `Opacity`, `Blend mode`, `Clip content`, `Rotation`, `Position` (`Absolute (ignores auto layout)`), tipografia (`Text style`/`Font family`/`Font style`/`Font size`/`Line height`/`Letter spacing`/`Text align`/`Text decoration`/`Text case`/`Truncate text`/`Max lines`), componente (`Component`/`Variant`/`Boolean`/`Instance swap`/`Text`/`Component properties`) e interações com os nomes de gatilho/ação do Figma (`On click`, `While hovering`, `Navigate to`, `Open overlay`, `Smart animate` etc.). Títulos de grupo do card (PT): Resumo, Diferenças em relação à lib, Layout, Aparência, Texto, Estados e variantes, Interações, Composição interna, Configuração do componente. **Substitui** a "copy aprovada" de rótulos em português do card (Distribuição horizontal, Espaço interno, Raio dos cantos etc.) descrita acima. Rótulos antigos persistidos (`item.properties[].label`, `createdSpecs[].properties[].label`, `handexQuickSpecProperties`) não são migrados: a exibição os traduz por mapa de aliases (`HX_LABEL_ALIASES` no frontend, `HD_GLOSSARY.aliases` nas legendas do canvas).
- **Borda por lado (bug corrigido):** a Plugin API só vincula variável em `strokeWeight` (todos os lados) e em `strokeTopWeight`/`strokeRightWeight`/`strokeBottomWeight`/`strokeLeftWeight` (`VariableBindableNodeField`). Com borda configurada por lado, o token vive em `boundVariables.strokeTopWeight` etc.; o scan lia só `strokeWeight` e reportava "1px sem token" (ex: instância de `[dsc] Tag`, token `border/width/hairline`), derrubando o componente para "Necessita revisão". Regra atual (`_specStrokeWidths`): lê os 4 lados; mesmo valor e mesmo token nos 4 = uma linha ("Border width"); senão uma linha por lado ("Border width Top/Right/Bottom/Left"), cada uma auditada por chave. Lado com valor 0 e token (`border/width/none`) é mantido (conformidade válida); lado 0 sem token é omitido.
- **Valor 0 com token vinculado (gap/padding):** o scan registra e audita (`spacing/none` conta como conforme) em vez de omitir; valor 0 sem token continua omitido. Cards de construção (Ficha, Anotação, Detalhada) ocultam essas linhas (`state: 'zero-token'`).
- **Regra do chip "Necessita revisão" em componente/ícone (`addElement`, `code.js`):** só existe quando o item TEM vínculo com o DSC (componentKey no skeleton, próprio ou por ancestral). Entre as propriedades **avaliadas** (`isDS` true/"warning"/false; sizing e variantes são `null` e ficam fora): todas conformes = **Em conformidade**; pelo menos uma conforme e alguma não = **Necessita revisão** (âmbar); nenhuma conforme = **Fora do padrão**. Instância com personalização detectada (Fase 5b) e demais propriedades conformes também vira "Necessita revisão". Item sem vínculo é "Componente personalizado" (âmbar), nunca vermelho.
- **Auditoria é por chave, nunca por valor:** `auditProperty` só aceita `componentKey`/key de variável/key de estilo presente no skeleton. O que se compara por VALOR no scan é só a detecção de personalização de instância (valor atual vs. padrão do componente principal) e, no card/Spec, a exibição. Valor sem token é desvio; valor com token de fora do skeleton é "warning".

---

### 2.9 Limpar Todos os Dados

**Botão:** ícone `trash-2` ao lado do botão "Importar JSON" na home.

**Fluxo:**
1. Clique abre o modal `confirm-clear-modal` (confirmação destrutiva)
2. Ao confirmar "Sim, limpar tudo":
   - `localStorage['handex-state']` removido
   - `localStorage['handex-ann-categories-v2']` removido
   - `handoffData` resetado para o estado inicial (schema v2 limpo)
   - `createdSpecs` esvaziado em memória
   - UI re-populada via `restoreUIFromState()`
   - Navegação para `view-home`
   - Toast: "Todos os dados foram removidos."
3. Ao cancelar: modal fechado sem alteração

> **Nota:** `location.reload()` não é suportado no WebView do Figma (resulta em tela branca). O reset é feito inteiramente em memória sem recarregar a página.

---

### 2.10 Exportação

**Formatos disponíveis:**
- **JSON** — backup completo do `handoffData` (sem previews Uint8Array)
- **Markdown (.md)** — documentação estruturada com tokens por categoria
- **HTML interativo** — standalone com Tailwind e Lucide embarcados

**Tokens no MD/HTML:**
- Listados por categoria com nomes reais (até 10 por categoria)
- Excedente exibido como `+N itens`
- Tags de categoria no HTML com `cursor:default; pointer-events:none` (não são clicáveis)

**Importação de JSON:**
- Valida presença de `step1` na raiz
- Incrementa versão minor automaticamente ao importar
- Merge com defaults para campos ausentes

**Organização do canvas por Sections — z-order (2026-10-01):** conteúdo do Handex vive em Sections (`Handex | Specs/Anotações/Medidas/Fluxos/Ficha`). A ordem de empilhamento é a ordem dos filhos da página, então `_hdBringAnnotationLayersToFront()` (`code.js`) mantém as Sections de anotação (exceto a Ficha) sempre acima das telas, a cada criação e no `ui-ready`; Sections sem fill; x/y não mudam.

---

## 3. Travas e Condições de Bloqueio

### 3.1 Botão "Gerar Ficha"

Desabilitado (`opacity-50`, `cursor-not-allowed`) enquanto qualquer condição não for atendida:

| Condição | Origem |
|---|---|
| `step1.titulo` vazio | `validateStep1()` |
| `step1.objetivo` vazio | `validateStep1()` |
| Nenhum membro da equipe com nome preenchido | `validateStep1()` / `_hasValidTeamMember()` |

### 3.2 Botão "Confirmar Exceção"

Desabilitado até que o usuário selecione um tipo (Erro / Sucesso / Confirmação / Alerta).

### 3.3 Botão "Conectar Frames" (Fluxo)

Desabilitado até que o usuário selecione um tipo de fluxo no modal.

### 3.4 Checklist da Ficha (Step 5)

O checklist exibe status em tempo real:

| Item | Status |
|---|---|
| Título preenchido | ✓ / ✗ |
| Responsável com nome preenchido | ✓ / ✗ |
| Frames documentados (≥1) | ✓ / ✗ |
| Conformidade declarada | ✓ / ✗ |
| Fluxos mapeados | ◇ (opcional) |

### 3.5 Locking de layers no canvas

Qualquer layer gerada pelo plugin é bloqueada contra edição direta no Figma.
Para remover ou recriar um item, o usuário deve usar os botões de exclusão dentro do plugin.

### 3.6 Schema desatualizado

Se o estado salvo no `figma.clientStorage` não contém `_schemaVersion: 2`, ele é descartado completamente e o plugin inicia com estado limpo. Não há prompt ao usuário — o descarte é silencioso e automático.

### 3.7 Seleção cross-page

Ao tentar focar/selecionar um nó no canvas, o plugin verifica se o nó pertence à página atual (`_nodeOnCurrentPage()`). Se não pertencer, o foco é silenciosamente ignorado sem erro.

---

## 4. Comportamentos Automáticos

| Ação do usuário | Comportamento automático |
|---|---|
| Abre o plugin | Tenta preencher `s1-titulo` com o nome do arquivo Figma |
| Marca checkbox "Jornada" ou "Feature" | Requisita nome do frame selecionado e preenche o campo |
| Adiciona membro à equipe | Revalida o botão "Gerar Ficha" |
| Remove membro da equipe | Revalida o botão "Gerar Ficha" |
| Altera qualquer campo | Salva automaticamente via `saveToStorage()` |
| Cria spec, medida ou fluxo | Salva e renderiza na lista imediatamente |
| Importa JSON | Incrementa versão minor automaticamente |
| Gera ficha uma segunda vez | Abre modal de versionamento antes de prosseguir |
| Adiciona novo item a uma lista | Auto-scroll para o item adicionado (100 ms) |
| Ativa tema dark/light | Persiste preferência em `localStorage['theme']` |
| Clica em "Limpar todos os dados" (lixeira) | Abre modal de confirmação destrutiva |
| Confirma limpeza no modal | Reseta `handoffData` em memória, limpa localStorage, navega para home e exibe toast |
| Clica em `⇅` (recolher/expandir) | `collapseAllAccordions(container)` — recolhe ou expande todos os accordions visíveis no container, incluindo os cards de frame (`frame-body-{id}`) e accordions internos (tokens, medidas, specs) |

---

## 5. Disclaimers e Mensagens ao Usuário

### 5.1 Toast de feedback (UI)

| Contexto | Mensagem |
|---|---|
| Salvo automaticamente | "Salvo automaticamente" (ícone verde) |
| Step 1 inválido ao avançar | "Preencha o título e ao menos um membro da equipe para avançar." |
| Frame já escaneado | "Frame "{nome}" já escaneado. Atualizando..." |
| Cache limpo | "Cache limpo. Plugin reiniciado." |
| Exportação bem-sucedida | "Dados exportados com sucesso!" |
| Ficha gerada | "Ficha gerada no canvas!" |
| Buscando framework | "Buscando framework no canvas..." |

### 5.2 Notify do Figma (backend)

Mensagens exibidas como notificação nativa do Figma:

- Ao criar medidas: confirmação com número e tipo
- Ao criar fluxo: confirmação com nome
- Ao criar spec: confirmação com letra/categoria
- Ao criar legenda: "Legenda criada!"
- Ao criar ficha: "Ficha técnica criada no canvas!"

### 5.3 Hints visíveis na interface

> **Nota (2026-09-17):** os cards de hint fixo que existiam em Anotar Especificações/Anotar Medidas/Fluxos de Tela/Escanear Tokens foram **removidos** (v6.15.2/v6.16.1) por duplicarem a mesma explicação já coberta pelo empty-state e pelo onboarding contextual — ver CLAUDE.md ("Cards de hint fixo duplicavam o onboarding/empty-state"). A tabela abaixo documenta só o texto do **empty-state** de cada tela (que continua existindo), não um card separado.

| Local | Texto |
|---|---|
| Escanear Tokens (estado vazio) | "Nenhum frame escaneado" / "Selecione um frame no canvas do Figma para começar." + botão **+ Escanear Frame** |
| Anotar Especificações (estado vazio) | "Nenhuma especificação criada ainda" / "Selecione um elemento no canvas para começar." + botão **+ Nova spec** |
| Anotar Medidas (estado vazio) | "Nenhuma medida criada ainda" / "Selecione elementos no canvas para começar." + botão **+ Inserir medida** |
| Fluxos de Tela (estado vazio) | "Nenhum fluxo criado ainda" / "Selecione 2 ou mais elementos no canvas para começar." + botão **+ Conectar Frames** |
| Tipo Decisão no modal de fluxo | "Dica: Use frases curtas para melhor legibilidade dentro do losango." |
| Como Usar — hint de layers | "Specs, medidas, fluxos e a Ficha de Projeto são criados com bloqueio de edição para preservar a integridade do handoff. Para remover ou recriar um item, utilize os botões de exclusão dentro do próprio plugin." |
| Jornada / Feature | "Ao marcar, preenche com o nome do frame selecionado no Figma" |
| Spec — Dica de uso | "O destaque e o scroll automático no Figma ocorrem apenas ao clicar para expandir um item da lista." |

### 5.4 Confirmações destrutivas

| Ação | Confirmação |
|---|---|
| Limpar cache do plugin | `window.confirm("Limpar todo o cache do plugin?\n\nIsso removerá: formulário, frames, auditoria, medidas, fluxos e histórico.\n\nEssa ação não pode ser desfeita.")` |
| Limpar todos os dados (botão lixeira na home) | Modal `confirm-clear-modal` — título "Limpar todos os dados?", botões "Cancelar" e "Sim, limpar tudo" (vermelho) |

### 5.5 Disclaimers técnicos (sem exibição ao usuário)

- **`clientStorage` sem plugin ID:** o plugin opera sem persistência entre sessões quando executado como plugin de desenvolvimento sem ID registrado no manifesto. Falha silenciosa com log de aviso interno.
- **`localStorage` bloqueado:** em contexto `data:` URL (modo dev), o localStorage é inacessível. O plugin funciona normalmente sem persistência de tema e de preferências de categorias.

---

## 6. Jornadas de Usuário

### 6.1 Jornada Principal — Handoff Completo

```
HOME
 │
 ├─► Informações do Projeto
 │     Preenche: título, versão, objetivo, status, equipe
 │     Opcional: jornada, feature, briefing, regras, docs
 │
 ├─► Escanear Tokens
 │     Seleciona frame no canvas → Escanear Frame
 │     Para cada frame:
 │       Escaneia tokens por categoria
 │       Marca conformidade DSC
 │       Marca se é Novo Componente
 │
 ├─► Anotar Especificações
 │     Seleciona elemento no canvas → botão +
 │     Define: letra, categoria, nota, link, guia
 │     Adiciona propriedades técnicas e exceções
 │
 ├─► Inserir Anotações (fora do handoff formal)
 │     Escanear → filtro → Shift+clique nos elementos → Concluir
 │     Consulta de propriedades brutas; não entra na Ficha
 │
 ├─► Anotar Medidas
 │     Seleciona elemento(s) no canvas → botão +
 │     Escolhe tipos (wh / outer / inner / spacing)
 │
 ├─► Fluxos de Tela
 │     Seleciona 1 ou 2 elementos → Conectar Frames
 │     Define tipo, texto de decisão (se diamond) e chip
 │
 └─► Gerar Ficha de Handoff
       Checklist validado → Gerar Ficha no Canvas
       Opcional: Exportar MD / JSON / HTML
```

---

### 6.2 Jornada Rápida — Apenas Specs

```
HOME → Anotar Especificações
  Seleciona elemento → botão +
  Preenche letra e categoria
  Confirma → spec aparece no canvas e na lista
```

Para só **consultar** valores de propriedade (sem documentar formalmente), ver a jornada abaixo.

### 6.2.1 Jornada Rápida — Consulta de Propriedades (Anotações)

```
HOME → Inserir Anotações
  Escanear → escolhe categorias de propriedade
  Plugin colapsa → Shift+clique em cada elemento no canvas → Concluir
  Lista de elementos com propriedades brutas
  Opcional: Inserir cards no canvas (coluna na altura de cada elemento + linha guia)
  Opcional: Converter em Especificação (vira especificação formal, entra na Ficha)
```

---

### 6.3 Jornada Rápida — Apenas Medidas

```
HOME → Anotar Medidas
  Seleciona elementos no canvas
  Escolhe tipos de medida → botão +
  Confirma → medidas aparecem no canvas e na lista
```

---

### 6.4 Jornada Rápida — Fluxo de Navegação

```
HOME → Fluxos de Tela
  Seleciona 2 frames no canvas
  Clica + Conectar Frames
  Escolhe tipo (sequência, decisão, etc.)
  Preenche textos condicionais
  Confirma → seta / losango criado no canvas
```

---

### 6.5 Jornada — Atualização de Ficha Existente

```
HOME → Gerar Ficha de Handoff
  Plugin detecta ficha existente (_fichaGenerated = true)
  Abre modal de versionamento:
    Minor: v1.0 → v1.1 (ajuste incremental)
    Major: v1.0 → v2.0 (redesenho significativo)
  Usuário confirma versão → ficha recriada no canvas
```

---

### 6.6 Jornada — Exportação de Documentação

```
HOME → Gerar Ficha de Handoff (view-handoff-summary)
  Exportar como Markdown → download .md
  Exportar como JSON → download .json (backup)
  Gerar Ficha no Canvas → cria frame no Figma
```

---

### 6.7 Jornada — Exceção em Spec

```
Anotar Especificações → expande uma spec → + Exceção
  Seleciona tipo (Erro / Sucesso / Confirmação / Alerta)
  Preenche título, âncora, observação
  Se obs preenchida e spec tem nodeId:
    Opção "Injetar observação no frame de spec"
    → Ao confirmar: cria frame [Obs] no canvas abaixo da spec
```

---

### 6.8 Jornada — Importar Dados Existentes

```
HOME → Importar JSON (botão utilitário)
  Seleciona arquivo .json exportado anteriormente
  Plugin valida presença de step1
  Faz merge com estado atual
  Versão minor incrementada automaticamente
  UI re-populada via restoreUIFromState()
```

---

## 7. Persistência e Armazenamento

### 7.1 Figma clientStorage (assíncrono, por arquivo)

| Chave | Conteúdo | Quando salva |
|---|---|---|
| `handoffData` | Estado completo do projeto | A cada alteração (`saveToStorage`) |
| `handex-scan-cache-v1` | Último resultado de scan com previews | Após scan bem-sucedido |
| `handex-history-{fileKey}` | Array de até 5 snapshots de versão | Ao exportar handoff |

> **Limitação:** `figma.clientStorage` não funciona sem um `id` válido no manifesto do plugin. Em ambiente de desenvolvimento sem ID publicado, todas as operações de storage falham silenciosamente. O plugin continua funcionando sem persistência entre sessões.

### 7.2 localStorage (síncrono, por navegador)

| Chave | Conteúdo |
|---|---|
| `theme` | Preferência de tema (`light` / `dark`) |
| `handex-ann-categories-v2` | Categorias personalizadas de spec (JSON) |
| `handex-check-designs-prompted-v1` | Flag: modal "Check Designs" já exibido |

> **Limitação:** `localStorage` é bloqueado em contexto `data:` URL (modo dev do Figma). O plugin captura o `SecurityError` e opera normalmente sem as preferências salvas.

### 7.3 Histórico de snapshots

- Máximo de 5 snapshots por arquivo
- Cada snapshot contém: `exportedAt`, `projectName`, `versao`, dados do scan
- Usado para calcular diff entre versões no HTML interativo

---

## 8. Integrações com o Backend Figma

### 8.1 Mensagens UI → Backend (`code.js`)

| Tipo | Payload principal | Quando enviado |
|---|---|---|
| `save-storage` | `{ data: handoffData }` | A cada alteração |
| `get-selection-info` | — | Ao registrar frame ou abrir fluxo |
| `get-context-name` | — | Ao ativar Jornada / Feature |
| `scan-frame` | `{ nodeId, categories, selectedLibSlugs }` | Ao escanear tokens |
| `measure-nodes-custom` | `{ measureTypes[], storeInParent, startingNumber }` | Ao criar medida |
| `create-unified-spec` | `{ opts: { category, letter, … } }` | Ao criar spec |
| `create-flow` | `{ name, type, nodes[], chipText, … }` | Ao criar fluxo |
| `create-handoff` | `{ data: handoffData }` | Ao gerar ficha |
| `inject-obs-to-spec` | `{ nodeId, obs, specName }` | Ao injetar obs de exceção |
| `highlight-node` | `{ id, shouldScroll }` | Ao expandir item na lista |
| `hide-node` | `{ id, forceState }` | Ao ocultar item |
| `delete-node` | `{ id }` | Ao excluir item |
| `scroll-node-into-view` | `{ id }` | Ao focar frame no canvas |
| `focus-node` | `{ id }` | Ao focar nó no canvas |
| `resize-ui` | `{ width, height }` | Ao redimensionar painel |
| `clear-cache` | — | Ao limpar cache do plugin |

### 8.2 Mensagens Backend → UI

| Tipo | Dados | Efeito |
|---|---|---|
| `init-plugin` | `{ version, theme, currentUser, projectName, savedState }` | Inicializa estado e UI |
| `scan-result` | `{ frameId, data: { components, icons, … } }` | Renderiza tokens |
| `measurements-applied` | `{ data: [medidas] }` | Adiciona medidas à lista |
| `spec-created` | `{ spec }` | Adiciona spec à lista e ao canvas |
| `flow-created` | `{ flow }` | Adiciona fluxo à lista |
| `handoff-complete` | `{ isUpdate, timestamp }` | Marca ficha como gerada |
| `context-name` | `{ name }` | Preenche campo Jornada/Feature |
| `selection-info` | `{ nodes: [{ nodeId, name }] }` | Registra frames |

---

## 9. Limites Técnicos

| Limite | Valor |
|---|---|
| Caracteres da tag de spec (letter) | 8 (formato `[A-Z]\d*(\.\d+)*`) |
| Snapshots históricos por arquivo | 5 |
| Itens por seção de scan até exibir busca | 10 |
| Tokens listados por categoria na ficha | 10 (+ contagem de excedente) |
| Membros da equipe | Ilimitado |
| Frames documentados | Ilimitado |
| Specs por frame | Ilimitado |
| Medidas por frame | Ilimitado |
| Fluxos | Ilimitado |
| Exceções por spec | Ilimitado |

---

## 10. Glossário

| Termo | Definição |
|---|---|
| **Ficha Técnica** | Frame gerado no canvas do Figma com todos os dados do handoff |
| **Handoff** | Entrega completa de documentação de design: dados + frames + specs + fluxos + exportação |
| **Spec** | Anotação visual criada no canvas com propriedades técnicas, categoria e notas |
| **Exceção** | Cenário alternativo ou estado de erro documentado em uma spec (Erro · Sucesso · Alerta · Confirmação) |
| **Medida** | Dimensão (altura, largura, padding, gap) de um ou mais elementos do canvas |
| **Fluxo** | Conexão visual entre dois frames representando uma transição de tela ou decisão de navegação |
| **Token** | Elemento do Design System (cor, tipografia, espaçamento) identificado pelo scan |
| **Frame Hub** | Central de gerenciamento de frames documentados no plugin |
| **Conformidade DSC** | Declaração do designer de que o frame foi verificado com o Check Designs do Figma |
| **Jornada** | Nome da jornada de usuário à qual o frame pertence (ex: Onboarding, Checkout) |
| **Feature** | Nome da funcionalidade específica sendo documentada |
| **Schema v2** | Versão atual da estrutura de dados do plugin (`_schemaVersion: 2`) |
| **clientStorage** | API do Figma para persistência de dados por plugin e por arquivo |
| **Locking** | Bloqueio de edição de layers geradas pelo plugin — editáveis apenas pelo plugin |
| **Novo Componente** | Frame que introduz um componente inédito ao Design System |
| **Chip de status** | Indicador visual colorido do status da entrega na ficha gerada no canvas |
