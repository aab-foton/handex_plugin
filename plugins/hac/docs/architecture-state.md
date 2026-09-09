# Estado da arquitetura — hac (Handoff de Acessibilidade CAIXA)

> **AVISO — este arquivo local passou a ser SECUNDÁRIO em 2026-09-02.**
> A partir desta data, a fonte primária de verdade da documentação técnica
> do hac são os arquivos HTML estáticos dentro de `docs/` neste mesmo
> repositório — em especial `docs/tecnico.html` e `docs/changelog.html`
> (ver também `docs/index.html`, `docs/institucional.html` e
> `docs/design-system.html`). Atualizações de arquitetura, bugs corrigidos
> e decisões de produto devem ser registradas primeiro lá, não aqui.
>
> **Não existe nenhuma versão pública ou hospedada dessa documentação.**
> O repositório `aab-foton/hac_plugin` é privado, e essa documentação deve
> permanecer restrita a quem tem acesso a ele — nunca publicar via GitHub
> Pages ou qualquer outro serviço de hospedagem externo. Para consultar,
> clone/baixe o repositório e abra os arquivos `.html` diretamente no
> navegador (`file://`), sem necessidade de build ou servidor.
>
> Este arquivo (`docs/architecture-state.md`) é mantido como espelho/ponto
> de partida histórico do estado em que a documentação foi migrada, mas não
> tem mais obrigação de sincronia automática — se você é uma sessão futura
> lendo este arquivo, confira `docs/tecnico.html` antes de assumir que este
> documento reflete o estado atual do código.

> Documento vivo. Atualize sempre que o schema `hacData`, o contrato de
> mensagens, ou uma regra de negócio central mudar de forma estrutural —
> mas priorize atualizar `docs/tecnico.html` (ver aviso acima) como destino
> principal.
> Última revisão completa: 2026-09-02 (branch `beta/a11y-mobile-handoff`) —
> reescrito do zero após uma sessão que corrigiu 3 bugs estruturais reais no
> matching DSC→a11y e mudou a arquitetura de origem web/mobile 3 vezes no
> mesmo dia. Ver seção 8 para o histórico dessas decisões.

## 1. Schema de dados (`hacData`)

O hac não tem conceito de "frame"/múltiplas telas (diferente do Handex).
Existe **um único array de verdade por tipo**, sem duplicação
avulso+por-frame — essa duplicação foi a causa raiz de um bug conhecido do
Handex (specs "sumindo" por haver duas fontes de verdade divergentes); o
hac nasce sem esse padrão por decisão deliberada.

```js
hacData = {
  _schemaVersion: 1,
  a11yAreas: [],        // Áreas Marcadas — card clicável, abre workspace própria (ver seção 9)
  a11ySpecs: [],         // Especificações de acessibilidade (5 categorias)
  tabOrderItems: [],     // Ordem de Tabulação (por área, arquitetura de cópia de frame)
  a11ySwipePaths: [],    // Trilha de Swipe (por área, N pontos — ver seção 8d)
  currentUser: null,     // Usuário Figma identificado automaticamente (sem login)
  projectOrigin: null,   // 'web' | 'mobile' | null — ver seção 3
  activeSectionName: null, // nome da Section de specs ativa — ver seção 8
}
```

Definido em `src/plugin/modules/core.js`, espelhado em variáveis globais
soltas (`a11yAreas`, `a11ySpecs`, `tabOrderItems`) que são a fonte de
verdade real durante a sessão — `hacData` é remontado a partir delas só
na hora de persistir (`saveToStorage()`). `a11ySwipePaths` é a EXCEÇÃO —
vive só dentro de `hacData`, sem variável global espelhada (todo ponto de
leitura acessa `hacData.a11ySwipePaths` diretamente).

`_schemaVersion` continua fixo em `1` desde a origem do plugin — todas as
mudanças de schema desta sessão (variantes mobile, `projectOrigin`) foram
tratadas como **aditivas**, migração por ausência de campo, não por número
de versão.

### `a11yAreas[]`
Selo numerado de seção/tela marcado no canvas. Campos: `id`, `number`,
`label`, `targetNodeId`. **Não tem mais campo `origin` próprio** — a
origem web/mobile deixou de ser calculada por área (ver seção 3, histórico
completo da mudança).

Na UI, cada área é renderizada como **card clicável** na listagem
principal (não mais accordion expansível in-line) — clicar abre a
workspace própria da área, com 4 tabs. Ver seção 8b,
"Workspace de Área (2026-09-04)", para o desenho completo.

### `a11ySpecs[]`
Cada spec pertence a uma categoria (`a11yType`: `elemento` | `estrutura` |
`titulo` | `decorativo` | `informacoes`) e a uma Área Marcada
(`a11yAreaId`). Campos principais: `id` (nodeId real do specGroup no
canvas), `targetNodeId`, `letter`, `color`/`fillColor`, `properties[]`
(`{key,label,value}`), `a11ySubtype` (chave crua da subvariante, usada
pelo backend pra ajustar a instância aninhada do componente real
importado), `a11yOrigin` (`'web'` | `'mobile'`, gravado no momento da
criação a partir de `modal.dataset.a11yOrigin` — nunca recalculado
depois), `a11ySourceLib`, `a11yDscComponentName` (nome real do component
set DSC, ex: `"[dsc] Top App Bar"`, quando resolvido), `needsReview`
(boolean — ver seção 4), `locked` (specs de A11y nascem sempre travadas),
`visible`.

### `tabOrderItems[]`
Populado pela arquitetura de cópia de frame (`_createTabOrderCloneForArea`
em `code.js`) — nunca desenha sobre o design original. A cópia em si vive
dentro de uma Section dedicada no canvas, separada da Section de specs —
ver seção 8, "Organização em Sections dedicadas".

### `a11ySwipePaths[]`
Trilha direcional de N pontos por área (substituiu `swipeOrderItems[]`,
depois `a11ySwipeFlows[]` — histórico completo na seção 8d). Schema:
`{id, points: [{nodeId, nodeName}, ...], areaId, createdAt}`. Exclusivo
de projetos mobile.

### `projectOrigin`
Ver seção 3 — origem web/mobile do arquivo inteiro, não por área.

### Persistência
`saveToStorage()` (`core.js`) remonta `hacData` a partir das variáveis
globais e envia `save-storage` pro backend. Isolamento por arquivo real do
Figma: chave `hacData:${figma.fileKey}`.

Arquivos ainda não salvos pela primeira vez não têm `figma.fileKey`, e a API
do Figma não expõe nenhum identificador estável para esse estado. Uma chave
de fallback fixa (`hacData:unsaved`) existiu até 2026-09-02, mas causava
vazamento real de dados entre projetos/clientes diferentes: como
`clientStorage` é escopado por instalação do plugin (não por arquivo/aba),
todo arquivo não-salvo lia e escrevia na MESMA chave — abrir um segundo
arquivo não-salvo carregava os dados/specs do primeiro. `_getHacDataStorageKey()`
agora retorna `null` nesse cenário, e `ui-ready`/`save-storage`/`clear-cache`
tratam `null` como "não persiste, não reidrata": o arquivo não-salvo sempre
abre com `hacData` zerado e nada é gravado em `clientStorage` até o arquivo
ganhar um `fileKey` real (primeiro save). Consequência aceita: fechar o
plugin/Figma no meio do trabalho num arquivo nunca salvo perde o progresso
da sessão — preferível a corromper silenciosamente os dados de outro
projeto. Arquivos já salvos (fileKey estável) não mudam de comportamento.

`clear-cache` reseta `a11yAreas`/`a11ySpecs`/`tabOrderItems`/`a11ySwipePaths`
**e também `projectOrigin`** (volta a `null` — decisão deliberada: "Limpar Cache"
deve simular um arquivo novo por completo, incluindo perguntar a
plataforma de novo). `currentUser` é preservado (é identidade/configuração
de ambiente, não conteúdo do projeto).

## 2. As 5 categorias de spec

| Categoria (`a11yType`) | Label | Tag manual? | Equivalente mobile real? |
|---|---|---|---|
| `elemento` | Elementos e Imagens | Sim | Sim — 3 sub-variantes (ver seção 5) |
| `estrutura` | Estrutura da Página | Sim | **Não** — sem landmark semântico na lib mobile |
| `titulo` | Nível de Título | Não (usa nível como tag) | Sim — marcador único "H", sem hierarquia |
| `decorativo` | Elemento Decorativo | Não (badge fixo) | Sim |
| `informacoes` | Informações Adicionais | Sim | **Não** — categoria de formato livre, web-only |

Regra geral confirmada nesta sessão e válida para qualquer trabalho
futuro nessa área do código: **a origem (web/mobile) filtra tudo** — não
só o marcador visual e o card de spec, mas também qual catálogo de
componentes é sugerido/consultado, manual ou automático. Ver seção 6.

**Modal de escolha de categoria filtra por origem (2026-09-03).** A
documentação oficial da lib "Design Acessível | Super App" (confirmada por
screenshot real do usuário) define explicitamente só **3 categorias**
mobile: Elementos e Imagens, Título e Elemento Decorativo — sem nenhuma
menção a Estrutura da Página ou Informações Adicionais no contexto mobile,
o que bate com a tabela acima. `#a11y-category-picker-modal` (usado tanto
por "+ Nova spec", via `_openA11yCategoryPickerModalNow`, quanto pela troca
de categoria no wizard de revisão, via `openA11yWizardCategoryPickerModal`)
agora esconde os botões `#a11y-category-btn-estrutura` e
`#a11y-category-btn-informacoes` quando `getA11yProjectOrigin() === 'mobile'`
(`_applyA11yCategoryPickerOriginFilter()`, chamada nos dois pontos de
abertura antes de `openModal`, sempre reavaliando o estado atual — nunca
fica "preso" de uma renderização anterior). Origem `'web'` ou ainda não
definida (`null`) continua mostrando as 5 normalmente.

### Diferenças reais web vs. mobile por categoria

- **Nível de Título**: web usa H1-H6 (hierarquia real); mobile usa um
  identificador único "H", sem distinção de nível — porque React Native
  não tem o conceito de hierarquia de heading do HTML. O default do select
  já reflete a origem automaticamente (`_defaultTituloNivelForOrigin`).
- **Estrutura da Página**: sem equivalente mobile publicado — a lib
  "Design Acessível | Super App" não modela landmarks semânticos. Specs
  dessa categoria em projeto mobile continuam usando o wrapper desktop
  (comportamento aceito, não é bug).
- **Elementos e Imagens**: mobile tem 3 sub-variantes (Componente, Link,
  Texto Alternativo) com campos próprios — ver seção 5. Web usa o
  catálogo de 16 componentes curados da lib "Design Acessível" desktop.
- **Elemento Decorativo**: card real importado nas duas origens; conteúdo
  textual (Descrição/Notas de Código) é fixo/hardcoded na lib publicada em
  ambas — não editável via property, é limitação real do componente
  Figma, não do plugin.
- **Informações Adicionais**: categoria de formato livre, sem
  diferenciação documentada mobile/web.

### Campos padrão e limites de caracteres

Todo campo de texto livre do formulário tem `maxlength` + contador visível
(implementado em 2026-09-02):

| Campo | Limite | Observação |
|---|---|---|
| TAG (`elemento`/`estrutura`/`informacoes`) | 8 | Regex `^[A-Z]\d*(\.\d+)*$` — formato composto tipo "A1.1" para sequências longas dentro de uma área; **não é 3 caracteres** apesar de a maioria das tags reais ter 1-2 na prática |
| Label (accessibilityLabel) | 100 | Deve ser específico da função ("Buscar cartão"), não do tipo de componente |
| Componente "Outro" (desktop) | 80 | |
| Descrição (Estrutura/Informações, subtipo "Customizável") | 200 | Único ponto com edição livre nessas 2 categorias |
| Label de Área Marcada | 80 | |
| Descrição/Texto alternativo (mobile, variante "Texto Alternativo") | 180 | Alt-text — boas práticas recomendam conciso |
| Link/nome do componente (mobile, "Link do Componente") | 300 | Cobre tanto URL de deep-link (~60-100 chars) quanto nome digitado manualmente |
| Observações (toggle) | 400 | |
| Notas de Código (toggle) | 500 | |
| Dica para Leitor de Tela / accessibilityHint (mobile) | 300 | |

Campos obrigatórios (validados em `confirmA11ySpec`):
- Elemento web, catálogo normal: Label obrigatório.
- Elemento web, "Outro": Componente documentado + Label obrigatórios.
- Elemento mobile, variante "Componente": Link do Componente obrigatório.
- Elemento mobile, variante "Texto Alternativo": Descrição obrigatória.
- Elemento mobile, qualquer variante: Label sempre obrigatório.
- Demais categorias: sem obrigatoriedade além da Tag (quando aplicável).

## 3. Origem do projeto (web/mobile) — histórico de 3 decisões no mesmo dia

Esta é a mudança de arquitetura mais revisada da sessão de 2026-09-02.
Registrar o histórico completo é importante para não repetir o ciclo.

**Fase 1 (anterior a esta sessão): voto de maioria por área.** `area.origin`
era calculado a partir da proporção de componentes web vs. mobile
detectados dentro de cada Área Marcada, recalculado a cada "Reescanear".
Frágil: dependia de haver componentes reais suficientes detectados, e podia
mudar retroativamente entre scans da mesma área.

**Fase 2 (mesma sessão, revertida no mesmo dia): perguntar a cada ação.**
O voto de maioria foi removido e substituído por uma modal bloqueante
("Este handoff usa qual biblioteca?") perguntada **toda vez** que uma ação
precisava saber a origem: Marcar Área, Detecção Automática, Ordem de
Tabulação. Problema real descoberto em teste: quando "Marcar Área" tem
auto-detecção ligada, ela dispara a Detecção Automática **em sequência
imediata** — o designer via a mesma pergunta aparecer duas vezes seguidas,
indistinguível de um bug de loop.

