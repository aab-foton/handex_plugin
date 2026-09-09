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

## 2. Em validação (mexido recentemente, ainda sem confirmação explícita — pode ser alterado livremente até entrar na Seção 1)

Estes itens foram tocados na sessão de 2026-09-08 (reorganização estrutural
de Sections/Grupos por Área, migração de clone INSTANCE→FRAME via
`detachInstance()`, correções sucessivas de posicionamento) e **ainda não
foram confirmados como funcionando** pelo usuário — a Ordem de Tabulação,
em particular, teve uma regressão real reportada e corrigida mais de uma
vez na mesma sessão, sem confirmação final ainda.

- Ordem de Tabulação (clique manual e "Gerar Automaticamente", posiciona-
  mento dos selos dentro do clone, réplica sempre nascendo abaixo do
  original)
  - **Regra de produto explícita (2026-09-08)**: acrescentar item(ns) a
    uma Ordem de Tabulação JÁ EXISTENTE — via manual ("+ Adicionar item")
    ou via Mapeamento Automático reaberto sobre uma área já documentada —
    sempre entra como item ADICIONAL no fim da sequência atual, nunca
    substitui os itens já feitos. A única forma de sobrepor é apagar tudo
    e refazer do zero. O designer pode reposicionar o item novo arrastando
    na lista se precisar que ele entre no meio da ordem — mas isso NÃO é
    aplicado ao canvas automaticamente: excluir um item (ícone de lixeira)
    renumera o canvas na hora, sem precisar de clique extra; já reordenar
    arrastando só atualiza a posição em memória, e o designer precisa
    clicar em "Atualizar" pra nova numeração ser desenhada de fato no
    canvas. Vale igualmente para projetos mobile e web — a origem do
    projeto só decide qual COMPONENTE de selo é desenhado, nunca a
    mecânica de adicionar/editar/excluir itens. "+ Adicionar item" aceita
    shift+clique/marquise pra marcar vários elementos novos de uma vez
    (corrigido na mesma data — antes só aceitava 1 por vez), sempre
    somando ao final da lista, nunca sobrepondo. Bug real corrigido na
    mesma data: `startTabOrderAddItemsFromCard`
    não declarava a origem do projeto antes de desenhar o item novo,
    fazendo-o importar o componente de selo errado (ver
    `docs/changelog.html`, entrada "'+ Adicionar item' importava o
    componente errado").
- Trilha de Swipe (captura, desenho da linha, réplica sempre abaixo,
  nesting da linha dentro do clone)
- Reorganização estrutural de Sections/Grupos por Área (1 Section de sessão
  por página, 1 Grupo por Área contendo todos os artefatos dela)
- Cards Mobile/Web da Home (layout empilhado) e texto de introdução da tela
  inicial
- Ficha de Handoff (estrutura de 3 blocos com instrução + réplica lado a
  lado — ainda nem implementada, só especificada)
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
  protegido e não foi tocado; só a estrutura de canvas/reparenting mudou.

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
