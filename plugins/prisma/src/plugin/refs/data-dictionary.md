# Dicionário de dados — Exportação achatada para Power BI (PRISMA)

Este documento descreve o formato gerado por `exportPrismaDataFlat()`
(`src/plugin/modules/core.js`), pensado para consumo direto em **Power BI**
via **Get Data > JSON** (arquivo único) ou **Get Data > Text/CSV** (dois
arquivos, se o formato CSV for escolhido no plugin).

Este export é **adicional** ao `exportPrismaData()` original — que continua
gerando o JSON aninhado 1:1 com o schema interno (`prismaData`), útil como
backup ou para reimportar no próprio plugin / repassar a outro sistema que
já entenda esse schema. O formato aqui documentado existe especificamente
para ferramentas de BI, que lidam mal com JSON profundamente aninhado e
colunas que variam por tipo de registro.

## Por que duas tabelas (modelo estrela) em vez de um JSON aninhado

Cada instância de framework tem um conjunto de campos diferente (o catálogo
tem 25 frameworks, cada um com `fields[]` próprio) e o briefing tem seus 24
campos fixos. Se cada campo virasse uma coluna, o Power BI precisaria de uma
tabela com dezenas de colunas majoritariamente vazias (uma por campo
possível em qualquer framework), e qualquer campo novo adicionado ao
catálogo exigiria redesenhar o modelo de dados no Power BI. O modelo
"chave-valor longo" evita isso: a tabela `campos` tem sempre as mesmas 5
colunas, não importa quantos frameworks ou campos existam — o Power BI
resolve pivôs, filtros e agrupamentos por `fieldId`/`fieldType`/`instanceId`
via Power Query ou medidas DAX, sem que o PRISMA precise prever a estrutura de
antemão.

## Formato escolhido: JSON único (duas listas) — CSV como alternativa

O botão principal ("Exportar para Power BI") gera **um único arquivo JSON**
com a forma `{ projeto: {...}, instancias: [...], campos: [...] }`. Motivos:

- **Um arquivo só** — menos passos manuais de import (o fluxo de export é
  manual; menos arquivos, menos chance de o usuário importar a versão errada
  de um dos dois).
- **Tipos preservados** — datas ISO e números chegam com o tipo correto no
  Power Query; CSV exige reconhecimento de tipo por coluna a cada import.
- **Sem ambiguidade de delimitador** — os campos de texto do briefing e dos
  frameworks frequentemente contêm vírgulas, ponto-e-vírgula e quebras de
  linha (são textos livres). O JSON não sofre com isso; CSV exige escaping
  cuidadoso (implementado, mas é uma fonte a mais de erro de import).
- **Get Data > JSON no Power BI** expande `instancias` e `campos` como duas
  tabelas de uma vez, bastando "To Table" em cada lista — não há parsing
  manual necessário.

Um segundo botão ("Prefere CSV?") gera quatro arquivos (`*-instancias.csv`,
`*-campos.csv`, `*-evidencias.csv` e `*-score-breakdown.csv`, delimitador
`;`, UTF-8) para quem preferir importar via Excel antes do Power BI, ou já
tiver um fluxo de import CSV pronto. O conteúdo é idêntico ao JSON, apenas
em formato tabular direto — inclusive quando as tabelas `evidencias` ou
`scoreBreakdown` estão vazias (nenhuma evidência registrada ainda, ou
análise de IA nunca rodada): o CSV ainda é gerado, só com cabeçalho e
nenhuma linha de dado.

## Estrutura do arquivo JSON

```json
{
  "_plugin": "PRISMA",
  "_version": "1.0.0",
  "_schemaVersion": 4,
  "exportedAt": "2026-08-01T12:00:00.000Z",
  "projeto": { ... },
  "instancias": [ { ... }, ... ],
  "campos": [ { ... }, ... ],
  "evidencias": [ { ... }, ... ],
  "scoreBreakdown": [ { ... }, ... ]
}
```

---

## Tabela `projeto` (1 linha — metadados do projeto/score/auditoria)

Não repete por instância; existe uma vez por exportação. No Power BI, use
como tabela de contexto único (relacionamento 1:N com `instancias` via
`projectId`, se for necessário juntar com outras exportações no futuro).