**Fase 3 (estado atual): configuração única por projeto.** A origem é uma
característica do **arquivo inteiro**, nunca mista (confirmado
repetidamente pelo usuário: "se é um projeto mobile, tudo referencia
mobile"). Implementação:

- `getA11yProjectOrigin()` lê `hacData.projectOrigin`.
- `ensureA11yProjectOriginThen(onReady)` é o **ponto único** que toda ação
  que precisa da origem deve chamar: se já definida, chama `onReady(origin)`
  direto, sem abrir modal nenhuma; se não, abre a modal bloqueante uma
  única vez, persiste a resposta, e só então chama `onReady`.
- As 3 ações que precisavam disso (Marcar Área com auto-detecção,
  Detecção Automática, Ordem de Tabulação manual e automática) foram
  migradas para `ensureA11yProjectOriginThen` — nenhuma pergunta de novo
  depois da primeira vez.
- O fluxo **manual** de criação de spec ("+ Nova spec") lê
  `getA11yProjectOrigin()` diretamente (sem abrir modal — a origem já
  deveria estar definida a essa altura, pois toda spec pertence a uma
  Área já existente).
- Editável a qualquer momento via modal "Sobre o hac" → botão "Trocar"
  (`openA11yProjectOriginPrompt()`), que reabre a pergunta ignorando o
  valor atual.
- Resetada ao "Limpar Cache" (ver seção 1).

A função antiga da Fase 2 (`_askTabOrderOriginThen`) foi removida por
completo — sem consumidores restantes.

**Fase 4 (2026-09-04): escolha movida para a Home, em 2 etapas internas.**
Motivo: o conteúdo educativo do plugin (modal "Entendendo as categorias")
não sabia a origem no momento em que podia ser aberto, e resolvia isso
misturando texto de web e mobile no mesmo parágrafo — inconsistente com o
resto do app, que já filtra estruturalmente por origem
(`_applyA11yCategoryPickerOriginFilter`, todo o formulário de spec via
`modal.dataset.a11yOrigin`). Solução: a escolha Web/Mobile passa a
acontecer na própria `view-home`, ANTES do resumo do fluxo (que antes era
tudo que a Home mostrava) — a Home ganhou 2 telas internas, nunca as duas
visíveis ao mesmo tempo (`_renderA11yHomeOriginPicker`, `accessibility.js`,
via `classList.toggle('hidden', ...)` em `#a11y-home-step-origin`/
`#a11y-home-step-summary`, `home.html`):

- **Etapa 1** (`#a11y-home-step-origin`): objetiva — só uma descrição curta
  do que o plugin é (não do fluxo) + a escolha Web/Mobile
  (`chooseA11yHomeOrigin`). Nenhuma explicação de fluxo aqui, pra não
  competir com a decisão que precisa vir primeiro.
- **Etapa 2** (`#a11y-home-step-summary`): o antigo conteúdo único da Home —
  os 3 cards resumindo o fluxo (Marcar Área → Especificar → Ordem de
  Tabulação), um resumo da plataforma escolhida com link "Trocar", e o
  botão "Começar". Só aparece depois de uma plataforma escolhida (ou já
  salva de uma sessão anterior — arquivo já configurado pula direto pra
  esta etapa, nunca mostra a Etapa 1 de novo à toa).

`ensureA11yProjectOriginThen` continua existindo como fallback para
arquivos legados que ainda não passaram pela Home com esta versão (a
pergunta bloqueante antiga só reaparece nesse caso raro).

Novo ponto único de propagação: `setA11yProjectOrigin` passa a chamar
`_refreshUiForProjectOrigin()` toda vez que a origem muda (escolha inicial
na Home, ou troca via "Sobre o hac" → "Trocar") — atualiza o picker da
Home, o título do header secundário (`_applyA11yHeaderOriginTitle`,
`#a11y-header-title` em `specifications.html`, texto "Documentando projeto
Web/Mobile" no lugar do antigo "Acessibilidade" fixo — fallback pro texto
fixo em arquivos legados sem origem definida), o filtro de categorias do
seletor de Nova Spec, e o novo filtro do modal de categorias (abaixo).
Trocar a plataforma depois de já estar na tela de Acessibilidade atualiza
tudo in-place, sem voltar pra Home nem perder trabalho em andamento.

**Header secundário recebe um dropdown "Mais ações" (mesma mudança,
2026-09-04).** Com o título mais longo ("Documentando projeto Mobile"), os
3 ícones de ação que ficavam soltos no header (onboarding/`graduation-cap`,
guia de categorias/`circle-help`, recolher-expandir/`chevrons-up-down`)
foram recolhidos num único botão "Mais ações" (`toggleA11yMoreActionsMenu`/
`closeA11yMoreActionsMenu`, `accessibility.js` — mesmo padrão de
toggle/fechar-ao-clicar-fora/Escape já usado em
`toggleA11yComponenteMenu`). "Voltar" e "Marcar Área" continuam diretos no
header, sempre visíveis — são navegação/ação essencial, não action items
secundárias.

**Modal "Entendendo as categorias" ganha o mesmo filtro estrutural.**
`_applyA11yCategoriesHelpOriginFilter()` (`accessibility.js`), chamada por
`openA11yCategoriesHelp()`, esconde os blocos de "Estrutura da Página" e
"Informações Adicionais" quando mobile (mesmas 2 categorias já escondidas
no seletor de Nova Spec) e alterna, via `data-a11y-help-origin="web"/"mobile"`,
entre dois parágrafos de texto diferentes nas categorias "Nível de Título" e
"Elementos interativos e imagens" (que têm explicação relevante nas duas
plataformas, só que diferente) — nunca mais os dois parágrafos/menções
coexistindo no mesmo texto.

**Fase 5 (2026-09-04): `projectLib` — granularidade real por lib, não só
web/mobile.** Motivo: o hac já reconhece e mapeia 4 libs de produto
DISTINTAS internamente (`refs/_manifest.json`): `web-angular-react`
(legado), `super-dsc-web` (nova, sucessora do legado — as duas COEXISTEM na
mesma tela, migração de design system ainda em andamento), `super-app`
(mobile), `dsc-android` (mobile). O matching de componente
(`_resolveDscComponentA11yMatch`, `code.js`) já calcula e devolve a
identidade exata da lib (`sourceLib: {id, label}`, via
`_getDscComponentKeyToFrameMap`/`SOURCE_LIB_BY_SLUG`) — só a UI (Home,
header) ainda tratava tudo como 2 categorias amplas, o que ficava impreciso
justamente por causa da coexistência das 2 libs web.

Novo campo `hacData.projectLib` (`'web-angular-react' | 'super-dsc-web' |
'super-app' | null`) — **não substitui** `projectOrigin`, que continua
sendo a fonte de verdade pra toda a lógica binária já madura (formulário
mobile/desktop, seleção de componente de selo
`A11Y_ITEM_NUMBER_KEYS`/`_MOBILE`, filtro de categorias) — nada disso foi
tocado. `setA11yProjectLib(lib, opts)` grava `projectLib` E o
`projectOrigin` derivado (via `A11Y_LIB_TO_ORIGIN`) juntos, sempre no mesmo
ponto, garantindo que os dois nunca ficam dessincronizados.
`getA11yProjectLib()` devolve `null` em arquivo legado (salvo antes desta
versão, só com `projectOrigin`) — todo consumidor de `projectLib` tem
fallback pro comportamento genérico anterior nesse caso.

`dsc-android` continua reconhecida no matching de componentes (como já
era) mas **não é uma opção de escolha** — decisão explícita do usuário,
escopo desta mudança é só as 3 libs do fluxograma fornecido.

**Home: Web/Mobile continua sendo o primeiro nível, lib web vira
sub-seleção.** Correção de rumo no mesmo dia: a primeira versão desta
mudança colocou as 3 libs lado a lado na Etapa 1 — o usuário pediu de volta
a decisão em 2 níveis (é mais natural pensar "Web ou Mobile" primeiro).
Estrutura final, 3 etapas na Home (`home.html`,
`_renderA11yHomeOriginPicker`/`_showA11yHomeWebSublibStep`/
`_hideA11yHomeWebSublibStep`, `accessibility.js`):
- **Etapa 1** (`#a11y-home-step-origin`): só Web ou Mobile. Mobile resolve
  direto (`chooseA11yHomeOrigin('super-app')` — única lib mobile real hoje,
  sem sub-tela). Web avança pra Etapa 1b.
- **Etapa 1b** (`#a11y-home-step-web-sublib`): sub-escolha entre as 2 libs
  web que coexistem hoje (`web-angular-react` legado, `super-dsc-web`
  novo) — só aparece depois de "Web", com "Voltar" pra Etapa 1.
- **Etapa 2** (resumo + Começar): igual à versão anterior.

**Header**:
`_applyA11yHeaderOriginTitle()` agora mostra o rótulo exato da lib
(`A11Y_LIB_LABELS`, ex: "Super DSC Mobile") quando `projectLib` existe;
fallback genérico "Acessibilidade · Web/Mobile" em arquivo legado.
**Trocar depois** (`openA11yProjectOriginPrompt`, "Sobre o hac" → Trocar):
em vez de reabrir um modal pequeno com 2 botões fixos, navega pra Home e
força a Etapa 1 aparecer (`window._a11yForceHomeOriginStep`, consumido uma
única vez por `_renderA11yHomeOriginPicker`) — reaproveita a mesma UI de
escolha das 3 libs, sem duplicá-la em dois lugares. O modal antigo
(`#a11y-post-area-detect-modal`) continua existindo só para
`ensureA11yProjectOriginThen` (fallback legado) e `rescanA11yBatchArea`
(decisão pontual de varredura, sempre web/mobile binário — não precisa da
granularidade de lib).

**Onboarding em 2 camadas.** Camada 1 (`ONBOARDING_TOOLS.especificar`,
`onboarding.js`, já existente) cobre o fluxo geral de ponta a ponta.
Camada 2 (NOVA): uma entrada por lib (`lib-web-angular-react`,
`lib-super-dsc-web`, `lib-super-app`), disparada uma única vez por
`chooseA11yHomeOrigin` logo após a escolha (`openOnboarding('lib-' + lib,
{markSeenOnOpen: true})`) — mesmo mecanismo de modal stepper já existente,
sem infraestrutura nova. Conteúdo de cada uma é extraído do que já existia
espalhado no modal "Entendendo as categorias" (não é texto novo, só
reorganizado por lib específica em vez de por família web/mobile): as 2
libs web cobrem as 5 categorias reais (H1-H6, elementos interativos
padrão); `lib-super-app` cobre as particularidades mobile (só 3 categorias,
título sem hierarquia, 3 sub-variantes de Elementos e Imagens).

**Atualização (2026-09-04): "Swipe" saiu do "fora de escopo" e foi
implementado** — ver seção "Workspace de Área (2026-09-04)" mais abaixo
para o desenho completo (pipeline de captura de ordem de swipe, exclusivo
mobile, espelhando o de Ordem de Tabulação). Os selos de marcação da lib
"Design Acessível" (Agrupamento, Conectores, Item Number) continuam
binários (desktop/mobile) — não há hoje nenhum dado sugerindo variantes
por uma lib de produto específica; diferenciá-los exigiria investigação
nova direto no arquivo Figma da lib de marcadores (fileKey
`3zdtN13YvPlCGPdXeL0Y2i`).

**Exceção deliberada: "Reescanear" dentro do resumo da Detecção Automática.**
`rescanA11yBatchArea()` (botão de reescanear no modal de resumo do lote,
`#a11y-post-area-detect-modal`) **não** chama `ensureA11yProjectOriginThen`
— ela zera `pending.declaredOrigin` e força a modal de origem a reabrir
manualmente (`_setA11yPostAreaModalStage('origin')`), mesmo com
`hacData.projectOrigin` já definido. Decisão explícita do usuário: a lib
pode ter mudado entre uma varredura e outra, então cada Reescanear pergunta
de novo qual plataforma usar para aquela passada específica — a resposta do
Reescanear não sobrescreve `hacData.projectOrigin` (só o campo local
`pending.declaredOrigin`, usado só para retropreencher Título/Decorativo
daquela varredura). Não é um bug nem uma regressão da regra "pergunta uma
vez por arquivo" — é a única ação que legitimamente pergunta de novo, e só
porque o gatilho (reescanear) é, por definição, uma tentativa de capturar
mudanças no arquivo/lib desde a última pergunta.

## 4. `needsReview`

Campo boolean em cada spec. Hoje só é setado `true` em um cenário real:
migração retroativa de "Elementos e Imagens" mobile pré-sub-variantes
(`_migrateA11yElementoMobileVariants`, aditiva, não sobe
`_schemaVersion`) — quando a heurística de inferência cai no fallback mais
arriscado (não consegue determinar a variante com confiança).

Toda spec criada pelo wizard de revisão individual (Detecção Automática)
nasce sempre com `needsReview: false`, mesmo que a detecção original
tivesse baixa confiança — a revisão humana item a item já substitui
qualquer necessidade de sinalização automática de "confira depois". O
conceito de "confiança alta/baixa" foi removido da UI inteira em
2026-09-02 (badges de confiança no resumo do lote) pela mesma razão: com
revisão individual obrigatória, a distinção virou ruído sem efeito
prático.

## 5. Elementos e Imagens mobile — 3 sub-variantes

Estrutura real do componente Figma `[a11y mob] Box specs leitor de tela`
(variante "Conector = Elementos e imagens"), com property `Variante`
(VARIANT): `componente` | `link` | `texto alternativo`.

- **Componente**: Descrição/Nome acessível/Dica Leitor de Tela/Observação
  (toggles opcionais) + **Link do Componente** (sempre visível, sem
  toggle — instância aninhada real do wrapper). O dropdown de 64 nomes
  reais de componentes DSC vem pré-selecionado automaticamente quando o
  `dscComponentName` já resolvido bate por nome exato com um dos 46
  nomes que têm `nodeId` conhecido (gerando também a URL de deep-link
  automaticamente); os outros 18 nomes divergem editorialmente entre a
  lib real e a lista curada — ficam manuais ("Personalizado"). **Trava do
  campo de texto (2026-09-02)**: sempre que o `<select>` aponta para
  qualquer opção diferente de "Personalizado" (match automático ou
  escolha manual do designer dentre os 64 nomes), o campo de texto
  "Link ou nome do componente" vira `readOnly` (não `disabled` — precisa
  continuar legível por `_collectA11yElementoMobileToggleProperties`),
  com hint visual de cadeado. Só fica editável quando "Personalizado"
  está selecionado — é o único caminho para documentar manualmente um
  componente fora do catálogo. Sincronizado em 3 pontos:
  `_syncA11yMobileLinkUrlLockState()` chamada no render inicial, no
  handler `change` do select, e ao final da restauração em modo edição
  (`_restoreA11yElementoMobileToggles`).
- **Link**: Descrição fixa e travada ("Identificar como link e anunciar
  que o link abre uma nova janela..."), Nome acessível/Observação opcionais.
- **Texto Alternativo**: Descrição livre **obrigatória** (alt-text real da
  mídia), Observação opcional.

O campo `Nome acessível`/`Nome Acessível` foi consolidado: existia como
toggle duplicado dentro de "Campos exclusivos mobile" e também como o
campo "Label" do topo do formulário — ambos alimentavam o mesmo
`accessibilityLabel`. O toggle mobile foi removido; "Label" do topo é
agora a única fonte, e seu valor liga o toggle BOOLEAN real do
componente (`Nome acessível#5366:0`).

**Mesmo padrão aplicado ao desktop/web em 2026-09-02.** O formulário
desktop de "Elementos e Imagens" tinha o mesmo problema: o checkbox
dinâmico "Nome Acessível" (um dos toggles renderizados por
`_renderA11yElementoToggles`/`_getA11yComponentToggles`, a partir da
property BOOLEAN real do componente DSC selecionado, catálogo
`A11Y_COMPONENT_PROPERTIES`) duplicava o campo "Label
(accessibilityLabel)" sempre visível no topo. Diferença estrutural do
mobile: no desktop o toggle "Nome Acessível" não é fixo — só existe
quando o componente escolhido de fato tem essa property BOOLEAN na lib
(nem todos têm). `_renderA11yElementoToggles` agora filtra esse toggle
específico fora da lista antes de montar o HTML (`t.key !==
'nomeAcessivel'`), mantendo os demais toggles reais do componente
(Observações, Notas de Código etc.). Em compensação,
`_buildA11yElementoPayload` passou a injetar
`{ key: 'nomeAcessivel', value: label }` em `properties[]`
automaticamente a partir do Label do topo, para TODO componente — mesmo
os que não têm a property real. Isso é seguro porque o backend
(`code.js`, ~linha 1042-1086) já ignora silenciosamente properties
dinâmicas sem `toggleDef` correspondente no componente
(`toggleMap[p.key]` ausente → `continue`), e `_infoLines` (fallback que
joga sobras em Observações) já exclui as 3 chaves de `_dynamicToggleKeys`
(`nomeAcessivel`/`observacoes`/`notas`) do que sobra — logo o valor
nunca aparece duplicado em specs de componentes sem a property. Portanto
Label do topo é hoje a ÚNICA fonte de `accessibilityLabel`/Nome
Acessível em AMBAS as origens (web e mobile), não só mobile.
`_restoreA11yElementoToggles` (equivalente desktop de
`_restoreA11yElementoMobileToggles`) ganhou a mesma migração best-effort:
ao reabrir uma spec desktop antiga que tinha os dois campos preenchidos
com valores divergentes (cenário legado, quando ainda coexistiam), se o
Label do topo estiver vazio no restore usa o `nomeAcessivel` salvo pra
preenchê-lo; se o Label já tiver valor, ele sempre prevalece — o
checkbox removido não volta a aparecer nessa migração, só o dado é
aproveitado silenciosamente.

**Bug real corrigido em 2026-09-02**: o toggle BOOLEAN ligava
corretamente, mas o TEXTO da sub-instância continuava sendo o
placeholder publicado da lib ("Inserir o seguinte accessibilityLabel no
elemento: [insira aqui o nome acessível, se necessário]."), nunca o
valor real digitado — mesmo bug nos outros 3 campos desta variante
(Descrição/Dica Leitor de Tela/Observação), não só em Nome Acessível.
Causa raiz: `_fillA11yMobileElementosEImagensFields` (`code.js`)
buscava um TEXT node cujo nome de CAMADA batesse com um regex
(`/descri/i`, `/dica/i`, `/observ/i`, `/nome\s*acess/i`) — mas a árvore
real (`GET /v1/files/3zdtN13YvPlCGPdXeL0Y2i/nodes?ids=5362:961&depth=10`)
não tem TEXT nodes com esses nomes: cada campo é uma INSTANCE aninhada
("Descrição"/"Nome acessível"/"Dica para Leitor de Tela"/"Observações")
cujos dois TEXT filhos se chamam sempre "Label"/"Text" — genéricos,
iguais em todas as sub-instâncias — então o `findOne` por nome nunca
encontrava nada. O conteúdo real é uma component property de texto
própria de cada sub-instância (`Texto#7316:0`), o mesmo padrão já usado
para "Link do Componente" (`Texto#7157:0`). Correção: novo helper
`_findNestedInstanceByName` acha a INSTANCE pelo nome dela (não pelo
TEXT filho), e o preenchimento passou a usar `setProperties` na
property `Texto` da sub-instância — igual ao caminho de "Link do
Componente", que já funcionava. As variantes "Título"/"Elemento
decorativo" mobile não tinham esse bug: usam
`_findTextNodeByCurrentValue` (busca por valor-padrão atual do TEXT, não
por nome de camada), técnica que já contornava corretamente o mesmo
problema estrutural.

## 6. Matching DSC → categoria de acessibilidade

### As 6 libs conhecidas

**Libs de matching/detecção** (categorizam instâncias reais no canvas do
designer — servem só como referência de nome/origem, nunca são a fonte
do componente importado):
- `web-angular-react` → origin `web`
- `super-dsc-web` → origin `web`
- `super-app` → origin `mobile`
- `dsc-android` → origin `mobile` (recadastrada em 2026-09-02 após bug
  real de "Icon Button" sendo classificado como "Elemento Decorativo" por
  a lib nunca ter sido mapeada — foi cadastrada, testada e removida uma
  vez em 2026-08-26, e recadastrada nesta sessão)

**Libs de componentes reais** (fonte de fato dos wrappers/marcadores
importados pro canvas):
- Desktop: "Design Acessível" (fileKey `Wy0IhXRVZMSOOr8E609UqI`)
- Mobile: "Design Acessível | Super App - React Native" (fileKey
  `3zdtN13YvPlCGPdXeL0Y2i`)

### Filtro por origem (corrigido nesta sessão)

Até 2026-09-02, o matching de categoria (`_getDscFrameToA11yMap`) usava um
único `Map` global fundindo os 4 buckets de mapeamento a11y (das 4 libs
de detecção), chaveado só por nome de component set — sem filtrar por
origem. Isso permitia, em tese, colisão silenciosa se duas libs de
plataformas diferentes tivessem o mesmo nome de frame com categorias
diferentes.

**Corrigido**: dois Maps separados por plataforma
(`_dscFrameToA11yMapWeb`/`_dscFrameToA11yMapMobile`), e
`_resolveDscComponentA11yMatch` já sabe a origem do componente (via
`_getDscComponentKeyToFrameMap`, que nunca tem ambiguidade — component
keys não colidem entre libs) **antes** de consultar o mapa de categoria —
agora consulta só o mapa da própria plataforma. Um componente que só
bate por nome na lib da plataforma errada agora corretamente vira
`isUnmapped: true` em vez de herdar uma categoria da lib errada.

### Princípio: componente real sempre, procedural só como último recurso

`_tryImportA11yComponent` lança exceção em qualquer ponto de incerteza; o
chamador trata como "cai no card procedural" **só** para uma whitelist
fixa de razões esperadas (`_A11Y_EXPECTED_FALLBACK_PREFIXES`):
`a11y-elemento-outro-sem-componente-real`,
`a11y-titulo-mobile-sem-variante-real` (não mais atingido — a key
correta do wrapper mobile foi corrigida nesta sessão),
`a11y-informacoes-customizavel-sem-variante-real`,
`a11y-estrutura-variacao-sem-import-real`,
`a11y-estrutura-marco-customizavel-sem-conteudo-catalogado`. Qualquer
outra falha gera erro visível ao designer (nunca falha silenciosa).

**Bug real corrigido em 2026-09-02**: a key usada para importar o wrapper
mobile do card de spec (`[a11y mob] Box specs leitor de tela`) era a key
do **COMPONENT_SET** (família), não de uma variante individual —
`figma.importComponentByKeyAsync` exige key de `COMPONENT`, não de
`COMPONENT_SET`. Corrigido usando as 3 keys reais das variantes
(Elementos e imagens / Títulos / Elementos decorativos), extraídas via
API e mapeadas por categoria (`componentKeyByA11yType`).

**Preenchimento fino de campos internos**: implementado para as 3
categorias cobertas pelo wrapper mobile (Elementos e Imagens, Títulos,
Elementos Decorativos). Títulos e Elementos Decorativos só expõem uma
property `Observações` (BOOLEAN) internamente — Descrição e Notas de
Código são conteúdo fixo hardcoded na lib publicada, sem property exposta
para sincronizar (limitação real da lib Figma, confirmada via API, não
uma lacuna do plugin).

### "Componente DSC" como link de referência (2026-09-02)

O campo read-only "Componente DSC" no cabeçalho do modal (comum às 5
categorias, `#a11y-modal-dsc-component-name`) vira um link clicável
(`<a target="_blank">`, abertura nativa de aba pelo iframe da UI — sem
`figma.openExternal`, que não existe hoje no código) para o componente
real na lib do Figma, **só quando** `_renderA11yModalDscComponentName`
consegue montar um deep-link com confiança via
`A11Y_MOBILE_COMPONENT_LINK_NODE_IDS` (o mesmo dicionário de 46/64 nomes
usado na pré-seleção do dropdown mobile — ver seção 5).

**Limitação real confirmada** (não é lacuna de implementação): esse
dicionário só existe para a lib mobile (`super-app.json`, extraído com
`containingFrameNodeId`); os JSONs das libs web não têm esse campo. Logo
specs de projeto web nunca ganham link (cai no texto puro, comportamento
anterior preservado), e mesmo em mobile os 18/64 nomes sem match seguro
também ficam só como texto. Se os dados de extração web forem
enriquecidos no futuro, `_renderA11yModalDscComponentName` deve ser
revisitada para também cobrir esse caso.

### "Outro" (componente não mapeado)

Quando `_resolveDscComponentA11yMatch` encontra um `componentKey` real de
um componente DSC, mas sem categoria de a11y catalogada
(`isUnmapped: true` — ex: `[dsc] Card`, `[dsc] Tooltip`), a Detecção
Automática sugere "Outro (nome do componente)". Isso é a intenção de
sinalizar para a vertical de acessibilidade que aquele componente precisa
ganhar uma spec formal na lib — **mas hoje não existe nenhum processo
institucional automatizado que capte esse sinal**; é só um rótulo visível
na tela de revisão do designer. Se um processo formal (planilha, fila,
relatório) for definido no futuro, este documento deve ser atualizado com
o mecanismo real.

## 7. Fluxos de criação de spec

### Manual ("+ Nova spec")
`openA11yCategoryPickerModal` → checagem de vínculo da lib
(`check-a11y-library`) → `chooseA11yType(category)` → `openA11yModal`.
Desde 2026-09-02, `a11yOrigin` vem de `getA11yProjectOrigin()` (a
configuração já definida do projeto), não mais hardcoded como `'web'`.

### Detecção Automática (wizard sequencial de revisão)
Substituiu, em 2026-08-31, o antigo loop de criação em lote sem revisão.
TODO item detectado — sem exceção de categoria (Título e Decorativo
também, que antes tinham default automático) — passa por
configuração/confirmação individual antes de virar spec real:

1. `openA11yBatchSummaryModal()` é só a tela de entrada — escolher a Área
   de destino, ver contagem agregada. Botão "Iniciar Revisão" chama
   `startA11yBatchWizard()`.
2. `startA11yBatchWizard()` monta um snapshot em memória
   (`window._a11yBatchWizardState` — nunca persistido, nunca escreve na
   fonte bruta de detecções) e chama `_advanceA11yBatchWizard()`.
3. Cada item abre o formulário normal (`openA11yModal`), com indicador de
   progresso "Item N de M", botões "Focar" (destaca o elemento no
   canvas) e "Descartar" (pula sem criar spec), e o paginador (ver 3.2).
3.1. **Correção de categoria durante a revisão (2026-09-02, revisado no
   mesmo dia)**: quando `window._a11yBatchWizardState` está ativo, um ícone
   de alterar (`arrow-left-right`, Lucide — escolhido para não repetir o
   `pencil` já usado por `editA11ySpec` na listagem principal, que tem
   significado diferente: "editar uma spec salva") aparece ao lado do
   título da categoria no cabeçalho do modal
   (`#a11y-modal-category-edit-btn`). Ao clicar, chama
   `openA11yWizardCategoryPickerModal()`, que reabre o MESMO modal de
   escolha de categoria do fluxo manual "+ Nova spec"
   (`#a11y-category-picker-modal`, cards com ícone/cor por categoria — 5 em
   projeto web, 3 em projeto mobile, ver filtro por origem na seção 2),
   só que pulando a checagem `check-a11y-library` (a lib já está garantida
   — o item só existe porque a Detecção Automática rodou) e com o título
   trocado para "Alterar Especificação" (`#a11y-category-picker-title-text`,
   volta para "Nova especificação" em `_openA11yCategoryPickerModalNow`, o
   caminho normal do "+"). A flag `window._a11yCategoryPickerWizardSwitch`
   marca esse modo; `chooseA11yType(category)` (handler dos 5 cards) checa
   a flag e desvia para `switchA11yWizardCategory(category)` em vez de abrir
   um formulário novo do zero. `switchA11yWizardCategory` reabre o mesmo
   `openA11yModal` para o mesmo `targetNodeId`/`a11yAreaId`/`a11yOrigin`, só
   com os campos da nova categoria (em estado default — não há
   correspondência semântica entre campos de categorias diferentes, então
   nada é migrado). Existe **só durante o wizard**: na edição normal de uma
   spec já salva (fora do wizard) não há esse ícone — decisão deliberada do
   usuário, já que ali o erro é raro (spec criada manualmente) e o caminho
   aceito é apagar e recriar. O `<select>` inline (`#a11y-modal-category-picker`)
   e `toggleA11yWizardCategoryPicker` da primeira versão foram removidos —
   substituídos pelo modal de cards reaproveitado.
3.2. **Navegação livre + campo de posição editável (2026-09-02, reformulado no
   mesmo dia)**: a revisão deixou de ser estritamente sequencial.
   `window._a11yBatchWizardState.confirmed` e `.discarded` são `Set`s de
   ÍNDICES da `queue` (não os próprios itens) — permitem consultar o status
   de qualquer posição em O(1) sem depender de `currentIndex` já ter
   passado por ali. No cabeçalho do modal (`#a11y-modal-wizard-paginator`),
   o formato é **"Voltar [ campo numérico ] Avançar"**, centralizado:
   - Botões `#btn-a11y-wizard-prev`/`#btn-a11y-wizard-next` chamam
     `_stepA11yWizardItem(-1)`/`_stepA11yWizardItem(1)`, que navegam
     SEMPRE por posição na fila (`currentIndex ± 1`) — desabilitados nos
     limites (`disabled` quando `currentIndex === 0` ou
     `=== queue.length - 1`). Diferente de `_advanceA11yBatchWizard`
     (usado só após Aplicar/Descartar), Voltar/Avançar nunca pulam
     pendentes: é navegação manual item a item, qualquer status.
   - `#a11y-wizard-index-input` (`type="text" inputmode="numeric"` — não
     `type="number"`, que dentro do iframe do Figma tem setas incrementais
     com comportamento inconsistente) mostra o índice 1-based
     (`currentIndex + 1`), editável. Ao confirmar (Enter, que só chama
     `.blur()`, ou blur direto), `_commitA11yWizardIndexInput(value)`
     valida inteiro entre 1 e `queue.length`; se válido e diferente do
     atual, chama `_openA11yWizardItemAt(valor - 1)`; se inválido (vazio,
     não numérico, fora do range) ou igual ao atual, apenas
     re-renderiza o campo pro valor real (`_renderA11yWizardPaginator`) —
     nunca deixa o input num estado inconsistente. Não existe botão "Ir"
     separado.
   - `#a11y-wizard-index-total` mostra "de M" ao lado do campo — o total
     continua sempre visível, como já era no formato antigo.
   - `_renderA11yWizardPaginator(state)` agora só sincroniza esses 4
     elementos (valor do input, total, disabled dos dois botões) — não
     gera mais HTML dinâmico via `innerHTML`; a estrutura em si é estática
     em `modals.html`, então `_resetA11yBatchWizardUi` não limpa mais
     `paginator.innerHTML` (limparia os botões/input fixos).
   - `jumpToA11yWizardItem(index)` (pulo direto por índice, wrapper de
     `_openA11yWizardItemAt`) continua existindo como utilitário público,
     mas não tem mais chamador de UI — o paginador numérico clicável foi
     removido. Status do item atual (documentado/descartado) não desapareceu:
     `#a11y-modal-wizard-progress` ("Item N de M") ganhou sufixo
     (" — Documentado"/" — Descartado") e cor (verde/cinza) quando aplicável,
     compensando a perda do sinal visual que os botões numéricos davam para
     *outras* posições da fila (esse sinal — status de itens fora do atual
     à primeira vista — foi um trade-off aceito ao trocar pro formato
     Voltar/campo/Avançar; só o item atual sinaliza status agora).
   Reabrir um item **confirmado** mantém o formulário
   visível (com os presets originais da detecção, não os dados salvos da
   spec — não há reuso de `editA11ySpec` aqui), mas o botão "Aplicar" vira
   "Documentado" e fica desabilitado (`_applyA11yWizardModalUi`) — nunca é
   possível confirmar duas vezes o mesmo item e duplicar a spec. Reabrir um
   item **descartado** reabre totalmente editável — navegação livre inclui
   poder reconsiderar um descarte e aplicar depois. `_advanceA11yBatchWizard`
   (chamado após Aplicar/Descartar) agora busca o próximo item PENDENTE
   (`_findNextA11yWizardPendingIndex`, nem confirmado nem descartado) a
   partir de `currentIndex + 1`, com wraparound — não é mais só
   `currentIndex++`. A revisão só é considerada concluída (fecha o modal,
   mostra o resumo) quando não sobra nenhum pendente na fila inteira, não
   mais quando `currentIndex` chega ao fim. `stopA11yBatchWizard` calcula
   `remaining` como `queue.length - confirmed.size - discarded.size`
   (contagem real de pendentes), pelo mesmo motivo.
3.3. **Foco automático no canvas ao trocar de item (2026-09-02)**:
   `_openA11yWizardItemAt` (ponto único usado tanto por
   `_advanceA11yBatchWizard` quanto por `jumpToA11yWizardItem`) chama
   `focusA11yWizardCurrentNode()` ao final — mesmo scroll+highlight que o
   botão "Focar" já fazia manualmente. Antes disso, avançar pra o próximo
   item (Aplicar/Descartar) ou pular pelo paginador trocava o formulário
   sem mover a viewport, obrigando o designer a clicar em "Focar" a cada
   item numa área com muitos componentes.
4. `confirmA11ySpec()` no modo wizard força `needsReview: false` e
   **aguarda** a resposta real `spec-created` antes de avançar (evita
   duas criações concorrentes colidindo) — diferente do fluxo manual
   normal, que é fire-and-forget.
5. Cancelar a revisão (botão "Cancelar", X, Esc) preserva as
   specs já confirmadas; itens ainda não vistos voltam automaticamente
   para "Não Documentados" (a fonte bruta nunca foi tocada).
5.1. **Distinção Cancelar explícito vs. fechamento acidental (2026-09-02)**:
   `closeA11yModal()` (X, Esc) chama `stopA11yBatchWizard(false)`;
   o botão "Cancelar" do formulário chama `cancelA11yModalExplicit()` →
   `stopA11yBatchWizard(true)`. Só o primeiro caso (fechamento não
   explícito) oferece retomada: se ainda restam itens na fila, o toast vira
   um `showSnackbar(...)` com botão de ação "Continuar revisão". Clicar
   nele chama `_resumeA11yBatchWizardForArea(areaId)`, que dispara um NOVO
   scan da área (`openA11yPostAreaDetectModal`, mesmo caminho da Detecção
   Automática normal — nunca reaproveita a fila antiga em memória, porque o
   canvas pode ter mudado) e seta `window._a11yResumeWizardAfterScan = true`.
   Quando o resultado do scan chega em
   `handleA11yPostAreaDetectionResult`, essa flag faz pular direto para
   `startA11yBatchWizard()` sem exigir que o designer veja o modal de
   resumo de novo. O dedupe por `targetNodeId` contra specs já confirmadas
   (`_filterA11yBatchEligible`/`_getDocumentedNodeIdsForArea`) continua
   valendo automaticamente, por reaproveitar o mesmo caminho de scan.
   Clicar em "Cancelar" explicitamente, ou não haver itens restantes,
   mantém o toast informativo simples, sem oferta de retomada.
   `showSnackbar` (core.js) ganhou suporte a `options.actionLabel`/
   `options.onAction` para viabilizar esse botão — clicar na ação também
   fecha o snackbar.

## 8. Ordem de Tabulação

### Organização em Sections dedicadas (2026-09-02)
O hac usa **duas Sections distintas** no canvas, cada uma com um propósito
próprio no painel de Layers — nunca uma mistura das duas:

- `"hac — Especificações de Acessibilidade"` (`A11Y_SECTION_NAME`,
  `_getOrCreateA11ySection`/`_reparentIntoA11ySection`, `code.js`): Áreas
  Marcadas + specGroups de todas as categorias.
- `"hac — Ordem de Tabulação"` (`A11Y_TAB_ORDER_SECTION_NAME`,
  `_getOrCreateTabOrderSection`/`_reparentIntoTabOrderSection`, `code.js`):
  só as cópias de frame criadas por `_createTabOrderCloneForArea` (uma por
  Área Marcada com Ordem de Tabulação já trabalhada) e os selos numerados
  desenhados dentro delas. Motivo de ser separada da Section de specs:
  dezenas de selos/conectores de spec se misturariam visualmente, no
  Layers, com cópias inteiras de tela — cada Section fica pequena e legível
  no seu próprio escopo.

As duas Sections compartilham a mesma lógica estrutural via um helper
genérico (`_getOrCreateNamedSection(sectionName)`), incluindo reforçar que
cada uma fica no topo da pilha de `figma.currentPage.children` a cada
acesso (senão o design original coberto por reordenação manual no Layers
passaria a ficar por cima dos marcadores visuais). `_reparentIntoSection(node,
getSection)` é o helper de reparenting genérico por trás de
`_reparentIntoA11ySection`/`_reparentIntoTabOrderSection` — mesmo cálculo
de x/y-relativo-ao-novo-pai (`x/y absolutos atuais − x/y da Section`) nos
dois casos.

### Section versionada — reconhecimento de documentação existente (2026-09-03)
**Motivo de negócio**: um designer pode abrir um arquivo que outro designer
já documentou por completo (Áreas, specs, Ordem de Tabulação). Na prática
isso quase sempre significa duplicar o frame principal e especificar essa
cópia — não "documentar por cima" da estrutura antiga. Sem nenhum
tratamento, a nova Área cairia dentro da MESMA Section única, misturando
visualmente (no painel de Layers) o handoff antigo com o novo.

O nome da Section de specs deixou de ser só a constante fixa
`A11Y_SECTION_NAME` — `hacData.activeSectionName` (`core.js`, novo campo,
default `null`, mesmo padrão de configuração simples de projeto que
`projectOrigin`) guarda o nome ATIVO escolhido pelo designer nesta sessão.
`null` = ainda não escolhido explicitamente, resolve pro nome fixo original
sem nenhuma migração (arquivos salvos antes desta versão continuam
funcionando de forma idêntica). `getA11yActiveSectionName()`/
`setA11yActiveSectionName()` (`accessibility.js`) são os helpers análogos a
`getA11yProjectOrigin()`/`setA11yProjectOrigin()`.

**Backend** (`code.js`): `_getOrCreateA11ySection(sectionName)` e
`_reparentIntoA11ySection(node, sectionName)` passam a aceitar o nome como
parâmetro, com `A11Y_SECTION_NAME` como default quando omitido/vazio.
`_getOrCreateTabOrderSection(sectionName)`/`_reparentIntoTabOrderSection`
aplicam o MESMO sufixo de versão à Section de Ordem de Tabulação
(`_extractA11ySectionVersionSuffix`), mantendo as duas Sections de uma
mesma geração de documentação juntas e coerentes. Os handlers que criam nós
dentro da Section (`create-a11y-area`, `create-unified-spec` via
`opts.sectionName`, `start-tab-order-copy`, `generate-tab-order-from-layers`,
`apply-tab-order-to-canvas`) passam a receber `sectionName` no payload, com
fallback pro nome fixo se ausente. `_collectA11yOccupiedBounds` (cálculo de
"faixa livre" pra novas cópias de Ordem de Tabulação) varre TODAS as
Sections com o prefixo `A11Y_SECTION_NAME`/`A11Y_TAB_ORDER_SECTION_NAME`
existentes na página (qualquer geração), não só a ativa — o objetivo ali é
nunca sobrepor NADA já desenhado, incluindo handoffs antigos.

**Cálculo do próximo nome versionado**: `_computeNextA11ySectionName()`
(`code.js`) varre `figma.currentPage.children` por Sections cujo nome
comece com o prefixo base, extrai o sufixo de versão de cada uma (sem
sufixo = v1 implícito, a Section original) e devolve o próximo número livre
(`"hac — Especificações de Acessibilidade v2"`, `v3`...).

**Fluxo de reconhecimento**: novo handler `get-a11y-documentation-status`
(UI→backend), consultado por `openA11yAreaModal` (`accessibility.js`) toda
vez que o modal "Marcar Área" abre — via `_getA11yDocumentationStatus()`,
mesmo padrão de round-trip com Promise/timeout que `_getA11ySelectionInfo`.
A fonte de verdade é sempre o CANVAS (`figma.currentPage.children`), não só
o array `a11yAreas` em memória do frontend — cobre o caso de um arquivo com
Section de uma sessão anterior do plugin, aberto pela primeira vez nesta
sessão. Resposta (`a11y-documentation-status`): `activeSectionName`,
`hasDocumentation` (boolean — a Section ativa tem pelo menos 1 Área
Marcada dentro), `areaCount`, `nextSectionName` (sugestão já calculada).

Se `hasDocumentation` for `true`, o modal `a11y-area-modal` (mesma modal de
sempre, sem modal novo) revela um bloco de aviso
(`#a11y-area-existing-doc-notice`, `hidden` por padrão) com o nome/contagem
da Section atual e dois botões: **"Continuar na Section atual"** (default,
comportamento idêntico ao de hoje) e **"Iniciar nova Section"** (marca a
escolha visualmente; a troca real de `hacData.activeSectionName` só se
efetiva ao confirmar `confirmA11yArea` — cancelar o modal não deixa a
Section ativa trocada silenciosamente). Se o arquivo estiver vazio (nenhuma
Área documentada ainda), o aviso nunca aparece — o modal funciona
exatamente como antes desta feature.

**Fora de escopo** (decisão explícita): restaurar/reverter pra uma Section
antiga como ativa; comparar/navegar entre gerações na listagem do plugin
(a listagem principal de Áreas continua mostrando todas as áreas de todas
as Sections juntas — a separação é só no canvas/Layers); aviso automático
no boot do plugin (`init-plugin`) — só no momento de Marcar Área.

`_createTabOrderCloneForArea` reparenta o clone pra dentro da Section de
Ordem de Tabulação **depois** de calcular a posição livre e montar o mapa
original→clone (`_buildOriginalToCloneMap`) — os dois dependem do clone
ainda solto em `figma.currentPage` com x/y absolutos batendo com o
bounding box usado no cálculo; o mapeamento por índice de `children`
também não é afetado por reparenting (a estrutura interna do clone não
muda). Os selos individuais (`_createTabOrderBadge`) continuam sendo
reparentados pra dentro da **cópia do frame**, nunca diretamente pra
Section — não mudou nada nessa relação selo→cópia; só a estrutura de mais
alto nível mudou (cópia agora dentro de uma Section, em vez de solta na
página).

**Cálculo de posição livre dentro da Section**: como as cópias passaram a
viver dentro de uma Section (não mais soltas em `figma.currentPage` como
itens de topo de nível), `_collectA11yOccupiedBounds` deixaria de "ver"
cada cópia individualmente — usar só o bounding box da Section inteira
distorceria o cálculo (uma Section com 3 cópias lado a lado tem bounds bem
diferentes de 3 retângulos individuais, e a próxima cópia podia acabar
sobrepondo as existentes em vez de entrar ao final da faixa). Correção:
`_collectA11yOccupiedBounds` agora soma explicitamente o bounding box de
cada FILHO da Section de Ordem de Tabulação (`tabOrderSection.children`),
mesmo padrão já usado para os `hacAreaTargetNodeId` da Section de specs.
`_findFreeTabOrderCopyPosition` (loop que acha o `rowRightmost` da faixa
mais recente) e todo handler que precisa localizar/remover/mostrar uma
cópia existente por `hacTabOrderCopyForArea` passaram a usar
`_forEachTabOrderCopyCandidate` (novo helper, `code.js`) — varre tanto
`figma.currentPage.children` (compat com cópias criadas ANTES desta Section
existir, nunca migradas automaticamente) quanto os filhos da Section de
Ordem de Tabulação, sem duplicar. `_findTabOrderCopyForArea`/
`_removeExistingTabOrderCopiesForArea` são os dois atalhos mais usados em
cima desse helper (lookup único / remoção em lote).

**Nomenclatura dos selos (2026-09-02)**: `_createTabOrderBadge` nomeava os
grupos em inglês (`[TabOrder Preview | N] ...`/`[TabOrder | N] ...`),
destoando do resto do plugin (100% português, ex. a cópia inteira já se
chamava `[Ordem de Tabulação] ${root.name}`). Agora:
`[Prévia de Tabulação | N] ${node.name}` (selo fantasma temporário) e
`[Selo de Tabulação | N] ${node.name}` (selo real aplicado no canvas).
`renumber-tab-order-items` (que renomeia o selo diretamente ao trocar o
número, fora do fluxo de `_createTabOrderBadge`) e seu regex de
`.replace()` foram atualizados em conjunto — ambos precisam concordar com
o mesmo formato de nome.

### Réplica da área criada e focada ANTES de marcar (2026-09-02)
Regra válida para os dois modos (manual e automático): **a primeira coisa
que acontece é clonar a Área Marcada** (`_createTabOrderCloneForArea`,
`code.js`) para um espaço livre do canvas — sem sobrepor **nada** que já
esteja na página, incluindo conteúdo do designer que o hac nunca tocou
(`_findFreeTabOrderCopyPosition`/`_collectA11yOccupiedBounds`). A
varredura considera todos os nodes de TOPO de nível de
`figma.currentPage.children` (não desce recursivamente — é isso que
mantém o custo baixo mesmo em arquivos grandes), o que cobre
automaticamente a Section de specs, cópias de Ordem de Tabulação já
existentes e qualquer outra tela/frame/componente solto do arquivo; além
disso resolve explicitamente os frames ORIGINAIS de toda Área Marcada via
`hacAreaTargetNodeId` (redundante quando o frame já é filho direto da
página, mas necessário se a área aponta pra um node aninhado). Bug
histórico corrigido em 2026-09-02: antes a varredura só conhecia o que o
próprio hac tinha injetado/referenciado (Section + siblings com
`hacCategory` + frames de Área Marcada), então outras telas do designer
na mesma página ficavam invisíveis pro cálculo e a "faixa livre" podia
cair em cima delas. Logo após criar a cópia, o backend
seleciona e foca a viewport nela
(`figma.currentPage.selection`/`figma.viewport.scrollAndZoomIntoView`) —
ANTES de o modal de revisão abrir ou de o designer começar a clicar. Isso
existe porque a área original acumula selos de outras specs (badges "A",
"H", contornos) e ficava visualmente confusa/sobreposta ao modal; o
designer nunca deve marcar em cima dela.

- **Modo manual**: `start-tab-order-copy` (`code.js`) cria a cópia, foca a
  viewport e só então responde `tab-order-copy-started` — o frontend abre
  o modal e liga a escuta de cliques depois disso
  (`startTabOrderManualMode`, `accessibility.js`). O designer clica
  fisicamente na CÓPIA (é o que está focado na tela — a instrução de UI diz
  "clique nos elementos dela"), então `figma.currentPage.selection` sempre
  traz um node que vive dentro do clone. `figma.on('selectionchange', ...)`
  traduz esse id para o do ORIGINAL antes de repassar ao frontend
  (`_resolveTabOrderCloneSelectionToOriginalId`, busca linear no
  `_activeTabOrderCloneMap` ativo) — é assim que a lista pendente sempre
  guarda ids de original, o mesmo vocabulário que `nodeMap`
  (`Map<originalId, cloneNode>`) espera ao resolver em "Aplicar no Canvas".
  **Bug real corrigido em 2026-09-02**: essa tradução não existia — o
  `nodeId` capturado no clique já era o id do clone, mas era tratado como
  se fosse o do original em toda a cadeia (lista pendente, `apply-tab-order-to-canvas`
  → `nodeMap.get(entry.nodeId)`), causando 100% de "elemento não encontrado"
  ao aplicar qualquer sessão manual (reproduzido com 23 de 23 itens).
- **Modo automático**: `generate-tab-order-from-layers` (`code.js`) TAMBÉM
  cria a cópia e foca a viewport, antes de varrer a árvore em busca de
  candidatos — a varredura em si continua operando sobre o frame
  ORIGINAL (os `nodeId` coletados são os do original; é assim que
  "Aplicar no Canvas" resolve original→clone depois). O backend devolve
  `cloneId`/`nodeMap` junto com os `items` encontrados, e o frontend
  (`addTabOrderItemsFromLayers`) guarda essa cópia como ativa
  (`window._tabOrderActiveCloneId`/`_tabOrderActiveCloneNodeMap`) do mesmo
  jeito que o fluxo manual guarda — isso também é o que faz a prévia de
  selos fantasma (`preview-tab-order-numbers`) e o "Cancelar" (que apaga a
  cópia órfã) funcionarem igual nos dois modos. Se a varredura não
  encontra nenhum candidato, o modal abre mesmo assim, vazio, pronto para
  marcação manual via "+ Adicionar item" — só não abre se o backend nem
  conseguiu criar a cópia (área não encontrada/não clonável). Todo o corpo
  do handler roda dentro de um único try/catch (2026-09-02): antes, uma
  rejeição não prevista em qualquer ponto (ex.: `root.clone()` falhando)
  virava unhandled rejection silenciosa — nenhuma mensagem nunca chegava
  ao frontend, o toast inicial ("Varrendo elementos…") ficava para sempre
  sem o modal de revisão abrir e sem nenhum erro visível (bug real
  reproduzido em arquivo de produção). Agora qualquer falha sempre responde
  `tab-order-generated-from-layers` com `items: []` e avisa via
  `figma.notify`. A varredura por nível (`_walk`) também passou a rodar os
  filhos de um mesmo nó em paralelo (`Promise.all`), reduzindo o tempo
  total em árvores largas, sem mudar a regra de não descer dentro de um
  match interativo já capturado.

Antes desta correção, o modo automático só criava a cópia como fallback
tardio dentro de "Aplicar no Canvas", quando não havia cópia ativa — ou
seja, a cópia praticamente não existia durante a revisão do modo
automático, e o designer via/clicava sobre a área original o tempo todo.

### Modo manual — sem bloqueio (decisão revertida em 2026-09-02)
Uma tentativa de bloquear cliques em elementos "não reconhecidos como
acionáveis" (via matching DSC) foi implementada e **revertida no mesmo
dia**: o reconhecimento automático falhava em casos reais visíveis
(Icon Button de libs não mapeadas, cards customizados sem match no
catálogo) — travar o designer com base num reconhecimento que já provou
ser incompleto causava mais dano (impedir documentação correta) do que
benefício. Decisão final: **qualquer clique no modo de captura entra
direto na lista, sem checagem nem aviso — o designer decide 100%**.

### Modo automático — só sugere itens reconhecidos
`generate-tab-order-from-layers` varre a árvore via DFS e só coleta
instâncias cujo `componentKey` resolve como interativo via
`A11Y_INTERACTIVE_SHORTNAMES` (button, checkbox, radio button, switch,
inputs, paginator, stepper, tab group, accordion, breadcrumb, listas,
link). Isso é uma **sugestão**, não uma trava — o designer ainda revisa e
edita a lista antes de aplicar.

### Fluxo de revisão — selos reais incrementais (2026-09-03)
Nenhum selo é desenhado sobre os elementos reais em nenhum dos dois modos —
sempre sobre a mesma **cópia clonada** já criada/focada no início do
fluxo. Mas, diferente do modelo anterior, o desenho não espera mais um
passo final: cada item que entra na lista pendente (clique manual ou item
do scan automático) já desenha seu selo REAL na cópia na hora, via novo
handler `draw-tab-order-badge` (`code.js`) — nunca em lote, nunca
redesenhando o que já existe.

- **Modo manual**: `handleTabOrderSelectionChanged` (`accessibility.js`)
  empurra o item pra lista e chama `_tabOrderDrawPendingBadge`, que manda
  `draw-tab-order-badge` fire-and-forget. Cliques rápidos em sequência
  podem ter vários desenhos em voo ao mesmo tempo — aceito de propósito
  (ver "Corrida entre desenhos" abaixo) em favor da fluidez do clique
  sequencial.
- **Modo automático**: `addTabOrderItemsFromLayers` dispara o desenho de
  cada candidato do scan SEQUENCIALMENTE (aguarda a resposta de um antes
  de disparar o próximo, via `_tabOrderDrawPendingBadgeAwaitable`/
  `_tabOrderDrawWaiters`) — elimina qualquer corrida nesse caminho, e a
  lista populando item a item já serve de feedback visual do progresso.

**Apagar e reordenar afetam o canvas de verdade**: `deleteTabOrderPendingItem`
apaga o selo real (`delete-node`) do item removido (quando já tinha
`canvasId` — se ainda estava em voo, o handler de resposta descarta o selo
órfão sozinho ao chegar) e propaga a nova numeração pros remanescentes.
`_tabOrderPendingDrop` (drag-and-drop) faz o mesmo após reordenar o array.
As duas chamam `_tabOrderRenumberPendingCanvas`, que só manda
`renumber-tab-order-items` pros itens cujo número mudou de fato (nunca
recria selo nenhum, só reescreve a property do número via `setProperties`
+ renomeia).

**Corrida entre desenhos em voo (modo manual)**: cada item pendente carrega
`drawing`/`canvasId`/`drawFailed`. Enquanto `drawing` é true, o número
exibido na lista já é a posição correta, mas o selo real no canvas pode
ainda não existir ou ter nascido com um número que ficou desatualizado por
uma resposta chegando fora de ordem. Estratégia adotada — "flush ao
final", não fila: quando `handleTabOrderBadgeDrawn` detecta que o item
recém-resolvido era o ÚLTIMO ainda em voo, dispara
`_tabOrderRenumberPendingCanvas()` automaticamente, corrigindo qualquer
selo que tenha saído com número errado. "Concluir" (`applyTabOrderToCanvas`,
botão renomeado de "Aplicar no Canvas") fica desabilitado enquanto houver
qualquer item `drawing`, evitando persistir uma numeração que o flush ainda
vai corrigir.

**"Concluir" não desenha mais nada** — como todo selo já nasceu
incrementalmente, o clique é 100% client-side: filtra os itens com
`canvasId`, remove do array `tabOrderItems` qualquer item antigo da mesma
área, persiste os novos (`addTabOrderItem`) e fecha o modal. O handler
`apply-tab-order-to-canvas` e a mensagem `tab-order-applied-to-canvas`
foram removidos — não têm mais função.

**Cancelar continua simples**: `delete-tab-order-draft-copy` apaga a cópia
rascunho INTEIRA de uma vez, cobrindo qualquer quantidade de selos já
desenhados parcialmente — não precisou de nenhuma mudança para o modelo
incremental.

### Selos fantasma (tentativa revertida no mesmo dia, 2026-09-03)
Uma primeira tentativa de resolver "apagar/reordenar não reflete no
canvas" foi um preview temporário: a cada mudança na lista pendente
(`_renderTabOrderPendingList` → `_tabOrderRequestPreview`), o frontend
pedia ao backend (`preview-tab-order-numbers`) para **redesenhar do zero**
o lote inteiro de selos semitransparentes (opacidade 0.55) na cópia
clonada, apagando tudo e recriando a cada chamada (controle de geração via
`_tabOrderPreviewGeneration` contra reordenações rápidas em sequência).
Funcionalmente correto (auditado linha-a-linha em 2026-09-02, sem race
condition), mas o usuário considerou a abordagem complexa demais pro
ganho — revertida no mesmo dia em favor do modelo de selos reais
incrementais acima. Removidos: handlers `preview-tab-order-numbers`/
`clear-tab-order-preview-numbers`, função `_clearTabOrderPreviewBadges`,
variável `_tabOrderPreviewGeneration`, e o parâmetro `isPreview` de
`_createTabOrderBadge` (nome do grupo, opacidade e pluginData de prévia
associados).

**Selo de ITEM de tabulação vs. selo de ÁREA — dois componentes diferentes
(corrigido em 2026-09-02, revisando uma conclusão anterior errada deste
mesmo documento):** uma investigação anterior (registrada aqui) concluiu
que o selo de Ordem de Tabulação deveria usar `[a11y] Item Number` /
`[a11y mob] Número da tela` nos dois contextos (Área Marcada e item
individual de tabulação), e descartou `[a11y mob] Ordenação` por não ter
variante de direção. Essa conclusão estava errada — confirmado pelo
usuário (conhecimento direto da lib) e reforçado pela estrutura real dos
componentes via REST API:

- `[a11y] Item Number` (desktop, node `13:479`) e `[a11y mob] Número da
  tela` (mobile, node `13:479` equivalente na lib Super App) desenham um
  `Connector` (RECTANGLE) dentro de cada variante de direção (exceto
  `desativado`) — confirmado inspecionando os filhos de cada variante via
  API (`children: ['Order:FRAME', 'Connector:RECTANGLE', 'Label:TEXT']`).
  Fazem sentido para o selo de **Área Marcada**, que precisa de uma linha
  visual até a borda do frame/seção demarcada.
- `[a11y mob] Ordenação` (node `5222:4270`, variante `tamanho=pequeno`,
  key `a7b50306053bb1a4fb834f26c432dc7613ef9b13`) **não** desenha
  conector — os filhos de cada variante são só `Number:TEXT` +
  `keyboard_tab:INSTANCE` (ícone de seta encostando na borda do próprio
  selo, não uma linha longa). `componentPropertyDefinitions` só tem
  `tamanho` (VARIANT: grande/pequeno) e `número#5265:3` (TEXT) — sem
  property de direção porque a posição do selo **não é resolvida por
  variante do componente**, é resolvida pelo próprio `_createTabOrderBadge`
  via x/y absoluto (bloco `if (_conector === 'inferior') {...}` etc., já
  existente e inalterado). É o componente certo para o selo de **item
  de Ordem de Tabulação**, que fica colado à borda do elemento marcado,
  sem precisar de conector longo.

Desktop não tem um equivalente "sem conector" a `[a11y] Item Number` —
é o único componente disponível na lib "Design Acessível" para selo
numerado, e por isso continua sendo reaproveitado tanto para Área quanto
para item de tabulação nesse caso (mesmas keys usadas em
`A11Y_AREA_CONECTOR_KEYS` e `A11Y_ITEM_NUMBER_KEYS`) — assimetria real
entre as duas libs, não um bug do plugin.

**Constantes em `code.js`:**
- `A11Y_ITEM_NUMBER_KEYS_MOBILE` (`[a11y mob] Número da tela`) — usada
  SÓ pelo selo de Área Marcada (`create-a11y-area`).
- `A11Y_TAB_ORDER_ITEM_KEY_MOBILE` (nova, `[a11y mob] Ordenação`,
  variante `tamanho=pequeno`) — usada SÓ pelo selo de item de tabulação,
  dentro de `_createTabOrderBadge`, property `número#5265:3`. Sem
  `showLabel`/`label` (esse componente não tem essas properties).
- `A11Y_ITEM_NUMBER_KEYS` (desktop, `[a11y] Item Number`) — segue usada
  nos dois contextos (Área e item de tabulação), únicas keys disponíveis
  no desktop.

`_createTabOrderBadge` é chamada só a partir de `draw-tab-order-badge`
(sempre com `conector` fixo em `'direita'`, que só afeta posicionamento) —
nunca do handler de Área, que tem seu próprio bloco de import/setProperties
dedicado a `A11Y_ITEM_NUMBER_KEYS_MOBILE`/`A11Y_AREA_CONECTOR_KEYS`. Ou
seja, a função já era 100% dedicada a item de tabulação; a correção trocou
qual componente ela importa quando `origin === 'mobile'`, sem precisar de
parâmetro extra pra diferenciar contexto.

**Correção real aplicada (2026-09-02):** `_createTabOrderBadge` tinha dois
pontos de falha silenciosa que dificultavam diagnosticar qualquer selo
ausente (seja fantasma ou real):
1. O `catch` de `figma.importComponentByKeyAsync` (cai no fallback
   procedural — círculo azul + texto — quando a lib "Design Acessível" não
   está disponível como team library no arquivo) não logava nada.
2. Dentro desse mesmo fallback, `labelText.fontName = {family:"Inter",
   style:"Bold"}` é uma atribuição síncrona que lança se a fonte não foi
   carregada antes — e o `loadFontAsync` do chamador (`draw-tab-order-badge`/
   `create-a11y-area`) já rodava dentro de um `try/catch` mudo. Se esse
   carregamento falhasse, a exceção síncrona escapava de
   `_createTabOrderBadge` inteira sem nenhum selo (nem real, nem fallback)
   e sem nenhum sinal — e o chamador também engolia a exceção em silêncio,
   o item era pulado sem rastro nenhum.

Agora: falha de import loga via `console.error` (console do plugin, sem
`figma.notify` a cada re-render trivial), a atribuição de fonte tem
retry com `await figma.loadFontAsync` antes de lançar pra fora, e
`draw-tab-order-badge` loga a falha do item (via `tab-order-badge-draw-failed`,
tratado no frontend) em vez de engolir.

### Modo manual volta a ser EM LOTE (2026-09-04-e) — reversão parcial e deliberada do modelo incremental

A vertical de acessibilidade trouxe uma proposta nova pro modo MANUAL
(o automático não muda — ver abaixo): o designer seleciona a trilha
inteira em sequência primeiro, e só ao confirmar no final a ordem é de
fato criada/desenhada no canvas — voltando ao espírito do modelo anterior
a 2026-09-03, mas SEM reintroduzir o bug que motivou aquela mudança.

**O que muda**: `handleTabOrderSelectionChanged` deixa de chamar
`_tabOrderDrawPendingBadge` a cada clique — cada clique só empilha o item
na lista pendente (`canvasId: null`, `drawing: false`) e mantém o
highlight no canvas (`highlight-tab-order-copy-node`, não removido — é o
único feedback visual enquanto a trilha está sendo montada, sem nenhum
selo real ainda). `applyTabOrderToCanvas` (botão "Criar ordem de
tabulação", renomeado de "Concluir") passa a ser `async` e é ELA quem
desenha agora: itera a lista pendente inteira chamando
`await _tabOrderDrawPendingBadgeAwaitable(tempId)` em sequência (mesmo
helper já usado pelo scan automático, reaproveitado sem duplicar),
mostrando progresso ("Desenhando N de M...") e só persiste em
`tabOrderItems` os itens que de fato ganharam `canvasId` — itens que
falharem ficam de fora, com aviso ao designer.

**Por que isso não reintroduz o bug de 2026-09-03**: aquele bug era
"apagar/reordenar um item ANTES de confirmar não refletia nada no
canvas", porque NENHUM selo existia até "Aplicar". Isso continua
tecnicamente verdade aqui — mas agora é o comportamento ESPERADO, não um
efeito colateral: o designer revisa/reordena a trilha inteira (a lista
pendente já mostra a numeração correta) antes de qualquer selo nascer; o
highlight a cada clique já indica visualmente o que foi selecionado.
`_tabOrderRenumberPendingCanvas` nunca dispara `renumber-tab-order-items`
durante essa montagem (nenhum item tem `canvasId` ainda) — só volta a
mandar mensagem real pro backend no fluxo de "Atualizar" sobre uma ordem
já aplicada.

**O que NÃO muda**: o modo AUTOMÁTICO ("Gerar Automaticamente", renomeado
pra "Mapeamento Automático" — ver nota de nomenclatura abaixo) já desenhava
em lote sequencial desde sempre (`addTabOrderItemsFromLayers`, mesmo
`_tabOrderDrawPendingBadgeAwaitable` reaproveitado agora pelo manual) —
zero mudança de lógica nele.

**Hierarquia visual — manual vira o caminho primário, automático o
secundário** (pedido explícito da vertical: o automático deve ser a opção
secundária de propósito, para que o designer aprenda o fluxo manual
primeiro): "Iniciar Ordem de Tabulação" continua botão preenchido
(primário); "Gerar Automaticamente"/"Mapeamento Automático" deixa de ser
um botão outline do mesmo tamanho e vira um link/texto secundário e menor
logo abaixo ("ou usar Mapeamento Automático") — nos dois lugares onde
esse par de botões existe (`_a11yWorkspaceTabTabulacao`, e o bloco legado
usado pelo bucket "Sem área").

**Nomenclatura corrigida (2026-09-04-e/g)**: "Gerar Handoff Automatizado"
virou **"Mapeamento Automatizado"** (modal de resumo do lote de
detecção) e "Gerar Automaticamente" (Tabulação) virou **"Mapeamento
Automático"** — motivo: nenhum desses fluxos produz um "handoff" pronto
nem uma "geração" final — o resultado sempre passa por revisão do
designer antes de virar spec ou ordem aplicada. Nunca usar "handoff"/
"gerar" pra descrever esses fluxos automáticos daqui em diante.

## 8b. Workspace de Área (2026-09-04): card → workspace com 4 tabs, Ordem de Swipe

Cada Área Marcada deixou de ser um **accordion** que expandia in-line na
listagem principal (revelando Ordem de Tabulação + specs por categoria por
dentro) e virou um **card clicável**. Clicar no card abre uma **workspace**
própria da área — a primeira sub-navegação real do hac: antes só existiam
2 views top-level (`view-home`/`view-specifications`), trocadas via
`classList.toggle('active')` em `navigate()` (`core.js`). A nova view
`view-area-workspace` reaproveita esse mesmo mecanismo — como `navigate()`
não aceita parâmetro extra, `openA11yAreaWorkspace(areaId)` guarda
`window._a11yWorkspaceAreaId = areaId` ANTES de chamar
`navigate('view-area-workspace')`, e a lógica de render lê essa variável.
`navigateBackToA11yList()` volta pra `view-specifications` e limpa o
estado. `_a11ySemAreaAccordionEl` (bucket "Sem área", specs órfãs)
**não muda** — continua accordion read-only, não virou card clicável.

**4 tabs**, na ordem do fluxo real de trabalho — mapeamento fechado depois
de várias rodadas de correção durante o planejamento (registrado para não
repetir confusão em trabalho futuro nesta área: o número e o papel de cada
tab mudou várias vezes, inclusive DEPOIS da primeira versão publicada
desta view no mesmo dia — ver nota de histórico abaixo):

1. **Tabulação** — o que já existia (Ordem de Tabulação, seção 8), só
   mudou de contêiner (saiu do accordion, entrou na tab). Nenhuma mudança
   de comportamento.
2. **Swipe** — NOVO, funcionalidade real (não placeholder), **exclusiva
   mobile**, com badge visível "Em fase de testes" (experimental, ainda
   não validada em campo). Ver detalhe técnico abaixo.
3. **Leitor de Tela** — a tab de TRABALHO real: criar/editar/excluir cada
   spec, reaproveitando os sub-accordions por categoria
   (`_a11yCategoryAccordionEl`, as 5 categorias da seção 2) e o bloco "Não
   Documentados". Botão "Nova spec" também disponível aqui, além do
   atalho direto no card da listagem principal. Se chegou aqui via
   `window._a11yWorkspaceFocusSpecId` (vindo do botão "Editar" do
   dashboard da tab Handoff), expande automaticamente o sub-accordion da
   categoria correspondente — variável consumida e zerada na própria
   renderização, não persiste em re-renders subsequentes.
4. **Handoff** — DASHBOARD de consolidação (não tem mais formulário de
   edição): status agregado de Tabulação (contagem de itens),
   Swipe (contagem, ou "Não aplicável — projeto web" quando
   `projectOrigin !== 'mobile'`) e specs documentadas (reaproveitando a
   antiga listagem enxuta — Accessibility Label + Descrição — como
   `_a11yWorkspaceHandoffSpecsSummaryHtml`, cujo botão "Editar" leva pra
   tab Leitor de Tela). **Não tem mais botão de geração próprio** — desde
   a entrega da Ficha de Handoff (ver seção 8c), a ação de montar o
   artefato final é 100% distribuída nos botões "Inserir/Atualizar
   ficha" das 3 abas de trabalho; a tab Handoff mostra 3 cards de status
   (um por seção) e um atalho "Ver ficha no canvas".

Não existe aba "Geral": metadados básicos da área (nome, número, elemento
âncora, contagem de specs) ficam só no card da listagem e no título do
header da workspace. Não existe (mais) aba "Resumo do handoff" — seu
papel foi absorvido pelo dashboard da tab Handoff.

**Nota de histórico (correção pós-publicação, mesmo dia 2026-09-04)**: a
primeira versão desta view tinha 5 tabs — Tabulação → Swipe → Leitor de
Tela → Handoff → Resumo do handoff —, com "Leitor de Tela" como listagem
enxuta e "Handoff" como aba de trabalho. O usuário corrigiu essa leitura
depois de já estar implementada: "Leitor de Tela" é a etapa de CRIAÇÃO
das specs (confirmado por reafirmação explícita: "Leitor de tela é a
parte de criação de specs, eu já tinha te falado isso"), e "Handoff"
passou a ser o dashboard de consolidação — absorvendo o papel que
"Resumo do handoff" teria, que por isso foi removida como tab própria.

**Header da workspace**: barra azul (`subheader-brand`) com botão
"Voltar" (volta pra listagem, nunca pra Home), título dinâmico
(`area.label`/`area.number`), e um dropdown "Mais ações" próprio
(`toggleA11yWorkspaceMoreActionsMenu`, mesmo padrão de
`toggleA11yComponenteMenu`) reunindo as ações que antes ficavam nos
botões do cabeçalho do accordion: Focar no canvas, Ocultar/Mostrar,
Excluir área (`_deleteA11yAreaFromWorkspace`).

**Card ampliado, sem "Nova spec" (2026-09-04-c)**: pedido do usuário com
screenshot real, correção posterior à publicação inicial do card. O botão
"Nova spec" saiu do card — criar spec passou a ser só dentro da workspace,
aba Leitor de Tela (o card fica mais limpo e sem competir com o resumo).
O chevron de "abrir" também saiu — era redundante, o card inteiro já é
obviamente clicável. Em troca, o card ganhou um resumo mais rico do que
já foi documentado, três blocos empilhados: status por etapa (Tabulação/
Swipe/Leitor de Tela, mesmo padrão visual de ícone do dashboard da tab
Handoff), breakdown por categoria de spec (pills coloridas, uma por
`A11Y_CATEGORIES` com pelo menos 1 spec documentada) e status da Ficha de
Handoff (`X/N seções inseridas`, reaproveitando `area.handoffFicha.sections`
— seção 8c). O título da seção na listagem principal, antes "Áreas
Marcadas", passou a ser **"Frames Documentados"** (mesmo pedido) — o
botão "Recolher/expandir todos" que ficava ao lado também saiu: era
resquício de quando cada área era um accordion in-line; sem accordion de
área, não há mais o que recolher/expandir ali.

### Swipe — histórico de 3 versões na mesma sessão (2026-09-04)

O desenho de Swipe mudou de conceito 3 vezes seguidas na mesma sessão,
por rodadas de correção de entendimento com o usuário. Registrado aqui
para não repetir a confusão em trabalho futuro:

1. **V1** (a versão original, descrita nesta seção até esta revisão):
   pipeline DUPLICADO (não generalizado) de Ordem de Tabulação — cópia
   rascunho por área, captura sequencial de elementos DENTRO da mesma
   área, selos numerados via `[a11y mob] Ordenação`. Descartada porque o
   usuário esclareceu que Swipe não é sobre ordem de elementos dentro de
   uma tela.
2. **V2**: conexão ENTRE exatamente 2 Áreas Marcadas diferentes, escolhida
   por dropdown (`hacData.a11ySwipeFlows[]`, `{sourceAreaId,
   targetAreaId}`), desenhando uma linha reta única entre os dois selos.
   Descartada porque o usuário esclareceu (com imagem de referência real)
   que o modelo correto suporta N pontos em sequência, não só 2.
3. **V3 (atual)**: trilha direcional multi-ponto — ver seção 8d.

A V1 e a V2 foram removidas por completo (schema, backend e frontend) em
cada correção — não há código de nenhuma das duas mantido "por via das
dúvidas".

## 8d. Swipe V3 (2026-09-04): trilha direcional multi-ponto

Swipe é uma **trilha com N pontos em sequência**, desenhada como uma
única linha direcional contínua com setas no canvas — não mais ordem de
elementos dentro de 1 área (V1) nem conexão fixa entre 2 áreas (V2).
Pontos NÃO são restritos a Áreas Marcadas — podem ser qualquer
elemento/frame clicado no canvas, mesma liberdade que a Ordem de
Tabulação já tem.

**Dois modos de captura**:
1. **Sequencial manual**: clique nos pontos em ordem no canvas — mesmo
   modelo EM LOTE que Tabulação (seção 8, "Modo manual volta a ser em
   lote"): cada clique só empilha na lista pendente + highlight, sem
   desenhar nada; a trilha real só nasce ao confirmar "Criar trilha de
   Swipe".
2. **Seleção múltipla de uma vez**: shift+clique/marquise seleciona
   vários pontos simultaneamente. Como a Plugin API não expõe ordem de
   clique para seleção múltipla, a ordem é resolvida por
   **`_orderNodesInZigzagReadingOrder`** — a MESMA função já usada pelo
   Mapeamento Automático de Tabulação (seção 8), movida de dentro do
   closure de `figma.ui.onmessage` para escopo top-level (corpo
   inalterado) para que o listener de `selectionchange` também possa
   chamá-la. Sem "Mapeamento Automático" próprio para Swipe nesta
   entrega (fora de escopo — extensão futura, se pedida).

**Schema**: `hacData.a11ySwipePaths[]` substitui `a11ySwipeFlows[]`
(removido por completo) — `{id, points: [{nodeId, nodeName}, ...],
areaId, createdAt}`. Aditivo, sem bump de `_schemaVersion` (mesmo
precedente de todo campo novo desta sessão). Uma área tem no máximo 1
trilha — substituição completa ao recriar.

**Geometria** (`code.js`): `_buildSwipePathConnection(nodes)` desenha
N-1 segmentos em sequência (cada um com sua própria seta, calculada por
ângulo do segmento, mais um ponto de origem), agrupados com
`figma.group()`. **Linha mais grossa e marcada** que a versão anterior
(pedido explícito do usuário): `strokeWeight` 4 (era fino/padrão antes),
cor cyan `#0891B2` de destaque. Section própria — a constante
`A11Y_SWIPE_FLOW_SECTION_NAME` manteve o NOME (decisão pragmática do
agente pra não tocar todas as referências), mas o VALOR mudou pra `'hac
— Trilhas de Swipe'` — o nome da constante em si ficou levemente enganoso
(sugere "fluxo", que era o conceito da V2), mas não é um bug: nenhum
lugar do código compara contra um literal hardcoded divergente, só
contra a própria constante.

**Resolve de propósito o achado de QA da V2** (dessincronia canvas↔dado):
o handler `insert-swipe-path` desenha a trilha NOVA primeiro e só remove
a trilha ANTIGA depois de confirmar sucesso — nunca o contrário. Se o
desenho novo falhar, a trilha antiga permanece intacta no canvas e no
dado, em vez de ficar "mentindo" que existe uma trilha que não está mais
lá.

**Modal de revisão** (`views/modals.html`): `#a11y-swipe-path-review-modal`,
novo, estrutura análoga ao `#a11y-tab-order-review-modal` (lista
pendente + drag-and-drop), sem botão "Adicionar item" (sem scan
automático nesta entrega).

**Ficha de Handoff, seção Swipe**: mostra a trilha completa em ordem
("1. X → 2. Y → 3. Z"), não mais "leva para X" (texto da V2).

**Limitação aceita conscientemente**: ocultar a Área via "Ocultar/Mostrar
no canvas" não afeta a trilha de Swipe desenhada (ela não é uma cópia de
frame por área como Tabulação, é uma única linha/setas) — mesma decisão
já tomada na V2, documentada explicitamente no código
(`toggleAreaGroupVisibility`).

## 8c. Ficha de Handoff (2026-09-04): módulo apartado, inserção incremental por seção

> **Nota de atualização (2026-09-08)**: esta seção descreve o desenho
> original da Ficha (1 Grupo por Área, específico dela). Em 2026-09-08 o
> modelo de agrupamento de artefatos no canvas mudou para Section de
> sessão + grupos soltos irmãos (Tabulação/Swipe/Especificações cada um no
> seu próprio grupo, não mais aninhados num único Grupo por Área), e a
> Ficha ganhou 4 blocos horizontais com ordem fixa (Tabulação/Swipe/Leitor/
> Handoff Review). Ver `docs/tecnico.html` seções
> [8a](tecnico.html#s8a) (contrato do subsistema de clone/overlay),
> [8e](tecnico.html#s8e) e [8f](tecnico.html#s8f) para o modelo atual —
> este arquivo não foi reescrito para refletir essas mudanças (não é mais
> mantido em sincronia obrigatória, ver aviso no topo).

Implementa o artefato que ficara "fora de escopo" nas duas entregas
anteriores: a Ficha de Handoff é um **frame no canvas do Figma, por Área
Marcada**, montado a partir de uma imagem de referência real trazida pelo
usuário (ficha "Handoff de acessibilidade — Ordem de tabulação e Leitor
de Telas [Super App]": legenda + telas com selôs numerados + cards de
especificação por selo, organizados em seções lado a lado). É um
**artefato de EXPORT destinado ao time de desenvolvimento** — nesta 1ª
versão, o formato de saída é o próprio frame no Figma (o dev acessa pelo
link do arquivo ou usa o "Export" nativo do Figma para PNG/PDF; o plugin
não gera arquivo externo).

**Modelo de inserção incremental** (decisão do usuário, mudou o desenho
original do dashboard): não existe um botão único "Gerar handoff" que
monta tudo de uma vez. Em vez disso, **cada uma das 3 abas de trabalho —
Tabulação, Swipe, Leitor de Tela — tem seu próprio botão** "Inserir na
ficha", que insere/substitui só a **seção correspondente** dentro do
frame da Ficha daquela área. O botão vira "Atualizar ficha" assim que
aquela seção já foi inserida — estado persistido em `hacData`, não
inferido do canvas a cada render:

```js
a11yAreas[i].handoffFicha = {
  frameId: null,           // id do frame da Ficha no canvas, quando existe
  sections: {
    tabulacao: { insertedAt: null, itemCount: 0 },
    swipe:     { insertedAt: null, itemCount: 0 },
    leitor:    { insertedAt: null, specCount: 0 },
  },
}
```

Campo aditivo, sem bump de `_schemaVersion` (mesmo precedente de
`swipeOrderItems`/`projectOrigin` — seção 1); áreas antigas sem esse
campo são tratadas defensivamente (`area.handoffFicha?.sections?.[key]`)
em todo ponto de leitura.

**Módulo apartado** (palavras do usuário, reforçadas explicitamente):
frontend isolado em `src/plugin/modules/handoff-ficha.js` (arquivo
próprio, não espalhado dentro de `accessibility.js`), tudo prefixado
`_ficha` para não colidir por nome com o resto — `_fichaInsertSection`,
`_fichaHandleSectionInserted`/`_fichaHandleSectionInsertFailed`,
`_fichaViewOnCanvas`, `_fichaDashboardHtml`,
`_fichaBuildSpecPayload`/`_fichaBuildSpecFields`. Adicionado ao pipeline
de concatenação em `build.cjs`, posicionado depois de `accessibility.js`
(consome `A11Y_CATEGORIES`/`switchA11yWorkspaceTab`/`a11yAreas`/
`a11ySpecs`/`saveToStorage`) e antes de `onboarding.js`. Backend: bloco
próprio e delimitado dentro de `code.js` (único arquivo backend do hac —
"módulo apartado" aqui é fronteira de código clara, não um processo/build
separado), mensagens com prefixo `ficha-*` (`insert-ficha-section`,
`ficha-section-inserted`, `ficha-section-insert-failed`,
`ficha-node-not-found`, `delete-ficha-for-area`, `toggle-ficha-visibility`,
`highlight-ficha-node`) — nunca reaproveita `type` já usado por
tab-order/swipe.

**A Ficha desenha os selôs DO ZERO, independente** — decisão crítica de
arquitetura: `_cloneAreaRootIntoFicha` (`code.js`) clona o frame
ORIGINAL da área (`area.targetNodeId`), nunca a cópia rascunho de
trabalho de Tabulação/Swipe (que é destruída/recriada a cada "Gerar
Automaticamente" — clonar ela pra dentro da Ficha a deixaria órfã na
próxima regeneração). Os selôs são desenhados a partir dos itens JÁ
PERSISTIDOS (`tabOrderItems`/`swipeOrderItems`), reaproveitando
`_createTabOrderBadge`/`_createSwipeBadge` (o mesmo bloco de Tabulação/
Swipe, seção 8b) numa chamada "fria" — confirmado por investigação que
essas duas funções não têm NENHUMA dependência oculta do fluxo de clique
ao vivo (`_activeTabOrderCloneMap`/`_tabOrderModeActive` etc. vivem nos
CALLERS do fluxo interativo, não nas funções de desenho em si), então
não precisaram de generalização — só receberam o clone da Ficha como
parâmetro explícito, exatamente como já aceitavam.

**Substituição completa por seção, não merge**: `_removeFichaSectionInFrame`
remove a seção antiga (marcada via `pluginData` `hacFichaSection =
sectionKey` no node raiz daquela seção) antes de inserir a nova — mesmo
padrão do precedente do Handex (ver abaixo), sem risco de resíduo.

**Precedente reaproveitado, não portado**: o plugin irmão Handex já tem
uma "Ficha de Projeto" nesse espírito (`create-handoff`, `handex/src/
plugin/code.js:1471-2540`) — frame procedural com Auto Layout, detecção
por convenção de nome + flag local, substituição completa em vez de
edição in-place. O hac não porta esse código (era greenfield, comentário
explícito em `code.js` confirma que a Ficha nunca foi portada do Handex)
mas reaproveita o desenho arquitetural, adaptado para granularidade por
SEÇÃO (não só por ficha inteira) e estado em `hacData` (não reconciliação
via nome de nó — o hac guarda `frameId` direto, mesmo padrão já usado por
`a11yAreas[].id`).

**Posicionamento sem colisão**: `_createOrGetFichaFrame` reaproveita
`_findFreeTabOrderCopyPosition`/`_collectA11yOccupiedBounds` (seção 8b,
já genéricas o bastante apesar do nome) usando o bounding box da Área
Marcada como origem. `_collectA11yOccupiedBounds` foi estendida para
também varrer a Section `hac — Ficha de Handoff` (achado real de QA,
corrigido antes desta entrega ser considerada pronta — sem isso, duas
Áreas diferentes gerando Ficha colidiam visualmente entre si, e uma
Ficha já inserida podia ser sobreposta por uma cópia de Tabulação/Swipe
criada depois dela).

**Cascata de exclusão/ocultação**: `deleteA11yArea`/
`toggleAreaGroupVisibility` ganharam uma 3ª cascata
(`delete-ficha-for-area`/`toggle-ficha-visibility`), ao lado das já
existentes de tab-order/swipe — excluir/ocultar uma área também
remove/oculta o frame da Ficha correspondente, sem órfão no canvas.

**"Ver ficha no canvas"**: `highlight-ficha-node` foca o frame pelo
`frameId` salvo; se o frame foi apagado manualmente do canvas, o backend
responde `ficha-node-not-found` e o frontend mostra um toast de erro
explicando que a seção precisa ser inserida de novo (achado real de QA,
corrigido — a mensagem existia no backend sem handler correspondente no
frontend, causando falha silenciosa).

**Campos por card na seção Leitor de Tela**: um card por spec, montado
com Auto Layout puro (mesmo padrão visual do card procedural de fallback
já existente, seção 8). Campos resolvidos no FRONTEND
(`_fichaBuildSpecFields`, não duplicados em `code.js`) e enviados já
prontos no payload — segue o mesmo precedente já usado por
`create-unified-spec` (frontend resolve valores de exibição, backend só
desenha): Descrição (`properties.descricao`), Nome Acessível
(`properties.nomeAcessivel`, quando existe), Notas de Código
(`properties.notaCodigo` + `properties.notas`), Observações
(`properties.observacoes`), Componente
(`_cleanDscContainingFrameName(spec.a11yDscComponentName)`, fallback
`properties.componente`). Campos ausentes por categoria (ex.
`decorativo` não tem Componente nem Nome Acessível) são omitidos
inteiros do card, nunca aparecem vazios.

### Fora de escopo desta entrega (registrado para não ser esquecido)

- Export para PDF/imagem/link compartilhável fora do Figma — só o frame
  no canvas nesta versão.
- Histórico de versões da Ficha (substituição completa a cada
  "Atualizar", sem trilha de gerações anteriores — mesmo comportamento
  do precedente do Handex).
- Ponte com `_writeDscHandoffSummary`/`DSC_HANDOFF_SUMMARY_ENABLED` do
  Handex (canal de dados desligado, pensado para o hac consumir scan de
  componentes do Handex) — não relacionado à Ficha em si.

## 9. Contrato de mensagens (UI ↔ backend)

Toda comunicação passa por `postMessage`/`window.onmessage` — o frontend
NUNCA chama `figma.*` diretamente; `figma.importComponentByKeyAsync` e
qualquer manipulação de canvas só rodam em `code.js`.

| Mensagem | Direção | Payload relevante |
|---|---|---|
| `init-plugin` | backend → UI | `theme`, `version`, `currentUser`, `savedState` (hacData persistido), `onboardingSeen` |
| `save-storage` | UI → backend | `data` (hacData completo) |
| `cache-cleared` | backend → UI | — (reseta hacData/arrays em memória, incluindo `projectOrigin`) |
| `create-unified-spec` | UI → backend | `opts` (`a11yType`, `a11ySubtype`, `a11yOrigin`, `a11ySourceLib`, `a11yDscComponentName`, `a11yAreaId`, `targetNodeId`, `needsReview`, `silent`, `sectionName`) |
| `spec-created` | backend → UI | `spec` (objeto já no formato de `a11ySpecs[]`) |
| `scan-frame` | UI → backend | `nodeId`, `origin: 'a11y-detection'` |
| `scan-result` | backend → UI | `data`, `origin` (ecoado) |
| `check-a11y-library` | UI → backend | `token` |
| `create-a11y-area` | UI → backend | `targetNodeId`, `label`, `number`, `conector`, `autoDetect`, `origin`, `sectionName` |
| `get-a11y-documentation-status` | UI → backend | `sectionName` (Section ativa a checar) |
| `a11y-documentation-status` | backend → UI | `activeSectionName`, `hasDocumentation`, `areaCount`, `nextSectionName` — ver seção 8 |
| `start-tab-order-copy` / `generate-tab-order-from-layers` | UI → backend | (entre outros campos já existentes) `sectionName` |
| `draw-tab-order-badge` | UI → backend | `tempId`, `areaId`, `targetNodeId`, `nodeId`, `number`, `a11yOrigin`, `sectionName` — desenha 1 selo real por chamada (ver seção 8) |
| `tab-order-badge-drawn` / `tab-order-badge-draw-failed` | backend → UI | `tempId`, e em caso de sucesso `canvasId`/`item` |
| `renumber-tab-order-items` | UI → backend | `items: {id, number}[]` — reescreve a property do número + renomeia, nunca recria |
| `check-tab-order-node-interactive` / `tab-order-node-interactive-result` | *(removido em 2026-09-02, junto do bloqueio de tabulação)* | — |
| `apply-tab-order-to-canvas` / `tab-order-applied-to-canvas` | *(removido em 2026-09-03, junto da introdução dos selos incrementais)* | — |

## 10. Escala da UI (`--ui-scale`) e `position` dos modais

`body` usa `zoom: var(--ui-scale)` (não `transform`) para os 3 níveis de
escala do plugin (`[1, 1.15, 1.3]`, `zoomIn()`/`zoomOut()` em `core.js`) —
mantido deliberadamente: `zoom` reflui o layout de verdade (afeta scroll,
`overflow`, medidas reais), enquanto `transform: scale()` só afeta a
pintura, exigindo compensação manual de `width`/`height` e frequentemente
quebrando `overflow`/scroll do corpo. `height: calc(100vh / var(--ui-scale))`
no próprio `body` existe para que a altura pré-zoom seja grande o
suficiente para, depois de multiplicada pelo zoom, voltar a preencher
`100vh` — necessário para o layout `h-screen flex flex-col` (header/footer
`shrink-0` + área scrollável) continuar ocupando a tela inteira em
qualquer escala.

**Bug real corrigido em 2026-09-02**: todo modal do hac (`modals.html`,
9 modais) usava `fixed inset-0`, mais `#toast-container` e
`#resize-handle` (`plugin.css`). `position: fixed` não cria novo
containing block sob `zoom` — o containing block de um elemento `fixed`
continua sendo o viewport real do documento, independente do `zoom`
aplicado a um ancestral. Só que o `zoom` do ancestral (`body`) ainda é
aplicado à pintura final desse elemento `fixed` (zoom desce pela árvore de
render inteira, não é isolado por posicionamento) — resultado: o box do
modal já nascia do tamanho do viewport real (`inset-0`) e depois era
escalado de novo pelo `zoom`, ficando maior que a área visível em
qualquer escala > 100% (cortado, sem scroll, parte inacessível ao clique).
Cabeçalho/rodapé não sofriam disso por não serem `fixed`/`sticky` — são
filhos flex normais (`shrink-0`), então escalam corretamente junto com o
resto do layout do `body`.

**Correção**: todos os `fixed inset-0` viraram `absolute inset-0`
(`modals.html`), `#toast-container` e `#resize-handle` viraram
`position: absolute` (`plugin.css`), e `body` ganhou `position: relative`
— agora todo elemento que antes escapava do zoom via `fixed` resolve seu
posicionamento contra o próprio `body` zoomado, como qualquer outro
conteúdo normal da página, sem containing block alternativo. Não houve
mudança estrutural de DOM (nenhum modal foi movido de lugar) — só a
troca de `position` + a adição de `position: relative` no `body`, que já
era o ancestral direto (ou indireto, via wrapper `relative` existente)
de todos os elementos afetados.

**Trade-off aceito**: `absolute` dentro de um `body` com `overflow:
hidden` e altura fixa (`h-screen`) significa que, em teoria, um modal
poderia ficar fora da área visível se `body` não cobrir 100% da viewport
real — não é o caso aqui, porque `body` já é `width: 100%` +
`height: calc(100vh / scale)` (que, multiplicado pelo próprio zoom,
sempre resulta em exatamente `100vh` de pintura). Se o cálculo de altura
do `body` for alterado no futuro, essa premissa precisa ser revalidada
para os modais não regredirem.

**Validação**: correção baseada em raciocínio sobre a especificação
documentada de `zoom` do Chromium/CEF (motor usado pelo Figma) — não foi
possível renderizar visualmente o `ui.html` num Chromium real durante
esta sessão (sem ferramenta de shell/browser disponível). Recomendado
validar manualmente no Figma desktop: abrir qualquer modal (ex: "+ Nova
especificação") nas 3 escalas (100%/115%/130%) e confirmar que o modal
aparece inteiro, centralizado e clicável em todos os cantos, incluindo
depois de redimensionar a janela do plugin (`initResizable`).

**Bug real adicional, corrigido no mesmo dia**: mesmo depois de
`fixed`→`absolute`, o card interno de 5 modais (`modals.html`) ainda
limitava a própria altura com `max-h-[85vh]`/`max-h-[92vh]` — unidade de
viewport, calculada contra a viewport real do documento, não contra o
`body` reescalado. Em qualquer escala diferente de 100%, esse limite
ficava dessincronizado da área realmente visível: o card podia nascer
mais alto do que cabia, cortando o rodapé (botões de ação) para fora da
área rolável interna (`overflow-y-auto` só existe DENTRO do card já
cortado, então não adianta rolar). Reportado pelo usuário como "a rolagem
quebra com a modal aberta, não consigo ver tudo" ao usar o modal "Marcar
Área" em zoom ativo. Corrigido trocando `max-h-[85vh]`/`max-h-[92vh]` por
`max-h-full` nos 5 modais — resolve contra o wrapper pai imediato
(`absolute inset-0 flex items-center justify-center p-4`), que sempre
corresponde à área real visível do `body`, em qualquer escala.

### 10.1 Modais com respiro + overlay sobre a área de conteúdo (2026-09-02)

Todos os 10 modais do hac (`modals.html`) passaram a abrir **cobrindo
toda a área de conteúdo do plugin** — a mesma área que
`view-home`/`view-specifications` já ocupam (abaixo do `<header>` fixo
global de logo CAIXA/HAC + zoom + tema, acima do
`<footer id="footer-signature">`) — em vez do popup pequeno,
sem respiro, que existia antes desta sessão. O header fixo global
permanece sempre visível; o modal nunca mais compete visualmente com o
`<header>` real do plugin nem com o subheader azul "Acessibilidade" de
`view-specifications` (que é conteúdo da própria view, coberto pelo modal
como o resto do conteúdo).

Esta seção passou por 3 iterações no mesmo dia, todas a pedido do
usuário — a versão final (estado atual do código) é a descrita abaixo;
as duas intermediárias ficam registradas no Changelog.

**Estrutura final de cada modal** (2 camadas, todos os 10 seguem o mesmo
padrão):

1. **Wrapper externo** — `absolute inset-0 z-[1000] flex flex-col p-4`
   (ou `flex flex-col items-center justify-center p-4` nos modais
   pequenos, ver abaixo). `position: absolute` (não `fixed`) foi mantido
   — ver 10.0 acima sobre o bug de `zoom`. `p-4` (16px) é o respiro
   visual real entre o modal e a borda da área de conteúdo, revelando o
   overlay por trás nessa faixa.
2. **Backdrop** — `<div class="absolute inset-0 bg-black/40
   backdrop-blur-sm" onclick="closeXyz()">`, primeiro filho do wrapper.
   Cobre a faixa de respiro (16px) e a área abaixo/ao redor do card
   quando ele é menor que o wrapper. Clicável — fecha o modal, restaurando
   o comportamento de "clique fora fecha" que existia antes da sessão.
   Exceção: `a11y-post-area-detect-modal` (pergunta bloqueante Web/Mobile)
   tem o backdrop só como elemento visual, sem `onclick` — fechamento
   continua bloqueado até o designer escolher, comportamento sempre
   preservado nas 3 iterações.
3. **Card interno** — `relative z-10 w-full {max-w} max-h-full min-h-0
   flex flex-col rounded-2xl overflow-hidden shadow-2xl
   bg-white dark:bg-dark-{surface|bg}`, segundo filho do wrapper.
   `relative z-10` garante que fica clicável por cima do backdrop (ambos
   são `absolute inset-0` dentro do mesmo wrapper). `{max-w}` é o valor
   **original** de cada modal (o mesmo que existia antes de qualquer
   mudança desta sessão — restaurado, não inventado, ver tabela abaixo)
   — não ficou tudo do mesmo tamanho: cada modal preserva a proporção que
   sempre teve.

| Modal | `max-w` | Alinhamento do wrapper |
|---|---|---|
| `a11y-category-picker-modal` | `max-w-sm` (384px) | centralizado |
| `a11y-spec-modal` | `max-w-sm` | topo (formulário longo, scroll) |
| `a11y-area-modal` | `max-w-sm` | topo |
| `a11y-post-area-detect-modal` | `max-w-sm` | centralizado |
| `a11y-library-required-modal` | `max-w-sm` | centralizado |
| `a11y-tab-order-review-modal` | `max-w-sm` | topo |
| `a11y-batch-summary-modal` | `max-w-sm` | topo |
| `a11y-categories-help-modal` | `max-w-[440px]` | centralizado |
| `onboarding-modal` | `max-w-[420px]` | centralizado |
| `about-hac-modal` | `max-w-sm` | centralizado |

Modais "topo" mantêm o corpo em `flex-1 overflow-y-auto` (formulário/lista
que pode crescer); modais "centralizado" usam
`items-center justify-center` no wrapper externo, pra não ficar "perdido"
encostado no topo de uma área grande.

Fechar continua possível pelo botão X existente no cabeçalho do modal, e
agora também pelo clique no backdrop (exceto o modal bloqueante).

**Efeito colateral corrigido em `core.js`**: o handler global de `Escape`
(fecha o modal visível de maior z-index) lia o `onclick` do backdrop
clicável para decidir se chamava a função de fechamento "com limpeza de
estado" do modal (ex: `cancelTabOrderReview()`, que cancela a captura de
clique sequencial no canvas) ou o `closeModal(id)` genérico. Na iteração
intermediária (sem backdrop), essa leitura passou a ler o `onclick` do
**botão de fechar do cabeçalho** (`button[title="Fechar"|"Cancelar"]
[onclick]` ou `button[aria-label="Fechar"|"Cancelar"][onclick]`) — e essa
é a fonte que permanece no estado atual do código, mesmo com o backdrop
de volta (o backdrop clicável fecha direto pela função, sem passar pelo
handler de Escape; a leitura pelo botão continua sendo a via genérica
usada tanto por Esc quanto por qualquer fechamento futuro). Nenhum modal
ficou sem essa limpeza de estado ao fechar via Esc.

**Validação de estrutura**: como o bug histórico real do hac foi um
`</div>` faltando que fez `onboarding-modal` nascer aninhado DENTRO de
`a11y-categories-help-modal` (modal "abria" via JS mas ficava invisível
porque o pai continuava `hidden`), essa migração foi validada com um
parser de profundidade de `<div>` sobre `modals.html` inteiro
(contagem de abertura/fechamento por nível, não só total) — confirmando
que os 10 modais fecham exatamente no nível raiz, nenhum aninhado dentro
de outro.

**Trade-off aceito**: como `openModal(id)` já esconde qualquer outro
modal visível antes de abrir um novo (rede de segurança existente em
`core.js`, não alterada por esta mudança), nunca há dois modais em tela
cheia sobrepostos ao mesmo tempo — inclusive no caso de
`openA11yWizardCategoryPickerModal()` (troca de categoria durante o
wizard de revisão), que reabre o modal de categorias por cima do
formulário fechando-o primeiro, não empilhando.

## 11. Pendências conhecidas

> **Nota de atualização (2026-09-08)**: a afirmação "nenhuma pendência
> técnica estrutural em aberto" abaixo reflete só a revisão de 2026-09-02
> e está desatualizada — este arquivo não é mais mantido em sincronia
> obrigatória (ver aviso no topo). Para o estado técnico atual, incluindo
> o contrato do subsistema de clone/overlay (o ponto mais frágil do
> plugin, com histórico de 7-8 bugs reais corrigidos em 2026-09-08),
> consulte `docs/tecnico.html` seções [8a](tecnico.html#s8a) e
> [11](tecnico.html#s11).

Nenhuma pendência técnica estrutural em aberto nesta revisão (2026-09-02)
— as duas lacunas identificadas durante o levantamento de regras de
negócio (preenchimento fino mobile de Títulos/Decorativo; seletor de
origem no fluxo manual) foram fechadas na mesma sessão.

Pendência de processo (não técnica): não existe mecanismo formal para a
vertical de acessibilidade receber o sinal de componentes "Outro" (ver
seção 6) — hoje é só um rótulo visível ao designer.
