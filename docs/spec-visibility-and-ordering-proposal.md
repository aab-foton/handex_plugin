# Handex — Propostas: ocultar linhas, destravar grupo e ordenação de camadas por tag

> Status: propostas desenhadas, **não implementadas** — por isso os ícones/botões descritos aqui ainda não aparecem na UI do plugin. Registrado em 2026-07-08, a partir de ideias trazidas para reduzir poluição visual e dar mais controle ao designer quando múltiplas specs se acumulam no canvas.

## Contexto: por que isso importa

Já documentado em `docs/plugin-capabilities/02-criacao-specs.md`: a regra de empilhamento de specs (`_letterMap`, code.js:2924-3009) garante ausência de sobreposição **dentro do par (letra, lado)**, mas não faz nenhuma checagem cruzada entre lados diferentes nem entre specs de tags distintas que colidam visualmente por acaso. Em telas densas com muitas specs, isso gera poluição visual — linhas cruzando cards, sobreposição entre lados.

## Proposta 1 — Ocultar linhas por grupo de tag

**Ideia**: um botão no header de cada agrupamento de letra (na lista do plugin) que oculta **apenas as linhas conectoras** (e dots) daquela tag, mantendo os cards de spec visíveis no canvas.

### O que já existe e pode ser reaproveitado

`toggleSpecGroupVisibility(frameId, letter)` (`specifications.js:743-758`) já oculta o **spec inteiro** por grupo de letra, via mensagem `hide-node` para cada `spec.id`. A infraestrutura de estado (`frame.specGroupVisible[letter]`) e o botão de UI por grupo já existem — a mudança é uma variante que atinge só os nós filhos nomeados, não o grupo completo.

### Desenho técnico

- Cada linha/dot já tem nome fixo dentro do grupo da spec: `'Conector'`, `'DotInicio'`, `'DotFim'` (code.js:3058/3071/3082/3092) — são endereçáveis.
- Novo handler no backend, `hide-spec-lines`: recebe `{ specIds: [] }` (specs daquela letra), localiza cada `specGroup` por id, busca filhos por nome (`'Conector'`, `'DotInicio'`, `'DotFim'`) e aplica `.visible = false`/`true` só neles — sem tocar no `specCard`.
- Frontend: novo botão no header do agrupamento (ao lado do já existente `toggleSpecGroupVisibility`), com estado próprio (`frame.specLinesVisible[letter]`, análogo ao padrão já usado para `specGroupVisible`).
- Reaproveita o padrão de mensageria (`postMessage`) e persistência (`saveToStorage`) já estabelecido — baixo risco de introduzir um padrão novo.

### Esforço estimado
Baixo — é uma variação direta de uma função já existente, sem tocar em geometria/cálculo de posição.

## Proposta 2 — Ordem de camadas (z-index) alfabética entre tags

**Ideia**: quando linhas de tags diferentes se cruzam visualmente, a linha da tag B deve sempre aparecer visualmente "atrás"/abaixo da linha da tag A, C abaixo de B, e assim sucessivamente — uma ordem de empilhamento previsível, não dependente da ordem em que o designer criou cada spec.

### Como o Figma decide profundidade (z-index) hoje

Cada `create-unified-spec` cria seu próprio grupo (`specGroup`) diretamente em `figma.currentPage` (code.js:3115) — a ordem de empilhamento entre grupos de specs diferentes é simplesmente a ordem de inserção na lista de filhos da página. **Não há reordenamento por letra hoje**: a spec criada por último sempre fica visualmente por cima das anteriores, independente da tag.

### Desenho técnico

> **Depende da correção do bug de tags alfanuméricas** (`docs/spec-alphanumeric-tags-bug.md`) — a regex `[A-Z]` usada aqui precisa ser a mesma regex corrigida (`[A-Z]\d*(?:\.\d+)*`), e a comparação de ordem precisa ser "natural sort" hierárquico (A < A1 < A1.1 < A1.2 < A2 < B), não comparação de string ingênua — do contrário "A10" ordenaria antes de "A2".

Após criar `specGroup` (code.js:3115-3117), antes ou logo depois do `.locked = true`, inserir uma etapa de reordenação:

