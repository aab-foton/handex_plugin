# Funcionalidades protegidas — hac

> **Regra de processo, não documentação de arquitetura.** Este arquivo
> existe pra travar retrabalho: tudo listado na Seção 1 já foi testado e
> aprovado pelo usuário (Augusto) e **não pode ser alterado sem aprovação
> prévia explícita**. Antes de tocar em qualquer arquivo/função ligada a um
> item desta lista, é obrigatório: (1) avisar que a mudança vai afetar algo
> protegido, (2) explicar exatamente o que pode parar de funcionar, (3)
> esperar confirmação explícita antes de editar. Isso vale mesmo que a
> mudança pareça pequena, isolada, ou "só um efeito colateral" de outra
> correção.
>
> Este documento é atualizado só quando o usuário confirma explicitamente
> que testou algo — nunca por inferência de "deveria estar funcionando" ou
> "build passou sem erro". Build/lint validam sintaxe, não comportamento
> real no Figma.

## Como usar este documento

- **Antes de editar um arquivo**: verifique se ele aparece na coluna
  "Arquivos/funções envolvidos" de algum item da Seção 1. Se sim, pare e
  siga o processo de aprovação acima.
- **Ao terminar uma tarefa que tocou em algo protegido** (com aprovação já
  dada): atualize a linha correspondente com a data da nova validação, ou
  mova o item pra Seção 2 se a mudança ainda não foi confirmada de novo
  pelo usuário.
- **Ao confirmar uma funcionalidade nova como estável**: mova da Seção 2
  pra Seção 1, registrando a data da confirmação.

## 1. Protegidas (testadas e aprovadas — não mexer sem aprovação prévia)

| Funcionalidade | Confirmado em | Arquivos/funções envolvidos | O que quebra se mexer sem cuidado |
|---|---|---|---|
| **Marcar Área** — selecionar uma seção da tela, dar rótulo, virar selo numerado no canvas | 2026-09-08 | `code.js`: handler `create-a11y-area`, `_createTabOrderBadge`-independente (o selo da Área é criado por código próprio, não reaproveita o selo de item de Tabulação); `accessibility.js`: fluxo de abertura do modal de rótulo | Perder a criação do selo/marcador quebra a entrada de TODO o resto do fluxo (specs, Tabulação, Swipe e Handoff dependem de uma Área já marcada existir) |
| **Especificações / Leitor de Tela** (5 categorias, Mapeamento Automático, matching DSC) — comportamento de CONTEÚDO da spec (campos, categorias, cards) | 2026-09-08 | `code.js`: `_a11yScanArea`, `_resolveDscComponentA11yMatch`/`_resolveDecorativeA11yMatch`/`_resolveImageA11yMatch`; `accessibility.js`: fluxo do Mapeamento Automático e do formulário de spec | Regride o núcleo do produto — é a funcionalidade que gera a documentação real de acessibilidade que o time de dev consome. Qualquer mudança aqui exige teste ponta a ponta nas 5 categorias, não só numa |
| **Fluxo completo ponta a ponta: marcar tela → capturar (Ordem de Tabulação / Swipe / Leitor de Tela) → Preencher Handoff**, incluindo a **árvore de layers da Ficha** (Section → `[HAC] Documentação` → `Tela N` → `[HAC] Assets do Handoff` → Grupo da Área + blocos `[HAC] {Funcionalidade}`, cada um com `[HAC] Instruções de {Func}` ao lado de `[HAC] Handoff - {Func}`) e o **dimensionamento correto de todos os containers** (Section abraça o conteúdo sem vãos, textos com largura real, réplica em tamanho real ao lado dos selos) | 2026-09-14 | `code.js`: `_findFreeTabOrderCopyPosition`, `_fitSectionToChildren`, `_collectA11yOccupiedBounds`, `_reparentIntoSection`, `_ensureLegendBesideClone`, `_getOrCreateA11ySessionSection`, `_getOrCreateFichaAreaGroup`, `_ensureTelaTituloCard`, `_syncTelaTituloCardWidth`, `_repairCollapsedAutoLayoutHeights`, `_getOrCreateFichaItensFrame`, `_getOrCreateFichaBlockSection`, `_getOrCreateFichaInstrucoesFrame`, `_appendFichaBlockTitle`, `_buildFichaLegendColumn`, `_getOrCreateFichaHandoffFrame`, `_fitFichaHandoffFrameToChildren`, `_findLegendForArea`, os 3 `_create*CloneForArea`, handlers `create-a11y-area`/`insert-ficha-section`/`prepare-ficha-section-edit`; `accessibility.js`: listener `selectionchange`/`_tabOrderClickSequence`/`_swipePathClickSequence`, `renderA11yGroupedList`, `_a11yAreaAccordionEl`; `modals.html`: modal de dica da Ordem de Tabulação | Regride o fluxo inteiro de trabalho, do início ao fim, E/OU reabre qualquer um dos ~15 bugs geométricos encadeados corrigidos entre 2026-09-11 e 2026-09-14 (ver histórico abaixo): ordem de clique embaralhada, réplica nascendo longe da Section/dentro de um vão vazio gigante, cards de tela sumindo da listagem, modal de captura travando, textos com largura zerada quebrando letra por letra, frame de Handoff colapsado/encolhido, réplica empilhada abaixo das instruções em vez de ao lado, Section com vão vertical enorme. Qualquer mudança aqui exige teste manual completo nos 3 fluxos (Tabulação, Swipe, Leitor de Tela), com pelo menos 2 telas na mesma Section, **sem dar duplo clique manual na Section** (isso mascara bugs de dimensionamento por código, disparando o auto-fit nativo do Figma) |

