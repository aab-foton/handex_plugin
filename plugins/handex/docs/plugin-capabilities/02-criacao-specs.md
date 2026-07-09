# 02 — Criação de Specs

Handler `create-unified-spec`, `code.js:2650-3143`.

## Capacidades

- Cria um card visual (Frame com auto-layout) contendo: badge de letra (tag em círculo 42×42), pill de categoria opcional, nota técnica, lista de propriedades (nome/token DSC/valor), bloco de exceções (Erro/Sucesso/Alerta/Confirmação).
- 4 modos de posicionamento relativo ao elemento (`guideSide`: right/left/top/bottom), com empilhamento automático por letra via `_letterMap` (code.js:2924-3009).
- Todos os nós gerados ficam `locked = true` ao final — preserva integridade do handoff (decisão de produto documentada em `CLAUDE.md`).

## Regra de empilhamento por letra e lado (confirmado no código, 2026-07-08)

O sistema varre `figma.currentPage.children` procurando grupos de spec já existentes (formato `[Spec | {letra} | {lado}]`, com suporte a formato legado `[Spec] ... /Ficha:{lado}`) e decide a posição da nova spec assim:

1. **Mesma letra + mesmo lado**: empilha na direção apropriada daquele lado — em `right`/`left` empilha para baixo (`bottom + 32px`); em `top` empilha para cima (`topY - cardH - 32px`). Nunca sobrepõe outra spec da mesma letra no mesmo lado (code.js:2975-2982).
2. **Letra diferente + mesmo lado**: abre nova coluna, à direita da coluna mais à direita (ou à esquerda, se `side === 'left'`) — gap de 64px entre colunas (code.js:2983-2993).
3. **Primeira spec daquele lado**: posiciona a 100px do elemento, nunca sobre o frame original (code.js:2994+).

**Importante — o cálculo é isolado por lado, não global**: o filtro `newFmt[2] !== side` (code.js:2950) ignora specs de outros lados ao calcular a posição. Uma spec letra "A" à direita e uma spec letra "A" no topo são calculadas de forma totalmente independente — **não há verificação cruzada entre os 4 lados**. Isso significa que a garantia de não-sobreposição vale dentro de (letra, lado), não entre lados diferentes: em teoria, specs de lados opostos podem colidir geometricamente se o layout do frame for compacto o suficiente, já que cada lado só considera o `_anchorBounds` do elemento, não o que já foi desenhado nos outros lados.

## BUG CONFIRMADO — tags alfanuméricas (A1, A1.1) quebram o empilhamento

A regex que reconhece specs existentes para calcular empilhamento (code.js:2948) exige **exatamente uma letra maiúscula única** (`[A-Z]`) — não reconhece tags no formato `A1`, `A2`, `A1.1`, `A1.2`, que são usadas na prática pelos designers (confirmado pelo usuário em 2026-07-08). Uma spec com tag alfanumérica nunca entra no `_letterMap`, sempre cai no branch de "primeira spec daquele lado" mesmo quando já existem outras specs ali, e **pode colidir visualmente** com specs existentes. Ver `docs/spec-alphanumeric-tags-bug.md` para causa raiz completa e correção proposta. Este é um bug de correção prioritário, não uma limitação aceitável — afeta a garantia central de "specs nunca se sobrepõem" para um formato de tag já em uso real.

## Limitação estrutural confirmada — linha estática, não conector nativo

A linha conectora usa **`figma.createVector()`** com path calculado uma única vez no momento da criação (code.js:3070-3072) — **não recalcula** se o card ou o elemento-alvo forem movidos depois.

**Testado e confirmado em 2026-07-08**: uma tentativa de usar `figma.createConnector()` (`ConnectorNode` nativo, com ancoragem automática via `magnet: 'AUTO'`) falhou em runtime com `TypeError: not a function`. Causa raiz confirmada na documentação oficial do Figma: **`createConnector()` é exclusivo de arquivos FigJam** — "It's not possible to create connector nodes in a Figma [Design] file". O manifest do Handex é `editorType: ["figma", "dev"]` (sem FigJam), e como o produto documenta telas de produto (que vivem em arquivos Design), não há cenário de uso real onde essa API estaria disponível — não é contornável por configuração. Ver `docs/native-connector-spike-result.md` para o registro completo do teste.

**Consequência prática**: a linha não se realinha automaticamente. Mover o elemento original ou o card exige recriar a spec para corrigir o posicionamento visual.

## Limitação de posicionamento — proposta em desenho

Hoje não há janela para o designer ajustar a posição do card antes do lock — a trava acontece na mesma operação síncrona da criação. Uma proposta de UX foi desenhada (não implementada) para permitir arrastar o card livremente por um período antes de confirmar/travar explicitamente — ver `docs/spec-positioning-proposal.md`.

## Diferença de camadas de conformidade — decisão de produto deliberada

Specs carregam duas informações de conformidade **propositalmente separadas e nunca fundidas**:
1. Scan automatizado (`isDS` por propriedade) — resultado objetivo do algoritmo.
2. Declaração humana de auditoria (`checkDone`, `semDesvios`, `observacoes`, `ressalvas[]`) — julgamento do designer.

Dots de conformidade por propriedade foram **removidos deliberadamente** da ficha final em versão anterior — decisão documentada em `CLAUDE.md`: "criavam falsa impressão de 100% conforme; acurácia é responsabilidade do designer". Isso é uma escolha de produto sobre honestidade de sinal, não uma lacuna técnica.

## Leitura de produto

A limitação de linha estática (não-recalculável) e a ausência de reposicionamento livre pós-criação são, hoje, as duas fricções reais mais tangíveis do fluxo de Specs. Ambas têm caminho de solução desenhado (Annotation API nativa como complemento visual; confirmação explícita de posicionamento) documentado e pronto para implementação quando priorizado.