| Coluna | Tipo | Origem (schema) | Obrigatório | Domínio / observação |
|---|---|---|---|---|
| `projectId` | texto | `prismaData.projectId` | sim | ID gerado internamente pelo plugin (`ax-<timestamp><random>`); estável durante a vida do arquivo Figma. |
| `nomeProjeto` | texto | `prismaData.briefing.nomeProjeto` | não | Nome livre digitado no briefing; pode estar vazio se o briefing não foi preenchido. |
| `createdAt` | data/hora (ISO 8601) | `prismaData.createdAt` | sim | Data de criação do estado do plugin (não do projeto real). |
| `scoreNumeric` | número (0–100) | `prismaData.score.numeric` | não | `null` se o score ainda não foi calculado. |
| `scoreStars` | número (0–5) | `prismaData.score.stars` | não | `null` se o score ainda não foi calculado. |
| `scoreComputedAt` | data/hora (ISO 8601) | `prismaData.score.computedAt` | não | `null` se nunca calculado. |
| `scoreFonte` | texto | `prismaData.aiAnalysis.fonte` | não | Valores esperados: `"foundry"` (IA real) ou `"mock"` (simulado). **Sempre verificar este campo antes de tratar o score como definitivo** — score com fonte `"mock"` não deve embasar decisão nem ser citado como avaliação real do projeto. |
| `auditDesignSystemStatus` | texto (enum) | `prismaData.auditoria.designSystem.status` | sim | `"pendente"` \| `"conforme"` \| `"com-desvios"`. |
| `auditAcessibilidadeStatus` | texto (enum) | `prismaData.auditoria.acessibilidade.status` | sim | `"pendente"` \| `"conforme"` \| `"com-desvios"`. |

---

## Tabela `instancias` (1 linha por instância de framework/briefing injetado)

Inclui uma linha sintética para o briefing (`instanceId = "briefing"`), já
que o briefing é único por projeto — não repetido como os frameworks — mas
precisa de uma chave para se relacionar com a tabela `campos` do mesmo jeito
que qualquer framework. Ver seção "Decisão: briefing como pseudo-instância"
abaixo para o racional completo.

| Coluna | Tipo | Origem (schema) | Obrigatório | Domínio / observação |
|---|---|---|---|---|
| `instanceId` | texto (chave primária) | `prismaData.frameworks[].instanceId` ou `"briefing"` (fixo) | sim | Chave para relacionar com `campos.instanceId` no Power BI. |
| `frameworkId` | texto | `prismaData.frameworks[].frameworkId` ou `"briefing"` (fixo) | sim | ID do framework no catálogo (`refs/frameworks.json`), ex. `"csd"`, `"five-whys"`. |
| `frameworkName` | texto | Nome resolvido via catálogo (`inst.frameName` ou `fw.name`) | sim | Nome de exibição; para briefing é sempre `"Briefing Estruturado"`. |
| `category` | texto | `frameworks.json` → `category` do framework | não | Categoria do catálogo (`"Alinhamento"`, `"Diagnóstico"`, `"Priorização"`, `"Pesquisa"`, `"Mapeamento"`, `"Avaliação"`, `"Ideação"`, `"Descoberta"`); para briefing é fixo `"Briefing"` (categoria sintética, não existe no catálogo). |
| `pageName` | texto | `prismaData.frameworks[].pageName` | não | Nome da página do Figma onde o frame foi encontrado; vazio para o briefing (não vive em um frame de página). |
| `version` | número | `prismaData.frameworks[].version` | não | Versão da instância (framework pode ter múltiplas versões via "Nova versão"); `null` para o briefing (não versionado). |
| `createdAt` | data/hora (ISO 8601) | `prismaData.frameworks[].injectedAt` (frameworks) ou `prismaData.createdAt` (briefing) | não | Data de criação/injeção no canvas. |
| `scannedAt` | data/hora (ISO 8601) | `prismaData.frameworks[].scannedAt` | não | Data do último scan do canvas que atualizou esta instância; `null` para o briefing (não passa por scan, é editado direto no plugin). |
| `fieldCount` | número inteiro | Calculado: contagem de campos com valor não vazio em `data{}` (frameworks) ou em `briefing{}` | sim | Quantos dos campos possíveis desta instância estão de fato preenchidos — útil para medir completude no dashboard. |

### Decisão: briefing como pseudo-instância (não uma terceira tabela separada)

