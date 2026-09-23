# HANDEX — Modelo de Dados

> Referência do modelo de dados do plugin Handex, cobrindo artefatos do canvas Figma,
> schema de persistência (localStorage) e mapeamento para exportação HTML/SharePoint.
> Última atualização: 2026-06-18 (v4.2.2)

---

## Sumário

1. [Princípios](#1-princípios)
2. [Convenção de Nomenclatura](#2-convenção-de-nomenclatura)
3. [Artefatos de Canvas — Anotações (standalone)](#3-artefatos-de-canvas--anotações-standalone)
4. [Artefatos de Canvas — Ficha Técnica](#4-artefatos-de-canvas--ficha-técnica)
5. [Schema de Persistência (`handoffData`)](#5-schema-de-persistência-handoffdata)
6. [Relação Canvas ↔ Persistência](#6-relação-canvas--persistência)
7. [Roadmap HTML/SharePoint](#7-roadmap-htmlsharepoint)

---

## 1. Princípios

- **Metadados no nó-raiz.** Toda identidade de um artefato reside no nome do nó-raiz. Filhos têm nomes curtos e semânticos, escopados pelo pai.
- **Parseable por regex única.** Cada tipo tem um padrão reconhecível sem inspecionar filhos.
- **Fonte de verdade dupla.** Canvas = verdade posicional e visual. localStorage = verdade de dados. Devem estar sincronizados.
- **Backward compatibility.** Novos formatos coexistem com legados via fallback no parser.
- **Orientado a dados futuros.** Todos os nomes foram definidos para virar registros em banco de dados e cards em HTML exportado para SharePoint.

---

## 2. Convenção de Nomenclatura

### Padrão geral

```
[Tipo | meta1 | meta2] Descrição legível
```

| Elemento | Regra |
|---|---|
| `Tipo` | PascalCase, identifica a entidade (`Spec`, `Medida`, `Fluxo`, `Campo`, `Seção`…) |
| `meta1..N` | snake_case ou lower, valores de atributos identificadores |
| `Descrição` | Texto livre, legível no painel Layers do Figma |
| Filhos | Nomes curtos sem prefixo — escopo dado pelo pai |

### Exemplos

```
[Spec | A | right] Ação 4
[Medida | padding | top] Button Header
[Fluxo | 1 | decisão] Fluxo de Login
[Campo | objetivo] Objetivo da Entrega
[Frame | abc123] Tela de Login
[Briefing | 1] Qual é o problema que estamos resolvendo?
```

---

## 3. Artefatos de Canvas — Anotações (standalone)

Estes nós existem diretamente na página do Figma, fora da ficha.
São lidos e posicionados ativamente pelo plugin.

---

### 3.1 Especificação Anotada

**Grupo-raiz:**
```
[Spec | {letra} | {lado}] {nomeElemento}
```

| Meta | Tipo | Valores |
|---|---|---|
| `letra` | `A–Z` | Tag identificadora |
| `lado` | string | `right` · `left` · `top` · `bottom` |
| `nomeElemento` | string | Nome do nó Figma anotado |

**Regex:** `/^\[Spec \| ([A-Z]) \| (right|left|top|bottom)\] (.+)$/`

**Estrutura de filhos:**
```
[Spec | A | right] Ação 4         (GROUP, locked)
  ├── Ficha                        (FRAME, auto-layout vertical) ← card principal
  │   ├── Tag                      (FRAME) ← badge com letra
  │   ├── Categoria/{label}        (FRAME) ← pill de categoria
  │   ├── Propriedades             (FRAME) ← container de props
  │   │   └── Prop/{label}         (FRAME) ← linha label + valor
  ├── Destaque                     (FRAME) ← contorno pontilhado
  │   └── Chip                     (FRAME) ← badge no destaque
  ├── Conector                     (VECTOR) ← linha tracejada
  ├── DotInicio                    (ELLIPSE)
  └── DotFim                       (ELLIPSE)
```

**Legado (read-only):**
```
[Spec] {nomeElemento}
  └── [Spec/{letra}] {nomeElemento}/Ficha:{lado}
```

---

### 3.2 Anotação de Medida (canvas)

> Criada diretamente no canvas como anotação visual sobre o elemento medido.

**Nó-raiz:**
```
[Medida | {tipo} | {eixo}] {nomeElemento}
```

| Meta | Tipo | Exemplos |
|---|---|---|
| `tipo` | string | `padding` · `gap` · `width` · `height` · `radius` |
| `eixo` | string | `top` · `bottom` · `left` · `right` · `horizontal` · `vertical` · `all` |
| `nomeElemento` | string | Nome do nó Figma medido |

**Regex:** `/^\[Medida \| ([a-z]+) \| ([a-z]+)\] (.+)$/`

**Estrutura de filhos:**
```
[Medida | padding | top] Button
  ├── Linha         (VECTOR) ← seta de dimensão
  ├── Chip          (FRAME)  ← label com valor
  └── Alvo          (FRAME)  ← destaque sobre o elemento
```

---

### 3.3 Fluxo de Tela (canvas)

**Grupo-raiz:**
```
[Fluxo | {numero} | {tipo}] {nomeFluxo}
```

| Meta | Tipo | Valores |
|---|---|---|
| `numero` | inteiro | Sequencial, de `nextFlowNumber` |
| `tipo` | string | `inicio` · `fim` · `decisao` · `conexao` |
| `nomeFluxo` | string | Nome descritivo do fluxo |

**Regex:** `/^\[Fluxo \| (\d+) \| ([a-z]+)\] (.+)$/`

**Estrutura de filhos:**
```
[Fluxo | 1 | decisao] Login Gate
  ├── Linha         (VECTOR) ← conector entre telas
  ├── Chip          (FRAME)  ← label da decisão
  │   ├── Fundo     (RECT)
  │   └── Texto     (TEXT)
  └── Legenda       (FRAME, opcional)
```

---

## 4. Artefatos de Canvas — Ficha Técnica

A ficha é um objeto canvas composto gerado pelo comando **Gerar Ficha**.
Seus elementos internos seguem a mesma convenção `[Tipo | meta] Descrição`.

---

### 4.1 Container principal

```
Handex | Ficha de Projeto | {titulo} | {YYYY-MM-DD HH:mm}
```

**Filhos diretos (cards):**
```
Handex | Ficha de Projeto | {titulo} | {ts}        (FRAME horizontal)
  ├── {base} / Ficha de Projeto                    ← card 1: dados + specs + fluxos
  ├── {base} / Briefing                            ← card 2: perguntas estratégicas
  └── {base} / Interface                           ← card 3: tokens e componentes DSC
```

---

### 4.2 Seções internas

Nome real gravado pelo código (`_hdCreateSection`/`_hdBuildSectionShell`,
`code.js`): **`[Seção] {titulo}`** — sem meta-tipo no nome (documentação
anterior indicava `[Seção | {tipo}] {titulo}`, desatualizada em relação ao
código; corrigido aqui em 2026-09-15). A busca por subseção (usada pelo
handler `insert-ficha-section`, ver 5.2) é feita pelo título literal, não
por um tipo separado.

| `{titulo}` usado hoje | Conteúdo |
|---|---|
| `Informações Básicas` | Informações básicas do projeto |
| `Equipe e Responsáveis` | Membros da equipe |
| `Regras de Negócio e HUs` | Regras de negócio e HUs |
| `Cenários de Exceção` | Cenários de exceção |
| `Documentação` | Links de documentação |
| `Frames Documentados` | Frames documentados |
| `Medidas` | Medidas por frame |
| `Especificações` | Especificações por frame |
| `Fluxos de Tela` | Fluxos de tela |
| `Briefing Estratégico` | Briefing estratégico (card 2, fora de `content`) |

---

### 4.3 Campos de dados

```
[Campo | {chave}] {rotulo}
```

| Meta `chave` | Rótulo exibido |
|---|---|
| `titulo` | Título do Projeto |
| `versao` | Versão |
| `objetivo` | Objetivo da Entrega |
| `status` | Status |
| `jornada` | Jornada |
| `feature` | Feature |
| `designer` | Designer Responsável |

**Estrutura de filhos:**
```
[Campo | titulo] Título do Projeto
  ├── Label    (TEXT, Bold)
  └── Valor    (TEXT, Regular)
```

---

### 4.4 Equipe

```
[Membro | {papel}] {nomeCompleto}
  ├── Nome     (TEXT)
  ├── Email    (TEXT)
  └── Papel    (TEXT)
```

---

### 4.5 Frames documentados (dentro da ficha)

```
[Frame | {figmaId}] {nomeFrame}
  ├── Badge                    (FRAME, opcional) ← "Novo componente"
  └── Auditoria                (FRAME, opcional) ← resultado DSC
```

**Nota histórica (2026-09-15 → 2026-09-17):** entre v6.13.0 e v6.14.0,
este card chegou a incluir dois snapshots PNG pequenos (432×243px,
"Snapshot com Specs"/"Snapshot com Medidas"). Migrados em 2026-09-17 para
a seção própria "Documentação Visual" (ver 4.6), em tamanho amplo e com
o card de detalhe ao lado — este card voltou a ser só identificação
básica do frame (nome + badge + auditoria).

---

### 4.6 e 4.7 — REMOVIDAS em 2026-09-17, substituídas por "Documentação Visual"

As antigas seções "Medidas" (`[Medidas | {figmaId}]`) e "Especificações"
(`[Specs | {figmaId}]`) — texto puro, agregando todos os frames juntos,
sem nenhuma referência visual à tela real — foram removidas da Ficha.
Ver 4.6 nova, abaixo.

---

### 4.6 Documentação Visual (dentro da ficha)

Substitui as antigas seções "Medidas" e "Especificações" (2026-09-17).
1 bloco por frame documentado (`_hdBuildFrameShowcaseBlock`, `code.js`),
cada um com até 2 pares — specs e medidas — cada par só aparece se
houver dado correspondente:

```
[Seção] Documentação Visual
  └── [Documentação] {nomeFrame}                ← 1 bloco por frame documentado
        ├── Nome do frame (TEXT, Bold)
        ├── "Specs marcadas"        (se f.createdSpecs.length > 0)
        │     ├── Snapshot (RECTANGLE, fill IMAGE) — frame real em tamanho
        │     │     amplo (máx. ~680px de largura, proporção real do frame),
        │     │     com SÓ o selo (letra da tag) e o contorno/destaque de
        │     │     cada spec marcados por cima — NUNCA o Conector (linha)
        │     │     nem o specCard (texto), que ficam de fora do snapshot
        │     │     de propósito
        │     └── [Specs] {nomeFrame}  ← _hdBuildSpecsSubgroup, mesma
        │           estrutura já documentada antes em 4.7 (grupo por
        │           letra → spec individual com categoria/nota/props)
        └── "Medidas aplicadas"     (se f.measurements.length > 0)
              ├── Snapshot (RECTANGLE, fill IMAGE) — frame real + as
              │     medidas aplicadas marcadas por cima
              └── [Medidas | {figmaId}] {nomeFrame}  ← _hdBuildMeasuresSubgroup,
                    mesma estrutura já documentada antes em 4.6 (lista de
                    [Medida] {nome} com label + detalhe)
```

**Por que "specs marcadas" não inclui o Conector/specCard**: o `contour`
("Destaque") já vive HOJE fora do `specGroup` (ver 4.1/nota de arquitetura
GROUP + nó solto) e já tem como filho o `chip` (o selo com a letra) — o
par "selo + contorno" já existia isolado, pronto pra ser capturado sozinho
via `exportAsync`, sem precisar desmontar nada do `specGroup` real
(que seguem existindo intactos no canvas de trabalho do designer, fora
da Ficha — esta mudança não altera em nada a criação de specs).

Frame sem nenhuma spec E sem nenhuma medida vinculada não gera bloco.
É conteúdo **derivado do canvas no momento da geração/atualização da
Ficha** — nunca persistido em `handoffData`, mesma regra já vigente para
os snapshots (ver 4.5).

---

### 4.8 Fluxos de tela (dentro da ficha)

```
[Fluxo | {numero} | {tipo}] {nomeFluxo}
  ├── Cabecalho    (FRAME)
  │   ├── Titulo   (TEXT)
  │   └── Tipo     (FRAME, chip)
  ├── Conexao      (TEXT) ← "Frame A → Frame B"
  └── Decisao      (TEXT, opcional)
```

---

### 4.9 Briefing estratégico

```
[Briefing | {numero}] {textoPergunta}
  ├── Pergunta    (TEXT, Bold)
  └── Resposta    (TEXT, Regular)
```

---

### 4.10 Tokens DSC (card Interface)

**Reformulado em 2026-09-16** — mostra só itens declarados manualmente
pelo designer como "Componente Personalizado" (`item.isMarkedCustom`,
ver 5.4.1), não mais qualquer item com vínculo DSC. Componentes
conformes ou pendentes de revisão não entram: o dev usa o componente
pronto da lib DSC nesses casos (a lib já é a documentação); "Necessita
revisão" é trabalho do designer, não informação de construção pro dev.
Card mínimo (nome + aviso, sem lista de propriedades) — quem precisar
de mais detalhe cria uma Spec (já tem snapshot visual próprio, ver 4.5).

```
[Scan | {categoria}] {titulo}       ← agrupador por categoria (só aparece se houver item marcado)
  └── [Token | {tipo}] {nomeToken}  ← item marcado como Componente Personalizado
        ├── Preview     (FRAME, opcional)
        └── Nome + aviso "precisa ser construído" (TEXT)
```

---

## 5. Schema de Persistência (`handoffData`)

Armazenado em `localStorage` via `saveToStorage()` / `saveSpecsToStorage()`.
Versão atual: `_schemaVersion: 3`

```js
{
  _schemaVersion: 3,

  // ── Card 1: Informações do Projeto ─────────────────────────────────
  step1: {
    titulo:   string,     // obrigatório para gerar ficha
    versao:   string,     // default 'v1.0'
    objetivo: string,     // obrigatório para gerar ficha
    status:   'rascunho' | 'em-revisao' | 'pronto-para-dev' | 'finalizado',
    jornada:  string,
    feature:  string,
    equipe:   Membro[]
  },

  // ── Card 2: Briefing e Regras ───────────────────────────────────────
  step2: {
    briefingEnabled:   boolean,
    briefingQuestions: BriefingQuestion[],  // [{ id, categoria, pergunta, resposta }]
    regras:            Regra[],             // [{ id, titulo, link, notas }]
    anexos:            Anexo[],
    selectedLibSlugs:  string[],
    auditReferences:   string[]
  },

  // ── Hub de frames documentados ──────────────────────────────────────
  frames: Frame[],

  // ── Fluxos criados no canvas ────────────────────────────────────────
  createdFlows: Flow[],
  nextFlowNumber: number,

  // ── Metadados globais ───────────────────────────────────────────────
  currentUser: null | User,
  _fichaGenerated: boolean,
  // Sincronização por subseção da Ficha (botão "Inserir [X] na Ficha" nas
  // 4 telas, handler backend insert-ficha-section) -- paralelo a
  // _fichaGenerated, mas por seção em vez de global. Ausente em dados
  // salvos antes de _schemaVersion 3; todo ponto de leitura usa fallback
  // (handoffData._fichaSections || {}).
  _fichaSections: {
    tokens:  { insertedAt: string | null, itemCount: number | null },
    specs:   { insertedAt: string | null, itemCount: number | null },
    medidas: { insertedAt: string | null, itemCount: number | null },
    fluxos:  { insertedAt: string | null, itemCount: number | null }
  },
  specs: Spec[],   // specs globais fora de frame
  specLinesVisible: Record<string, boolean>,  // estado de linhas/conectores ocultos por letra (grupo), specs globais
  docs: {
    proto:    { link: string },
    a11y:     { link: string },
    research: { link: string }
  }
}
```

---

### 5.1 `Membro`

```js
{
  nome:   string,
  email:  string,
  papel:  string
}
```

---

### 5.2 `BriefingQuestion`

```js
{
  id:        string,
  categoria: string,
  pergunta:  string,
  resposta:  string
}
```

---

### 5.3 `Regra`

```js
{
  id:     string,
  titulo: string,
  link:   string,
  notas:  string
}
```

---

### 5.4 `Frame`

```js
{
  id:             string,   // UUID gerado pelo plugin
  figmaId:        string,   // ID do nó Figma
  nome:           string,
  isNewComponent: boolean,

  specs:   null | ScanResult,   // resultado do scan de tokens DSC — ver 5.4.1
  audit: {
    checkDone:   boolean,
    semDesvios:  boolean,
    observacoes: string,
    ressalvas:   string[]
  },
  measurements:     Measurement[],
  createdSpecs:     Spec[],
  excecoes:         Excecao[],
  specGroupNames:   Record<string, string>,
  specGroupVisible: Record<string, boolean>
}
```

---

### 5.4.1 `ScanResult` e item de scan

```js
// ScanResult
{
  components: ScanItem[],
  icons:      ScanItem[],
  typography: ScanItem[],
  frames:     ScanItem[],
  vectors:    ScanItem[],
  frameJson:  object,       // snapshot estrutural bruto do frame (debug)
  fileKey:    string,
  framePreview: bytes | null
}

// ScanItem — um componente/ícone/estilo de tipografia/frame/vetor
// identificado pelo scan automático (handler scan-frame, code.js)
{
  name:               string,
  type:               'components' | 'icons' | 'typography' | 'frames' | 'vectors',
  nodeType:            string,   // node.type do Figma (INSTANCE, TEXT, etc.)
  componentKey:        string | null,
  nodeId:              string,   // id do nó no canvas — chave de casamento entre scans
  isDS:                true | 'warning' | false,   // conformidade calculada
  score:               number | null,
  matchedBy:           'key' | 'value' | 'name' | 'remote' | 'intrinsic' | null,
  matchedIn:           string | null,   // nome da lib onde bateu o match
  matchedTokenName:    string | null,
  isCustomComponent:   boolean,  // CALCULADO pelo scan: sem vínculo comprovado com a lib
  isMarkedCustom:      boolean,  // DECLARADO pelo designer (toggle "Componente Personalizado"
                                 // no card do item, tela Escanear Tokens) — ver nota abaixo
  variants:            { name: string, value: string }[],
  properties:          Property[]
}
```

**`isCustomComponent` vs. `isMarkedCustom` — não confundir:**
- `isCustomComponent` é **calculado automaticamente** pelo scan — proxy
  de "não achei vínculo comprovado com a lib DSC" (nem `componentKey` no
  skeleton, nem convenção `[dsc]` no nome). Mede vínculo TÉCNICO, não
  equivalência estrutural — um item pode ter `isCustomComponent: true`
  por simples limitação de detecção, sem ser genuinamente um componente
  novo.
- `isMarkedCustom` é **declarado manualmente pelo designer** (2026-09-16),
  via toggle no card do item na tela Escanear Tokens. É a única fonte de
  verdade sobre "isto precisa ser construído pelo dev" — controla o que
  entra no Card 3 "User Interface" da Ficha de Handoff (ver 4.10). Itens
  em conformidade ou "necessita revisão" nunca entram na Ficha
  automaticamente, mesmo que `isCustomComponent` seja `true` — a decisão
  é sempre humana.

**Preservação entre re-scans:** itens de `ScanResult` são recriados do
zero a cada scan (não há estado herdado). `isMarkedCustom` sobrevive a um
re-scan do mesmo frame porque o frontend envia o `ScanResult` anterior
junto no pedido de scan (`previousSpecs`, `scan-frame` handler, `code.js`)
e o backend casa itens do scan novo com o anterior por `nodeId` — nunca
por `name` (que pode colidir entre elementos diferentes).

---

### 5.5 `Spec`

```js
{
  id:           string,   // ID do grupo Figma: "[Spec | A | right] ..."
  targetNodeId: string,   // ID do nó Figma anotado
  name:         string,   // nome do nó anotado
  letter:       string,   // 'A'–'Z'
  guideSide:    'right' | 'left' | 'top' | 'bottom',
  color:        string,   // hex stroke da categoria
  fillColor:    string,   // hex fill da categoria
  category:     string,   // value (ex: 'comportamento')
  type:         string,   // label (ex: 'Comportamento')
  note:         string,
  properties:   Property[],
  cardX:        number,   // posição absoluta no canvas (px)
  cardY:        number,
  cardW:        number,
  cardH:        number,
  visible:      boolean,  // default true — controla visibilidade do card no canvas
  locked:       boolean   // default true (equivalente a undefined) — false = destravado manualmente pelo designer
}
```

---

### 5.6 `Property`

```js
{
  label: string,
  value: string | number,
  token: string | null   // token DSC se aplicável
}
```

---

### 5.7 `Measurement`

```js
{
  id:       string,
  name:     string,
  tipo:     'padding' | 'gap' | 'width' | 'height' | 'radius',
  eixo:     'top' | 'bottom' | 'left' | 'right' | 'horizontal' | 'vertical' | 'all',
  valor:    number,
  unidade:  'px' | '%',
  nodeId:   string   // ID do nó Figma medido
}
```

---

### 5.8 `Flow`

```js
{
  id:          string,
  numero:      number,
  tipo:        'inicio' | 'fim' | 'decisao' | 'conexao',
  nome:        string,
  frameOrigem: string,
  frameDestino: string,
  decisao:     string | null
}
```

---

### 5.9 `Excecao`

```js
{
  id:     string,
  tipo:   'Erro' | 'Alerta' | 'Sucesso' | 'Confirmação',
  titulo: string,
  notas:  string
}
```

---

## 6. Relação Canvas ↔ Persistência

```
Canvas (Figma)                                  Persistência (localStorage)
──────────────────────────────────────────────  ────────────────────────────────────
[Spec | A | right] Ação 4               ←→     frames[i].createdSpecs[j]
  regex m[1] (letra)                    ←→     spec.letter
  regex m[2] (lado)                     ←→     spec.guideSide
  regex m[3] (elemento)                 ←→     spec.name
  group.id                              ←→     spec.id
  Ficha.absoluteBoundingBox             ←→     spec.cardX/Y/W/H

[Fluxo | 1 | decisao] Login             ←→     createdFlows[i]
  regex m[1] (numero)                   ←→     flow.numero
  regex m[2] (tipo)                     ←→     flow.tipo
  regex m[3] (nome)                     ←→     flow.nome

[Medida | padding | top] Button         ←→     frames[i].measurements[j]
  regex m[1] (tipo)                     ←→     measurement.tipo
  regex m[2] (eixo)                     ←→     measurement.eixo
  regex m[3] (elemento)                 ←→     measurement.name

[Campo | titulo] Título do Projeto      ←→     step1.titulo
[Campo | objetivo] Objetivo             ←→     step1.objetivo
[Briefing | 1] {pergunta}               ←→     step2.briefingQuestions[0]
[Frame | abc123] Tela de Login          ←→     frames[i] (figmaId = abc123)
```

**Fonte de verdade para posicionamento:** canvas (leitura via `absoluteBoundingBox`).
**Fonte de verdade para dados:** localStorage (leitura via `getFrame`, `handoffData`).

---

### 6.1 Inserção incremental por subseção (2026-09-15)

Além do fluxo global "Gerar Ficha" (`create-handoff`, sempre remove e
reconstrói a Ficha inteira), cada uma das 4 telas (Escanear Tokens, Anotar
Specs, Anotar Medidas, Fluxos de Tela) tem um botão próprio **"Inserir [X]
na Ficha"** (`insertSectionInFicha()`, `modules/handoff.js`) que sincroniza
**só a subseção correspondente** no canvas, preservando as demais como
estavam:

```
Botão "Inserir Tokens na Ficha"    → insert-ficha-section { section: 'tokens'  } → [Seção] Frames Documentados
Botão "Inserir Specs na Ficha"     → insert-ficha-section { section: 'specs'   } → [Seção] Especificações
Botão "Inserir Medidas na Ficha"   → insert-ficha-section { section: 'medidas' } → [Seção] Medidas
Botão "Inserir Fluxos na Ficha"    → insert-ficha-section { section: 'fluxos'  } → [Seção] Fluxos de Tela
```

O handler (`code.js`) localiza a Ficha existente do projeto
(`_hdFindExistingFicha`) e, dentro dela, o container `Handex | Content`
(nome fixo, ver 4.1) — substitui só a subseção pedida no mesmo índice
(`_hdReplaceSection`), reaproveitando as mesmas funções de montagem
(`_hdRebuildFramesSection`/`_hdRebuildMeasuresSection`/
`_hdRebuildSpecsSection`/`_hdRebuildFlowsSection`) usadas por `create-handoff`
— nunca duplica a lógica de montagem entre os dois caminhos. Se a Ficha do
projeto ainda não existe no canvas, o backend não cria uma versão parcial:
devolve `ficha-section-needs-full-create` e o frontend dispara
`createHandoffOnCanvas()` normalmente, que cria a Ficha completa (mesmo
comportamento de sempre para "primeira geração").

Diferente de `finalizeSection()` (confirmação leve, 100% local, nunca toca
o canvas — continua existindo separada), o botão "Inserir [X] na Ficha"
sincroniza de fato. Metadado de sincronização por seção: ver
`_fichaSections` (seção 5).

---

## 7. Roadmap HTML/SharePoint

Cada entidade persistida tem campos suficientes para gerar um card HTML autônomo.

### Spec card
```html
<section class="spec" data-letter="A" data-side="right" data-category="comportamento">
  <header>
    <span class="tag">A</span>
    <h4>Ação 4</h4>
    <span class="pill">Comportamento</span>
  </header>
  <p class="note">Descrição da spec...</p>
  <ul class="props">
    <li><b>ALTURA</b> 48px</li>
    <li><b>ALINHAMENTO</b> CENTER / CENTER</li>
  </ul>
</section>
```

### Briefing card
```html
<section class="briefing-item" data-number="1">
  <h5>Qual é o problema que estamos resolvendo?</h5>
  <p>Resposta do designer...</p>
</section>
```

### Convenção de extensibilidade

Para adicionar novos tipos de artefato, seguir sempre:
```
[{Tipo} | {meta1} | {meta2}] {descrição legível}
```

Incrementar `_schemaVersion` e adicionar migrador em `code.js` a cada mudança estrutural incompatível.
