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

```
[Seção | {tipo}] {titulo}
```

| Meta `tipo` | Conteúdo |
|---|---|
| `info` | Informações básicas do projeto |
| `equipe` | Membros da equipe |
| `regras` | Regras de negócio e HUs |
| `excecoes` | Cenários de exceção |
| `docs` | Links de documentação |
| `frames` | Frames documentados |
| `medidas` | Medidas por frame |
| `specs` | Especificações por frame |
| `fluxos` | Fluxos de tela |
| `briefing` | Briefing estratégico |

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
  ├── Badge         (FRAME, opcional) ← "Novo componente"
  └── Auditoria     (FRAME, opcional) ← resultado DSC
```

---

### 4.6 Medidas (dentro da ficha)

```
[Medidas | {figmaId}] {nomeFrame}          ← agrupador por frame
  └── [Medida | {tipo} | {valor}] {nome}   ← item individual
        ├── Label    (TEXT, Bold)
        └── Detalhe  (TEXT, Regular)
```

---

### 4.7 Especificações (dentro da ficha)

```
[Specs | {figmaId}] {nomeFrame}             ← agrupador por frame
  └── [Grupo | {letra}] {nomeGrupo}         ← grupo por letra
        └── [Spec | {letra}] {nomeSpec}     ← spec individual
              ├── Tag          (FRAME)
              ├── Categoria    (FRAME)
              ├── Nota         (TEXT)
              ├── Propriedades (FRAME)
              │   └── Prop/{label}
              └── Excecoes     (FRAME, opcional)
```

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

```
[Scan | {categoria}] {titulo}       ← agrupador por categoria
  └── [Token | {tipo}] {nomeToken}  ← item individual
        ├── Preview     (FRAME)
        ├── Nome        (TEXT)
        ├── Status      (FRAME, chip: DSC/AJUSTE/FORA)
        └── Props       (FRAME)
            └── Prop/{label}
```

---

## 5. Schema de Persistência (`handoffData`)

Armazenado em `localStorage` via `saveToStorage()` / `saveSpecsToStorage()`.
Versão atual: `_schemaVersion: 2`

```js
{
  _schemaVersion: 2,

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

  specs:   null | ScanResult,   // resultado do scan de tokens DSC
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