Avaliado e descartado: uma tabela `briefing` própria, com uma coluna por
campo (24 colunas fixas). Motivo da escolha pelo modelo unificado:

- O briefing tem exatamente a mesma forma lógica de um framework preenchido
  (um conjunto de campos chave-valor, com metadados de quando foi criado) —
  tratá-lo como instância evita duplicar a lógica de achatamento no código e
  no modelo de dados do Power BI.
- Uma tabela `briefing` própria de 24 colunas fixas reintroduziria
  exatamente o problema que o modelo chave-valor longo resolve para os
  frameworks: qualquer campo novo no briefing exigiria alterar o modelo do
  Power BI.
- O custo é pequeno: `instanceId = "briefing"` é uma chave estável e
  previsível (nunca colide com IDs gerados para frameworks, que seguem o
  padrão `ax-<...>`), e a tabela `instancias` ganha uma linha visualmente
  distinguível pela `category = "Briefing"`.

Se o dashboard precisar tratar o briefing de forma claramente diferenciada
dos frameworks (ex.: um cartão único de "visão geral do projeto" separado
da lista de frameworks), filtre `instancias` por
`frameworkId = "briefing"` — não é necessário outra tabela.

---

## Tabela `campos` (1 linha por campo preenchido — chave-valor longo)

Esta é a tabela central para qualquer pivot/filtro no Power BI: uma linha
por campo, de qualquer instância (briefing ou framework), sem prever de
antemão quais campos existem.

| Coluna | Tipo | Origem (schema) | Obrigatório | Domínio / observação |
|---|---|---|---|---|
| `instanceId` | texto (chave estrangeira → `instancias.instanceId`) | ver tabela `instancias` | sim | Relaciona o campo à instância que o contém. |
| `fieldId` | texto | `frameworks.json` → `fields[].id` (frameworks) ou nome interno do campo (briefing, ex. `"comunidade"`, `"visaoGeral"`) | sim | Identificador técnico do campo, estável entre exportações do mesmo framework/briefing. |
| `fieldLabel` | texto | `frameworks.json` → `fields[].label` (frameworks) ou rótulo em português mapeado no export (briefing) | sim | Nome de exibição do campo, pronto para usar como rótulo no dashboard sem tradução adicional. |
| `fieldValue` | texto | `prismaData.frameworks[].data[fieldId]` (frameworks) ou `prismaData.briefing[fieldId]` (briefing) | não | String vazia (`""`) quando o campo não foi preenchido — **não confundir com ausência da linha**: a linha sempre existe para todo campo definido no catálogo (ou no briefing), preenchido ou não; isso permite ao Power BI calcular taxas de preenchimento por campo. |
| `fieldType` | texto (enum) | `frameworks.json` → `fields[].type`, ou `"date"`/`"text"` (briefing) | sim | Valores possíveis: `"text"` (texto livre), `"list"` (lista de itens — hoje armazenada como texto simples, itens não são estruturados em array separado), `"scale"` (escala 1–5, ver observação abaixo), `"date"` (usado apenas para `dataInicio` do briefing). |

### Observação sobre `fieldType = "scale"`

Campos do tipo `"scale"` (hoje só as 10 heurísticas de Nielsen, 1–5) são
preenchidos pelo formulário "Editar campos" do plugin (seletor de botões
1–5, ver `src/plugin/modules/frameworks.js` → `setScaleFieldValue`) e
persistidos como texto em `data{}` (`"1"` a `"5"`), exatamente como
qualquer outro campo — o preenchimento também atualiza o destaque visual
da nota no frame do Figma (`canvas/fill.js`, repintura das caixas
`_rating-box-1..5`). `fieldValue` vazio (`""`) significa que a heurística
ainda não foi avaliada. Domínio: string contendo um inteiro de `"1"` a
`"5"`, ou `""` se não preenchido.

### Observação sobre `fieldType = "list"`

Campos do tipo `"list"` guardam múltiplos itens como texto livre (o usuário
digita item por item numa área de texto multilinha) — não há um separador
estrutural garantido (pode ser quebra de linha, `;`, `,` etc., a critério de
quem preencheu). Se o dashboard precisar contar itens individuais de uma
lista, isso exigiria tratamento adicional fora do escopo deste export (o
PRISMA hoje não estrutura listas como array).

