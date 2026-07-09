# Handex — Bug confirmado: tags alfanuméricas (A1, A1.1) quebram o empilhamento de specs

> Confirmado em 2026-07-08, a partir de uso real reportado pelo usuário: designers já usam tags como "A1", "A2", "A1.1", "A1.2" na prática. O sistema de empilhamento não reconhece esse formato.

## Causa raiz

`code.js:2948`, a regex que identifica specs já existentes na página para calcular empilhamento:

```js
const newFmt = n.name.match(/^\[Spec \| ([A-Z]) \| ([a-z]+)\] /);
```

Exige **exatamente uma letra maiúscula** entre pipes. O nome do grupo é montado em `code.js:3116`:

```js
specGroup.name = `[Spec | ${opts.letter} | ${_specSide}] ${node.name}`;
```

Sem nenhuma validação de formato de `opts.letter` antes disso (`tagText.characters = opts.letter`, code.js:2717, também sem validação). Se `opts.letter` for `"A1"` ou `"A1.1"`, o nome final fica `[Spec | A1.1 | right] ...`, que **não casa** com a regex `[A-Z]` (só aceita 1 caractere), nem com o formato legado `[Spec]` puro.

## Consequência real

Uma spec com tag alfanumérica:
1. **Nunca entra no `_letterMap`** — o sistema não a "enxerga" ao calcular onde posicionar a próxima spec.
2. Cai sempre no branch de "primeira spec daquele lado" (`code.js:2994+`), mesmo que já existam outras specs (de tags simples ou alfanuméricas) naquele mesmo lado.
3. **Risco real de sobreposição**: se já existe uma spec "A" (ou "A1") naquele lado, uma nova spec "A1.1" pode ser desenhada exatamente na mesma posição de partida (100px do elemento), colidindo visualmente com a spec existente.

Isso não é uma limitação teórica — é um bug ativo que afeta o uso documentado do produto (BUSINESS_RULES.md e guide.html citam exemplos como "A, B, C1" como tags válidas; o uso real relatado inclui formatos ainda mais complexos como "A1.1").

## Correção necessária

A regex e a lógica de agrupamento (`_letterMap`, `_specLetter`) precisam reconhecer tags alfanuméricas com ponto, não só `[A-Z]` único. Proposta de regex ampliada:

```js
// Aceita: A, B, A1, A2, A1.1, A1.2, C10, etc.
const newFmt = n.name.match(/^\[Spec \| ([A-Z]\d*(?:\.\d+)*) \| ([a-z]+)\] /);
```

Mudanças necessárias em conjunto:
- `code.js:2948` (regex de leitura do formato novo).
- `code.js:2961` (regex de leitura do formato legado, se aplicável ao mesmo problema).
- Confirmar se `BUSINESS_RULES.md` (limite de 2 caracteres para tag) precisa ser atualizado para refletir o formato real em uso (ex: "A1.1" tem 4 caracteres) — **a documentação de negócio pode estar desatualizada frente ao uso real**, isso deve ser validado com o time de produto antes de assumir qual é o limite correto.

## Correção complementar — validar formato na entrada (frontend)

Além de corrigir a leitura no backend, o ponto de origem do problema é que o campo de tag no formulário de criação de spec (frontend, `specifications.js`, modal de criação) aceita **qualquer string livre** sem validação de formato. Proposta adicional levantada pelo usuário: validar na entrada, não só corrigir a leitura depois.

- **Tooltip/hint no campo de tag**: exibir a convenção esperada diretamente no campo (ex: placeholder ou texto de ajuda "Formato: A, B, A1, A2, A1.1, A1.2..."), deixando explícito o padrão hierárquico aceito.
- **Bloqueio de formato inválido**: validar o input contra a regex corrigida (`/^[A-Z]\d*(\.\d+)*$/`) antes de permitir confirmar a spec — se o designer digitar um formato fora do padrão (ex: "a1", "1A", "A-1"), bloquear o botão de confirmar e mostrar mensagem de erro inline, em vez de aceitar e gerar uma spec que depois quebra o empilhamento silenciosamente.
- Isso é preferível a só corrigir a leitura no backend: previne o problema na origem, e evita a situação atual onde specs malformadas já existem no canvas sem que o designer soubesse que aquele formato não seria reconhecido.

### Risco de compatibilidade retroativa

Specs já criadas no canvas com tags fora do padrão (antes da correção) continuam com nomes que não batem na regex corrigida também, a menos que sejam recriadas. Validar apenas na entrada de **novas** specs não corrige o que já existe — vale avaliar, ao implementar, se compensa também rodar uma correção/relatório de specs existentes com tags fora do padrão no arquivo do usuário (fora de escopo deste documento, mas relevante mencionar como consequência prática).

## Relação com a ordenação alfabética de camadas (proposta separada)

A Proposta 2 de `docs/spec-visibility-and-ordering-proposal.md` (ordem de camadas A-B-C-D-E) precisa ser desenhada **considerando ordenação hierárquica**, não alfabética simples de caractere único: "A1.1" deve ordenar como "dentro de A1, depois de A1 mas antes de A2", não como uma string comparada char-a-char ingenuamente (o que colocaria "A10" antes de "A2" numa comparação de string pura, por exemplo). A ordenação correta exige parsear a tag em componentes numéricos (`A`, `1`, `1`) e comparar por partes — um "natural sort", não `localeCompare`/comparação de string direta.

## Prioridade

Este é um **bug de correção**, não uma proposta de melhoria — deve ser tratado com prioridade mais alta que as propostas de visibilidade/ordenação de camadas, já que afeta a garantia central de "specs nunca se sobrepõem" que o produto promete hoje, para um formato de tag já em uso real.
