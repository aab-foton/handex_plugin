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
| **Fluxo completo ponta a ponta: marcar tela → capturar (Ordem de Tabulação / Swipe / Leitor de Tela) → Preencher Handoff** — réplica de trabalho nasce ao lado da tela, ordem de clique real preservada, legenda de instruções nasce junto da réplica e é movida pro bloco da Ficha no Preencher Handoff, listagem de telas mostra os cards corretamente com múltiplas telas na mesma Section | 2026-09-11 | `code.js`: `_findFreeTabOrderCopyPosition`, `_fitSectionToChildren`, `_collectA11yOccupiedBounds`, `_ensureLegendBesideClone`, `_getOrCreateFichaBlockSection`, `_findLegendForArea`, os 3 `_create*CloneForArea`, handlers `create-a11y-area`/`insert-ficha-section`/`prepare-ficha-section-edit`; `accessibility.js`: listener `selectionchange`/`_tabOrderClickSequence`/`_swipePathClickSequence`, `renderA11yGroupedList`, `_a11yAreaAccordionEl`; `modals.html`: modal de dica da Ordem de Tabulação | Regride o fluxo inteiro de trabalho, do início ao fim — reabre bugs já corrigidos nesta sessão (ordem de clique embaralhada, réplica nascendo longe da Section/dentro de um vão vazio gigante, cards de tela sumindo da listagem, modal de captura travando). Qualquer mudança aqui exige teste manual completo nos 3 fluxos (Tabulação, Swipe, Leitor de Tela), com pelo menos 2 telas na mesma Section |

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