---

## Tabela `evidencias` (1 linha por artefato registrado + 1 linha por observação de etapa)

Cobre as 5 etapas de `prismaData.evidencias` (descoberta, definição, ideação,
validação, pós-lançamento) — cada etapa guarda uma lista de artefatos
(referência a um documento/link/framework, nunca um upload binário) e um
campo único de observações em texto livre. Diferente da tabela `campos`,
aqui não há uma "instância" por trás: uma etapa pode não ter nenhum artefato
(nenhuma linha) ou vários.

| Coluna | Tipo | Origem (schema) | Obrigatório | Domínio / observação |
|---|---|---|---|---|
| `etapa` | texto (enum) | chave de `prismaData.evidencias` | sim | `"descoberta"` \| `"definicao"` \| `"ideacao"` \| `"validacao"` \| `"posLancamento"`. |
| `etapaLabel` | texto | rótulo de exibição mapeado no export (`PRISMA_ETAPA_LABELS`) | sim | Nome pronto para rótulo no dashboard (ex. `"Pós-lançamento"`), sem tradução adicional. |
| `tipoRegistro` | texto (enum) | calculado | sim | `"artefato"` (linha veio de `evidencias.<etapa>.artefatos[]`) ou `"observacao"` (linha veio de `evidencias.<etapa>.observacoes`). Use para filtrar o tipo de conteúdo antes de qualquer pivot. |
| `artefatoId` | texto | `evidencias.<etapa>.artefatos[].id` | não | Vazio (`""`) em linhas `tipoRegistro = "observacao"`. |
| `artefatoNome` | texto | `evidencias.<etapa>.artefatos[].nome` | não | Nome livre digitado no formulário de auditoria, ou nome do framework quando o artefato foi sincronizado automaticamente do canvas (ver `artefatoOrigem`). Vazio em linhas de observação. |
| `artefatoTipo` | texto | `evidencias.<etapa>.artefatos[].tipo` | não | Valores hoje possíveis: `"link"`, `"referencia"` (cadastro manual sem URL), `"framework"` (sincronizado do canvas) ou outro valor livre escolhido no formulário. Vazio em linhas de observação. |
| `artefatoUrl` | texto | `evidencias.<etapa>.artefatos[].url` | não | String vazia se o artefato não tiver link associado. |
| `artefatoAnexadoEm` | data/hora (ISO 8601) | `evidencias.<etapa>.artefatos[].anexadoEm` | não | `null` em linhas de observação. |
| `artefatoOrigem` | texto (enum) | `evidencias.<etapa>.artefatos[].origem` | não | `"framework"` quando o artefato foi criado automaticamente pela sincronização do scan do canvas, `"usability-test"` quando veio de um Teste de Usabilidade concluído (ver `evidence-bridge.js`, ambos só afetam a etapa `validacao`); string vazia (`""`) quando foi cadastrado manualmente pelo formulário de auditoria. **Não confundir vazio com ausência de dado** — é o valor esperado para todo artefato manual. |
| `artefatoOrigemFrameworkId` | texto | `evidencias.<etapa>.artefatos[].origemFrameworkId` | não | Preenchido só quando `artefatoOrigem = "framework"`; permite relacionar com `instancias.frameworkId`. Vazio nos demais casos. |
| `artefatoOrigemInstanceId` | texto | `evidencias.<etapa>.artefatos[].origemInstanceId` | não | Preenchido só quando `artefatoOrigem = "framework"`; permite relacionar com `instancias.instanceId`/`campos.instanceId`. Vazio nos demais casos. |
| `observacoes` | texto | `evidencias.<etapa>.observacoes` | não | Preenchido só em linhas `tipoRegistro = "observacao"`; vazio (`""`) em linhas de artefato. |

### Decisão de modelagem: artefato e observação na mesma tabela

Avaliado e descartado: separar `evidencias` (artefatos) de uma tabela
`observacoesEtapa` própria. Motivo da escolha por uma tabela única com
`tipoRegistro`: os dois tipos de registro compartilham a mesma chave de
agrupamento (`etapa`) e a mesma finalidade no dashboard (mostrar o que foi
documentado em cada etapa do processo) — duas tabelas exigiriam um
relacionamento extra no Power BI sem ganho real, já que a observação é no
máximo 1 linha por etapa (não uma lista). Se o dashboard precisar mostrar só
artefatos ou só observações, basta filtrar por `tipoRegistro`.

