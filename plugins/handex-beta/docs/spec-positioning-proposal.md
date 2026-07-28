# Handex — Proposta: posicionamento manual de Specs (confirmação explícita)

> Status: proposta desenhada, não implementada. Registrado em 2026-07-08 a partir de uma pergunta sobre permitir ao designer escolher onde a spec é criada no canvas.

## Problema

Hoje (`code.js:2973-3117`), a posição do `specCard` é sempre calculada automaticamente a partir de `opts.guideSide` (right/left/top/bottom, offset fixo de 100px do elemento) ou empilhada por letra (`_letterMap`). O grupo inteiro (`specGroup`) é travado (`locked = true`, linha 3117) na mesma operação síncrona que cria a spec — não existe janela para o designer ajustar a posição antes do lock.

Em telas densas, o posicionamento automático relativo frequentemente colide com outros elementos ou fica fora da área visível — não há tratamento de overlap/colisão entre múltiplas specs.

## Opção descartada: seleção dupla (elemento + marcador de posição)

Considerada e descartada: exigiria que o designer criasse um objeto extra só para marcar "aqui" antes de rodar a spec, adicionando um passo manual e uma convenção de seleção (1º item = alvo, 2º item = destino) que não é auto-explicativa — vai contra a filosofia "handoff express" do produto.

## Proposta escolhida: destravar com confirmação explícita

**Fluxo**:
1. Designer preenche o formulário de spec normalmente (`confirmSpecProperties`, `specifications.js:1426`) e confirma.
2. Backend cria a spec **destravada** (`specGroup.locked = false`, ao invés de `true` na criação).
3. Um toast/notificação aparece: *"Especificação criada — arraste para posicionar. Clique em Concluir quando pronto."*
4. A UI do plugin mostra um estado "pendente de confirmação" para aquela spec (ex: badge ou botão "Concluir posicionamento" na lista de specs do hub do frame).
5. Ao confirmar, dispara uma nova mensagem `lock-spec` com o `specId`, que localiza o grupo (`figma.getNodeById`) e aplica `locked = true` especificamente naquele grupo.

## Mudanças necessárias

### Backend (`code.js`)
- Linha 3117: trocar `specGroup.locked = true` por `specGroup.locked = false` (mudança de 1 linha no comportamento de criação).
- Novo handler `lock-spec`: recebe `{ specId }`, localiza o nó (`figma.getNodeById(specId)`), valida que é um grupo de spec (checar prefixo `[Spec | ...]` no nome, mesma convenção já usada), aplica `.locked = true`. Responde com `spec-locked` para a UI atualizar estado.
- Payload de `spec-created` (linha 3120-3139) já retorna `id: specGroup.id` — suficiente para a UI rastrear qual spec está pendente sem mudança adicional aqui.

### Frontend (`specifications.js` / UI)
- Ao receber `spec-created`, marcar a spec como `pendingConfirmation: true` no estado local (`createdSpecs`) e renderizar um indicador visual (ex: badge amarelo "Posicionando…" + botão "Concluir").
- Botão "Concluir posicionamento" dispara `parent.postMessage({pluginMessage: {type: 'lock-spec', specId}})`.
- Ao receber `spec-locked`, remover o indicador de pendência e atualizar o item na lista para o estado normal (travado).

### Risco a mitigar
- **Specs esquecidas destravadas**: se o designer nunca clicar em "Concluir", a spec fica editável indefinidamente — quebra a garantia de integridade que o lock existe para dar. Mitigação: ao gerar a Ficha de Handoff final (`create-handoff`), verificar se há specs pendentes de confirmação e travá-las automaticamente nesse momento (fallback de segurança), avisando o usuário que isso ocorreu.
- **Múltiplas specs pendentes simultâneas**: se o designer cria várias specs em sequência sem confirmar cada uma, a UI precisa listar todas as pendências claramente, não só a última — evitar que uma fique esquecida sem o designer perceber.

## Por que essa opção e não a de seleção dupla

Mantém o fluxo de criação em um único passo (seleção + formulário, igual hoje), sem exigir que o designer aprenda uma convenção nova de seleção múltipla. O controle de posição fica onde ele já naturalmente aconteceria — arrastando o card no canvas, que é a interação mais direta possível — em vez de forçar a posição via um objeto proxy artificial.

## Esforço estimado

Baixo-médio: 1 mudança de linha + 1 handler novo simples no backend; no frontend, é principalmente estado de UI (badge, botão, mensagem) reaproveitando o padrão de comunicação `postMessage` já existente. Não exige nenhuma API nova da Plugin API, nem toca em nenhuma das limitações já mapeadas (ConnectorNode/FigJam etc.).
