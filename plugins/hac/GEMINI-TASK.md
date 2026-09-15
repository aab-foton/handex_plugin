# Tarefa para o agente Gemini — hac

Esta é uma tarefa NOVA. Se você está vendo tarefas antigas neste arquivo
(sobre a lib `[HAC] Handoff Super DSC Mobile e Web`, verificação de
componentes publicados), ignore-as — foram concluídas em sessão anterior
(resultado salvo em `src/plugin/refs/hac-published-lib-verification.json`,
não mexa nele).

## Escopo — LEIA ANTES DE QUALQUER AÇÃO

**Você só tem permissão para escrever no arquivo explicitamente listado
abaixo** — nunca mais que isso, mesmo que pareça útil.

**Não edite, crie, apague ou renomeie nenhum outro arquivo ou pasta** —
isso inclui `code.js`, `code.bundle.js`, `ui.html`, qualquer arquivo em
`src/plugin/modules/`, `src/plugin/views/`, `src/plugin/styles/`,
`docs/`, `.github/`, este próprio `GEMINI-TASK.md`, os 4 arquivos-fonte
`web-angular-react.json`/`super-app.json`/`super-dsc-web.json`/
`dsc-android.json` (dados brutos da REST API, não mexa), ou os 4
`dsc-component-a11y-mapping*.json` (são gerados por script, não por edição
manual — sua saída vai para um arquivo NOVO e separado, descrito abaixo).

**Não edite nada no Figma** — esta tarefa é só de LEITURA das 4 bibliotecas
via MCP. Não altere nomes, propriedades, posições ou qualquer elemento dos
arquivos de origem.

Não rode build/bundle/lint/commit/push. A tarefa termina quando o JSON
alvo estiver preenchido e salvo.

## Contexto — o que já existe e por que esta tarefa é necessária

O hac tem 4 bibliotecas de produção DSC cadastradas em
`src/plugin/refs/_manifest.json`, cada uma com um scan via REST API do
Figma (`fetch-design-refs.cjs`, roda em CI toda segunda e também acabou
de rodar manualmente em 2026-09-14) e um mapeamento gerado por código
(`build-dsc-a11y-mapping.cjs`) que tenta casar cada família de componentes
(`containingFrame`) com uma das 16 categorias de acessibilidade do hac
(botão, link, checkbox, imagem, etc.) — esse mapeamento é **consumido em
runtime** pela Detecção Automática de acessibilidade do plugin
(`_getDscFrameToA11yMap` em `code.js`), não é só documentação.

O algoritmo hoje é bom em casos óbvios (nome do frame bate quase literal
com a categoria) mas deixa muita coisa sem match ou com confiança baixa —
principalmente porque os nomes reais das libs de produção nem sempre são
autoexplicativos, e o algoritmo não "olha" o componente, só o nome.

**Situação real, recém-atualizada (2026-09-14) nos 4 arquivos
`dsc-component-a11y-mapping*.json`**:

| Lib | Arquivo de saída | Famílias com confiança BAIXA (candidato sugerido, precisa validar) |
|---|---|---|
| Web Angular & React | `dsc-component-a11y-mapping.json` | 19 |
| DSC \| Super App (mobile) | `dsc-component-a11y-mapping-mobile.json` | 29 |
| Super DSC \| Web | `dsc-component-a11y-mapping-superdscweb.json` | 30 |
| DSC \| Android | `dsc-component-a11y-mapping-android.json` | 9 |

(Cada um desses arquivos também tem uma lista bem maior de `semMatch` —
famílias sem NENHUM candidato — mas essa lista é grande demais pra revisar
manualmente numa sessão só. **Esta tarefa cobre só a lista `baixaConfianca`
das 4 libs (87 famílias no total)**, que já tem um candidato sugerido pra
você confirmar ou rejeitar visualmente. `semMatch` fica pra uma tarefa
futura, mais restrita por lib.)

## Sua tarefa

**Arquivo que você pode editar (crie do zero):**

```
src/plugin/refs/dsc-a11y-baixa-confianca-revisao.json
```

Para cada uma das 4 bibliotecas, leia a lista `baixaConfianca` do arquivo
de mapeamento correspondente (tabela acima) — cada item tem
`containingFrame` (nome da família de componentes), `sampleKeys` (2-3 keys
de variantes reais daquela família, prontas pra você inspecionar via MCP)
e `match.shortName`/`match.reason` (o candidato que o algoritmo sugeriu e
por quê).

Para cada família da lista:

1. **Abra pelo menos uma das `sampleKeys` no Figma via MCP** (inspeção
   visual do componente real, não só o nome) — confirme se o candidato
   sugerido (`match.shortName`) faz sentido olhando o componente de
   verdade.
2. **Classifique sua decisão** como uma das três:
   - `"confirma"` — o candidato sugerido está certo, pode virar alta
     confiança.
   - `"corrige"` — o candidato está errado; informe a categoria correta
     (use só os `shortName` das 16 categorias reais — consulte
     `a11yShortNames` no `_meta` de qualquer um dos 4 arquivos de
     mapeamento pra ver a lista completa) ou `null` se, depois de olhar,
     você achar que não é nenhuma categoria de acessibilidade.
   - `"sem_certeza"` — olhou e genuinamente não dá pra decidir sem mais
     contexto (ex.: componente muito específico de um fluxo de produto).
     Não invente uma resposta só pra preencher.
3. **Anote uma justificativa curta** (1-2 frases) da sua decisão — o que
   você viu no componente que confirma ou refuta o candidato sugerido.

**Não precisa revisar TODAS as 87 de uma vez se o volume for grande demais
pra uma sessão** — priorize as libs mobile (`Super App`) e `Super DSC Web`
primeiro (são as mais usadas hoje pelo plugin), e deixe claro no `_meta`
do seu JSON de saída quais libs você conseguiu cobrir completamente e
quais ficaram parciais/pendentes.

Estrutura sugerida do JSON (adapte livremente, mantendo a ideia geral):

```json
{
  "_meta": {
    "status": "parcial ou completo",
    "scanDate": "AAAA-MM-DD",
    "libsCobertas": ["super-app", "super-dsc-web"],
    "libsPendentes": ["web-angular-react", "dsc-android"],
    "contexto": "Revisão visual via MCP das famílias de baixa confiança geradas por build-dsc-a11y-mapping.cjs em 2026-09-14."
  },
  "revisao": [
    {
      "libSlug": "super-app",
      "containingFrame": "[dsc] List Item",
      "candidatoSugerido": "listas",
      "decisao": "confirma",
      "categoriaCorreta": "listas",
      "justificativa": "Componente real inspecionado via MCP (key cd5e15...) é de fato uma lista de itens repetíveis, bate com a categoria."
    }
  ]
}
```

Quando terminar, não faça mais nada — não precisa avisar ninguém nem
rodar nenhum comando. O dono do repositório vai revisar o resultado e
decidir quais correções aplicar de volta nos mapeamentos reais (isso NÃO
é parte desta tarefa — é uma decisão e implementação separadas, feitas
depois com mais cuidado, por esses arquivos alimentarem a Detecção
Automática em produção).