### Nota sobre o campo `metadados` (fora do export achatado)

`evidencias.<etapa>.artefatos[].metadados` (um objeto chave-valor livre,
preenchido a partir de campos configuráveis por etapa no formulário de
auditoria) **não** está incluído nesta tabela — sua forma varia por etapa e
reintroduziria o mesmo problema que a tabela `campos` resolve para
frameworks. Fica disponível apenas no export completo
(`exportPrismaData()`, JSON aninhado). Se o dashboard precisar desses dados,
é necessário desenhar uma extensão específica (provavelmente seguindo o
mesmo modelo chave-valor longo já usado em `campos`).

---

## Tabela `scoreBreakdown` (1 linha por dimensão avaliada pela IA)

Cobre `prismaData.aiAnalysis` — a nota, o comentário e o resultado do
checklist balizador por dimensão, gerados pela última rodada de análise de
IA (`analyzeWithFoundry`, hoje simulada — "mock" —, com contrato já
desenhado para receber a integração real via Azure AI Foundry no futuro).
**Tabela vazia se a análise de IA nunca foi rodada** (não existe linha
"zerada" por dimensão; a dimensão só aparece depois de ao menos uma análise
concluída).

| Coluna | Tipo | Origem (schema) | Obrigatório | Domínio / observação |
|---|---|---|---|---|
| `dimensao` | texto (enum) | chave de `prismaData.aiAnalysis.scoreBreakdown` | sim | Hoje: `"descoberta"` \| `"definicao"` \| `"ideacao"` \| `"validacao"` \| `"posLancamento"` \| `"designSystem"` \| `"acessibilidade"`. A lista de dimensões não é fixa no código do export — vem das chaves realmente devolvidas pela análise, então uma integração de IA futura que avalie um conjunto diferente de dimensões aparece aqui sem exigir alteração no export. |
| `dimensaoLabel` | texto | rótulo de exibição mapeado no export (`PRISMA_DIMENSAO_LABELS`) | sim | Nome pronto para rótulo no dashboard (ex. `"Pós-lançamento"`, `"Design System"`), sem tradução adicional. |
| `nota` | número (0–100) | `prismaData.aiAnalysis.scoreBreakdown[dimensao]` | sim | Nota da dimensão isolada — não confundir com `projeto.scoreNumeric`, que é a média das dimensões. |
| `comentario` | texto | `prismaData.aiAnalysis.agentResponses[dimensao].comentario` | não | Texto livre gerado pela IA explicando a nota; pode estar vazio se a resposta não trouxer comentário. |
| `fonte` | texto (enum) | `prismaData.aiAnalysis.fonte` | não | `"foundry"` (IA real) ou `"mock"` (simulado) — repetido em toda linha da tabela (é um atributo da rodada de análise, não da dimensão), para permitir filtrar/alertar sem precisar juntar com a tabela `projeto`. **Mesmo alerta da tabela `projeto`: nunca tratar `fonte = "mock"` como avaliação real.** |
| `lastRunAt` | data/hora (ISO 8601) | `prismaData.aiAnalysis.lastRunAt` | não | Data/hora da última análise concluída; repetido em toda linha pelo mesmo motivo de `fonte`. |
| `checklistItensTotal` | número inteiro | Calculado: contagem de `prismaData.aiAnalysis.checklistResults[dimensao]` | não | Quantos itens do checklist balizador de maturidade existem para esta dimensão (ver `refs/maturity-checklist.json`). `0` se a dimensão não tiver checklist definido. |
| `checklistItensAprovados` | número inteiro | Calculado: contagem de itens com `passed = true` em `checklistResults[dimensao]` | não | Quantos desses itens foram considerados atendidos na última análise. Junto com `checklistItensTotal`, dá a taxa de aderência ao checklist por dimensão sem expor o detalhe de cada item (esse detalhe — `id`/`label`/`weight`/`passed` por item — só está no export completo). |

### Compatibilidade mock vs. Foundry real