## 2. Em validação (mexido recentemente, ainda sem confirmação explícita — pode ser alterado livremente até entrar na Seção 1)

- Cards Mobile/Web da Home (layout empilhado) e texto de introdução da tela
  inicial
- Ficha de Handoff — geração via "Preencher Handoff"/"Gerar Handoff"
  (botões renomeados em 2026-09-11) confirmada estável junto com o fluxo
  de captura (ver Seção 1), mas o fluxo de "Editar" uma seção já
  finalizada (recriar clone, marcar bloco como desatualizado) não foi
  testado/confirmado nesta rodada — segue em validação.
- **Reparenting/estrutura de canvas de Especificações (Leitor de Tela)** —
  MOVIDO da Seção 1 pra cá em 2026-09-08: `create-unified-spec` passou a
  clonar uma réplica da área e desenhar specs sobre o clone (nunca mais
  sobre o frame original), com pluginData novo `hacSpecForArea`/
  `hacSpecCloneForArea`/`hacSpecGroupForClone` e handler
  `delete-specs-for-area`. Mudança feita com aprovação explícita do
  usuário mesmo estando protegida ("a ideia é essa mesmo") — snapshot do
  comportamento anterior salvo em
  `.rollback-snapshots/create-unified-spec_pre-replica_2026-09-08.js` e em
  memória (`hac_rollback_create_unified_spec_2026_09_08`). O CONTEÚDO da
  spec (categorias, campos, matching DSC — linha acima) continua
  protegido e não foi tocado; a captura de Leitor de Tela (réplica +
  legenda) já entrou na Seção 1 junto com Tabulação/Swipe — só o fluxo
  específico de EDITAR uma spec dentro do clone segue aqui.

Quando o usuário confirmar qualquer um destes como testado e aprovado,
mover a linha correspondente pra Seção 1 com a data da confirmação.

## Histórico de mudanças neste documento

- **2026-09-08**: criação do documento, a pedido do usuário, após uma
  sessão com múltiplas regressões sucessivas na Ordem de Tabulação. Escopo
  inicial da Seção 1 definido por confirmação explícita, pergunta por
  pergunta — nenhum item foi assumido como protegido sem o usuário
  confirmar diretamente.
- **2026-09-08 (mesmo dia, mais tarde)**: reestruturação de hierarquia —
  artefatos (specs, Tabulação, Swipe, Ficha) passam a ficar soltos direto
  na Section de sessão, sem aninhar no Grupo da Área; specs ganham
  clonagem de réplica (item movido da Seção 1 pra Seção 2, ver acima).