1. Buscar todos os grupos de spec existentes na página (mesmo padrão de varredura já usado em `_letterMap`, via regex corrigida que reconhece tags hierárquicas no nome).
2. Parsear cada tag em componentes comparáveis (ex: `"A1.1"` → `["A", 1, 1]`) e determinar o índice de inserção correto por comparação natural, não alfabética simples: o novo `specGroup` deve ficar posicionado **antes** (mais abaixo na pilha, `insertChild` com índice menor) dos grupos de tag hierarquicamente posterior, e **depois** dos de tag anterior.
3. Usar `figma.currentPage.insertChild(index, specGroup)` para reposicionar o grupo na ordem correta, em vez de deixá-lo simplesmente no topo da pilha (comportamento padrão de `appendChild`/`figma.group`).

### Ressalva importante

Isso reordena a **profundidade** (o que aparece visualmente por cima/por baixo quando há sobreposição), não a **posição X/Y** — os cards continuam nas mesmas coordenadas calculadas pela regra de empilhamento já existente. É uma correção de camadas, não de layout.

### Esforço estimado
Baixo-médio — a lógica de varredura já existe (reaproveitando o padrão de `_letterMap`); a novidade é o cálculo de índice de inserção e a chamada a `insertChild`, que precisa ser testada com cuidado para não quebrar a ordem em casos com muitas letras/specs.

## Proposta 3 — Desbloquear grupo de spec por tag (companion da Proposta 1)

**Ideia** (trazida em 2026-07-08): assim como o botão de ocultar linhas por grupo, um botão no mesmo header de agrupamento para **destravar o grupo inteiro** (`specCard` + linha + dots) de todas as specs daquela tag de uma vez — hoje a única forma de editar uma spec travada é destravar manualmente pelo painel de camadas do Figma, nó por nó.

### O que já existe

`specGroup.locked = true` é aplicado por spec individual no momento da criação (`code.js:3117`). Não há hoje nenhum mecanismo de destravamento em lote — nem por grupo, nem geral.

### Desenho técnico

- Novo handler no backend, `unlock-spec-group`: recebe `{ specIds: [] }` (todas as specs daquela letra/tag, mesmo padrão de agrupamento já usado nas Propostas 1 e 2), localiza cada `specGroup` por id via `figma.getNodeById`, aplica `.locked = false`.
- Frontend: terceiro botão no header do agrupamento (ao lado dos de ocultar linhas e ocultar grupo), ícone de cadeado aberto/fechado — dispara a mensagem e mostra um toast de confirmação, já que destravar é uma ação que reduz a garantia de integridade do handoff (deve ser deliberada, não acidental).
- **Re-lock**: se o designer editar manualmente e quiser re-travar depois, um segundo clique no mesmo botão (toggle) ou uma ação explícita "Concluir edição" deve rechamar o handler com `.locked = true` — não deixar specs destravadas indefinidamente sem sinalização visual clara de que aquele grupo está fora do estado padrão "protegido".
- Reaproveita exatamente o mesmo padrão de mensageria/varredura por tag das Propostas 1 e 2 — os três botões podem, inclusive, compartilhar a mesma função de "encontrar specs da tag X", parametrizada pela ação (ocultar linha / ocultar grupo / travar-destravar).

### Risco a mitigar

Igual ao risco já identificado na proposta de posicionamento manual (`docs/spec-positioning-proposal.md`): specs destravadas e esquecidas quebram a garantia de integridade do handoff. Mitigação: indicador visual persistente (badge no agrupamento) enquanto qualquer spec daquela tag estiver destravada, e o mesmo fallback de segurança já proposto — travar automaticamente tudo ao gerar a Ficha de Handoff final, avisando o usuário se algo foi travado nesse momento.

### Esforço estimado
Baixo — mesmo padrão técnico das Propostas 1 e 2, só troca a propriedade manipulada (`visible` → `locked`).

## Relação entre as três propostas

Todas complementares, não dependentes umas das outras — dá para implementar qualquer uma isoladamente, mas o desenho ideal é como um **conjunto de 3 ações por grupo de tag** no mesmo header (ocultar linhas, ocultar grupo inteiro, travar/destravar), compartilhando a mesma lógica de varredura por tag. Prioridade sugerida: Proposta 1 (ocultar linhas) e Proposta 3 (destravar grupo) primeiro — são as mais baratas e dão controle direto ao usuário; Proposta 2 (ordenação de camadas) é polimento automático que pode vir depois, e depende da correção do bug de tags alfanuméricas (`docs/spec-alphanumeric-tags-bug.md`).