Esta tabela é construída a partir de `Object.keys(scoreBreakdown)`, não de
uma lista fixa de dimensões — funciona tanto com o mock atual (sempre as 7
dimensões) quanto com uma futura resposta real do Foundry, mesmo que o
conjunto de dimensões retornado mude. Se o Foundry real vier a orquestrar
agentes por dimensão de forma independente (ver cabeçalho de
`ai/foundry-client.js`), essa tabela continua funcionando sem alteração,
desde que a resposta final agregada mantenha o formato
`{ scoreBreakdown: { <dimensao>: nota }, agentResponses: { <dimensao>: { comentario } }, checklistResults: { <dimensao>: [...] } }`
já documentado no contrato do módulo.

---

## Tabela `usabilityTests` (1 linha por teste de usabilidade — agregado)

Cobre `prismaData.usabilityTests` — cada teste é um estudo completo, com
suas próprias tarefas e sessões (ver tabela `usabilitySessions` para o
nível granular). Um Teste de Usabilidade não é um framework (não desenha
nada no canvas) nem um artefato simples — é um processo com fases próprias
(planejar → rodar → coletar → analisar); ver `modules/usability-test.js`.

| Coluna | Tipo | Origem (schema) | Obrigatório | Domínio / observação |
|---|---|---|---|---|
| `testId` | texto (chave primária) | `usabilityTests[].id` | sim | Chave para relacionar com `usabilitySessions.testId`. |
| `nome` | texto | `usabilityTests[].nome` | sim | Nome livre dado ao teste ao criá-lo. |
| `objetivo` | texto | `usabilityTests[].objetivo` | não | O que o pesquisador queria descobrir; pode estar vazio. |
| `status` | texto (enum) | `usabilityTests[].status` | sim | `"planejamento"` (só tarefas definidas, nenhuma sessão) \| `"em-andamento"` (ao menos 1 sessão registrada) \| `"concluido"` (marcado manualmente pelo pesquisador — dispara a sincronização com `evidencias.validacao`, ver tabela `evidencias`). |
| `criadoEm` | data/hora (ISO 8601) | `usabilityTests[].criadoEm` | sim | Data de criação do teste. |
| `qtdTarefas` | número inteiro | Calculado: `usabilityTests[].tarefas.length` | sim | Quantas tarefas foram planejadas para este teste. |
| `qtdSessoes` | número inteiro | Calculado: `usabilityTests[].sessoes.length` | sim | Quantos participantes já tiveram sessão registrada. |
| `qtdAchados` | número inteiro | Calculado: `usabilityTests[].achados.length` | sim | Quantos achados foram sintetizados na etapa Analisar. |
| `taxaSucessoGeral` | número (0–100) | Calculado: `_testMetrics()` em `modules/usability-test.js` | sim | Percentual de respostas "sucesso" sobre o total de respostas registradas (sessão × tarefa) — `0` se nenhuma sessão foi registrada ainda. |

## Tabela `usabilitySessions` (1 linha por sessão × tarefa — chave-valor longo)

Nível mais granular: uma linha para cada combinação de sessão (participante)
e tarefa planejada, com o resultado registrado (ou vazio, se a tarefa ainda
não foi avaliada nessa sessão). Permite ao Power BI cruzar taxa de sucesso
por tarefa, por participante ou por teste sem que o PRISMA precise prever esse
cruzamento de antemão — mesmo princípio da tabela `campos`.

| Coluna | Tipo | Origem (schema) | Obrigatório | Domínio / observação |
|---|---|---|---|---|
| `testId` | texto (chave estrangeira → `usabilityTests.testId`) | ver tabela `usabilityTests` | sim | Relaciona a sessão ao teste que a contém. |
| `sessionId` | texto | `usabilityTests[].sessoes[].id` | sim | Identifica a sessão (repete uma vez por tarefa do teste). |
| `participante` | texto | `usabilityTests[].sessoes[].participante` | sim | Nome/código digitado pelo moderador, ou `"Maze #<Tester ID>"` para sessões importadas de um relatório do Maze (ver seção "Importação de testes não-moderados" abaixo) — sem estrutura de PII garantida em nenhum dos dois casos. |
| `dataRealizacao` | data (AAAA-MM-DD) | `usabilityTests[].sessoes[].dataRealizacao` | não | Data em que a sessão foi realizada; `null` se não informada. |
| `tarefaId` | texto | `usabilityTests[].tarefas[].id` | sim | Identifica a tarefa avaliada nesta linha. |
| `tarefaDescricao` | texto | `usabilityTests[].tarefas[].descricao` | sim | Texto da tarefa, pronto para rótulo no dashboard. |
| `sucesso` | texto (enum) | `usabilityTests[].sessoes[].resultadosPorTarefa[].sucesso` | não | `"sim"` \| `"parcial"` \| `"nao"` \| `""` (tarefa ainda não avaliada nesta sessão — **não confundir com "falhou"**). |
| `passoAlcancadoDescricao` | texto | Resolvido a partir de `usabilityTests[].sessoes[].resultadosPorTarefa[].passoAlcancadoId` | não | Descrição do último sub-passo que o participante alcançou nesta tarefa (ver seção "Sub-passos" abaixo); `"Concluiu todos os passos"` se chegou ao fim; string vazia se a tarefa não tem sub-passos definidos ou não foi avaliada. |
| `observacoes` | texto | `usabilityTests[].sessoes[].resultadosPorTarefa[].observacoes` | não | Notas específicas desta tarefa nesta sessão; vazio se não preenchido. |