- **2026-09-11**: usuário confirma como ESTÁVEL o fluxo completo de Ordem
  de Tabulação, Swipe e Leitor de Tela — da marcação da tela até o
  Preencher Handoff, com múltiplas telas na mesma Section. Promovido da
  Seção 2 pra Seção 1 (nova linha "Fluxo completo ponta a ponta"). Chegou
  a esse estado depois de uma sessão longa de correções encadeadas
  (detalhes completos em `docs/changelog.html`, entrada "ESTÁVEL: fluxo de
  Ordem de Tabulação, Swipe e Leitor de Tela ponta a ponta") — incluindo
  uma tentativa de consolidação arquitetural (Section+Ficha num único
  container com Auto Layout) que chegou a ser implementada, quebrou
  visivelmente (réplicas comprimidas/invisíveis) e foi revertida
  cirurgicamente no mesmo dia. Item "Reparenting/estrutura de canvas de
  Especificações" da Seção 2 estreitado — só o fluxo de EDITAR uma spec já
  criada segue em validação, a captura em si já está protegida.
- **2026-09-11 a 2026-09-14**: reorganização pedida pelo usuário da árvore
  de layers da Ficha (Section → `[HAC] Documentação` → `Tela N` →
  `[HAC] Assets do Handoff` → Grupo da Área + blocos `[HAC] {Func}`, cada
  um com Instruções + Handoff lado a lado), com restrição explícita de
  **não tocar em como a captura funciona** (ordem de clique, selos,
  trilha, specs — só onde os nós moram e como são dimensionados). Levou
  ~15 rodadas de bugs geométricos encadeados até estabilizar, cada um
  reportado com print e investigado por agente especializado antes de
  corrigir (nunca por suposição). Causas raiz reais, na ordem em que foram
  descobertas — registradas aqui pra não se repetirem:
  - **Grupo da Área** (selo + frame original marcado) passou a viver
    dentro de `[HAC] Assets do Handoff` (antes ficava solto na Section) —
    resolvido só na primeira captura de qualquer funcionalidade daquela
    tela (`_ensureLegendBesideClone`), nunca em `create-a11y-area`, porque
    `Tela N` depende de `area.id` que só existe depois do `figma.group()`.
  - **`layoutSizingHorizontal='FILL'` nunca é a resposta certa quando o
    pai também é Hug** — ficou provado 3 vezes (Título Card, Instruções,
    textos da Legenda) que FILL empilhado sobre uma cadeia de pais Hug
    produz largura degenerada (~0), texto quebrado letra por letra na
    vertical. Solução definitiva adotada: **largura numérica explícita**
    (`resizeWithoutConstraints` calculado a partir do pai/conteúdo real),
    nunca mais FILL nos textos da Ficha.
  - **`resizeWithoutConstraints` chamado DEPOIS de setar `AUTO`** faz a
    API do Figma reverter o eixo pra FIXED com o valor passado — travava a
    altura de "Passos"/"Assets"/linhas da Legenda em 1px. Correção: sempre
    reafirmar `AUTO` (ou o sizing mode desejado) **depois** de qualquer
    `resizeWithoutConstraints`, nunca só antes.
  - **`[HAC] Handoff - {Func}` com Auto Layout real (mesmo com filhos
    ABSOLUTE) não funciona** — um filho `ABSOLUTE` é ignorado pelo cálculo
    de Hug do pai, então o frame colapsava e a réplica aparecia
    espremida/cortada. Tentado 2x (fluxo + ABSOLUTE, e Auto Layout "só
    pelo Hug"), revertido as 2 vezes. Solução final: `layoutMode='NONE'`
    + dimensionamento 100% manual por bounding box
    (`_fitFichaHandoffFrameToChildren`), chamado toda vez que o conteúdo
    muda.
  - **Um `ReferenceError` real** (`beforeBB` usado fora do escopo onde
    existia) ficava engolido por um `catch` silencioso — o overlay de
    selos nunca era movido junto com a réplica, e a função que dimensiona
    o Handoff nunca rodava, inflando a Section pra ~2520px de altura sem
    nenhum erro visível. Lição: **todo catch de reparenting geométrico
    passou a ter `figma.notify`**, não só `console.error` — o console
    sozinho já escondeu 2 bugs reais nesta sessão.
  - **`SectionNode` não tem auto-fit via Plugin API** — só via interação
    manual do designer (duplo clique). Cogitado migrar pra FRAME com Auto
    Layout; **descartado** depois de mapear o impacto: o conteúdo da
    Section é todo de posição livre (não fluxo), então um FRAME acabaria
    com `layoutMode='NONE'` de qualquer forma (mesmo padrão do item
    acima) — nenhum ganho real de "auto-ajuste nativo", e a migração
    exigiria mover cada filho de Sections já existentes em arquivos de
    produção (não existe API pra trocar o tipo de um node). Mantida a
    Section, corrigido `_fitSectionToChildren`: media pelo
    `absoluteBoundingBox`, que em nodes com `clipsContent=false` inclui
    transbordamento inteiro (selos, overlays) — inflava a Section pra
    vãos enormes. Corrigido pra medir por `absoluteTransform` (posição
    real do node) + `width`/`height` declarados, e a Section passou a ser
    redimensionada de novo depois que a réplica sai dela (pro
    `handoffFrame`) — antes ficava com o tamanho antigo, abraçando um
    espaço vazio onde o clone tinha nascido antes de ser movido.
  - Cabeçalho de "Handoff de acessibilidade" (barra verde, por
    `_ensureDocumentacaoHeader`) **removido por completo** a pedido do
    usuário — não só desativado, a função não existe mais.
  - Moldura + título da réplica de trabalho (retângulo cinza + texto,
    `_ensureCloneWorkFrame`) **desativados** (não removidos do arquivo,
    viraram no-op que só limpa nodes de sessões anteriores) — atrapalhavam
    o layout dentro do Auto Layout dos blocos.
  - **Fixação lazy/idempotente é insuficiente sozinha**: várias correções
    só valiam pro caminho de CRIAÇÃO nova (`if (!node) { ...aplica a
    correção... }`), nunca pro caminho de REAPROVEITAMENTO (`else`) — um
    node "herdado" de uma execução anterior à correção ficava
    geometricamente quebrado pra sempre, mesmo com a árvore de Layers
    certa. Onde isso importava de verdade, a propriedade passou a ser
    reafirmada **incondicionalmente**, fora do `if`/`else` de criação.
  - Detalhes completos, print a print, no `docs/changelog.html`.