### Sub-passos por tarefa (funil de conclusão)

Cada tarefa pode, opcionalmente, ter uma lista de sub-passos esperados
(`usabilityTests[].tarefas[].passos[]`, definida no Planejar — ex. "Abrir
menu", "Localizar pedido", "Clicar cancelar", "Confirmar"). É dado
**observado e registrado manualmente pelo moderador durante uma sessão
moderada** — o Figma não expõe ao plugin nenhum evento do modo de
apresentação/preview de protótipo, então não há captura automática de
navegação dentro de um protótipo Figma. Ao registrar a sessão, o moderador
marca até qual passo o participante alcançou antes de ter sucesso,
desistir ou travar; isso permite calcular, por passo, quantos participantes
o alcançaram (ver `_testMetrics()` em `modules/usability-test.js`) — o tipo
de dado que aponta o ponto exato de fricção dentro de uma tarefa, não só se
ela teve sucesso ou não como um todo. Esse funil por passo está disponível
na aba Coletar do plugin, mas **não tem tabela própria neste export**
(ficaria com granularidade adicional — passo dentro de tarefa dentro de
sessão — que não foi modelada aqui); `passoAlcancadoDescricao` nesta tabela
é o dado bruto por sessão, a partir do qual o funil agregado pode ser
recalculado no Power BI se necessário (contando, por passo, quantas linhas
alcançaram aquele passo ou um posterior).

### Importação de testes não-moderados (Maze)

O Figma não expõe a nenhum plugin eventos do modo de apresentação/preview
de protótipo — por isso o PRISMA não pode capturar automaticamente cliques
ou navegação dentro de um protótipo. Ferramentas como o Maze só conseguem
isso porque rodam o protótipo dentro do próprio player delas (fora do
Figma), não por acesso a alguma API de plugin. Dado isso, o PRISMA oferece
um importador de CSV (aba Rodar → "Maze") para trazer resultados de um
teste não-moderado já rodado no Maze, em vez de o moderador digitar à mão.

Mapeamento (colunas reais confirmadas no export do Maze, Help Center
"Exporting your results"): `Tester ID` → uma sessão `Maze #<Tester ID>`;
`Block ID`/`Block title` (a "missão" do Maze) → relacionado manualmente a
uma tarefa já existente no PRISMA pelo moderador antes de importar (os
nomes não batem automaticamente entre as duas ferramentas); `Direct
Success` / `Indirect Success` / `Give up` → `sucesso` (`"sim"` se qualquer
sucesso registrado no grupo tester×bloco, `"nao"` se só houve desistência,
`"parcial"` caso nenhuma das duas colunas anteriores seja verdadeira).
Quando um bloco tem múltiplas linhas (uma por `Screen ID` visitada), todas
são agregadas em um único resultado por tarefa — o funil por sub-passo
(`passoAlcancadoId`, ver seção anterior) **não é importado do Maze**: exigiria
os `passos` da tarefa no PRISMA corresponderem exatamente às telas do
protótipo, o que não há como garantir automaticamente. `dataRealizacao`
fica vazio nas sessões importadas (o CSV do Maze tem `Started At`/
`Completed At`, mas por tester×tela, não por sessão consolidada — não
importado nesta versão).

### Pendências conhecidas (Teste de Usabilidade)

- **Sem métricas de satisfação por sessão** (SUS/NPS/CSAT) nesta versão —
  decisão explícita para manter o escopo inicial simples (sucesso/falha por
  tarefa + observações). Se isso for adicionado ao schema no futuro, esta
  tabela precisará de novas colunas.
- **Achados (`usabilityTests[].achados[]`) não têm tabela própria** neste
  export — ficam disponíveis apenas no export completo (`exportPrismaData()`).
  Se o dashboard precisar cruzar achados por severidade/teste, seria
  necessário estender este formato com uma tabela `usabilityFindings`.
- **Sem tabela própria para o funil por passo** — ver seção "Sub-passos por
  tarefa" acima; hoje só o dado bruto (`passoAlcancadoDescricao`) é
  exportado, não o agregado por passo.
- **Testes não-moderados (ex. Maze) não são importados automaticamente** —
  se um teste rodar fora do plugin numa ferramenta de teste não-moderado,
  os resultados (incluindo funil por tela) precisariam ser transcritos
  manualmente para dentro de um Teste de Usabilidade do PRISMA hoje; um
  importador de relatório dessas ferramentas é um desenvolvimento futuro
  possível, ainda não especificado.

---

## Enumerações usadas neste export

- **`fieldType`**: `text` | `list` | `scale` | `date`
- **`auditDesignSystemStatus` / `auditAcessibilidadeStatus`**: `pendente` | `conforme` | `com-desvios`
- **`scoreFonte`** (tabela `projeto`) / **`fonte`** (tabela `scoreBreakdown`): `foundry` | `mock` | `null` (score ainda não calculado)
- **`category`** (instâncias): valores do catálogo (`Alinhamento`, `Diagnóstico`,
  `Priorização`, `Pesquisa`, `Mapeamento`, `Avaliação`, `Ideação`,
  `Descoberta`) + `Briefing` (sintético, só para a instância do briefing)
- **`etapa`** (tabela `evidencias`): `descoberta` | `definicao` | `ideacao` | `validacao` | `posLancamento`
- **`tipoRegistro`** (tabela `evidencias`): `artefato` | `observacao`
- **`artefatoOrigem`** (tabela `evidencias`): `framework` | `usability-test` | `""` (cadastro manual)
- **`status`** (tabela `usabilityTests`): `planejamento` | `em-andamento` | `concluido`
- **`sucesso`** (tabela `usabilitySessions`): `sim` | `parcial` | `nao` | `""` (não avaliado)
- **`dimensao`** (tabela `scoreBreakdown`): mesmas 7 chaves de `etapa` + `designSystem` | `acessibilidade` — não é uma lista fixa no código, ver seção "Compatibilidade mock vs. Foundry real"

## Pendências conhecidas (fora do escopo desta exportação)

- **Transporte automático**: hoje o export é sempre manual (o usuário baixa
  o arquivo e importa no Power BI). Se um dia for necessário atualização
  automática/agendada, isso exigiria um endpoint HTTP (API) ou gateway de
  dados — não implementado neste momento, por decisão explícita de manter o
  fluxo manual por ora.
- **Estruturação de campos `list`**: se o dashboard precisar de contagem de
  itens por lista, seria necessário mudar como o PRISMA armazena esse tipo de
  campo (hoje é texto livre, não array).
- **`evidencias.<etapa>.artefatos[].metadados`** (objeto chave-valor livre,
  configurável por etapa) não está incluído na tabela `evidencias` — mesma
  razão pela qual `campos` existe para frameworks (forma variável por
  etapa). Continua disponível apenas no export completo.
- **`aiAnalysis.checklistResults[dimensao]` em nível de item** (`id` /
  `label` / `weight` / `passed` de cada critério do checklist balizador) não
  está incluído na tabela `scoreBreakdown` — só o agregado
  (`checklistItensTotal` / `checklistItensAprovados`). Continua disponível
  apenas no export completo.
- **`auditoria.*.desvios`** (lista de desvios declarados por dimensão de
  auditoria) ainda não faz parte de nenhuma tabela achatada. Continua
  disponível apenas no export completo (`exportPrismaData()`, JSON aninhado).
  Se o dashboard precisar desses dados, é necessário desenhar uma extensão
  deste formato antes de expor no Power BI.
