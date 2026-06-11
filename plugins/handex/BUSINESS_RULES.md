# HANDEX — Regras de Negócio, Travas, Disclaimers e Jornadas

> Documento de referência técnica e funcional do plugin Handex v4.1+
> Última atualização: 2026-06-11 (v4.1.6)

---

## Sumário

1. [Estrutura de Dados](#1-estrutura-de-dados)
2. [Regras de Negócio por Funcionalidade](#2-regras-de-negócio-por-funcionalidade)
3. [Travas e Condições de Bloqueio](#3-travas-e-condições-de-bloqueio)
4. [Comportamentos Automáticos](#4-comportamentos-automáticos)
5. [Disclaimers e Mensagens ao Usuário](#5-disclaimers-e-mensagens-ao-usuário)
6. [Jornadas de Usuário](#6-jornadas-de-usuário)
7. [Persistência e Armazenamento](#7-persistência-e-armazenamento)
8. [Integrações com o Backend Figma](#8-integrações-com-o-backend-figma)
9. [Limites Técnicos](#9-limites-técnicos)
10. [Glossário](#10-glossário)

---

## 1. Estrutura de Dados

### Schema v2 (`handoffData`)

```js
{
  _schemaVersion: 2,
  step1: {
    titulo: '',           // obrigatório para gerar ficha
    versao: 'v1.0',       // obrigatório, default 'v1.0'
    objetivo: '',         // obrigatório para gerar ficha
    status: 'rascunho',   // rascunho | em-revisao | pronto-para-dev | finalizado
    jornada: '',          // opcional, auto-fill via frame selecionado
    feature: '',          // opcional, auto-fill via frame selecionado
    equipe: []            // min 1 membro com email válido para gerar ficha
  },
  step2: {
    briefingEnabled: false,
    briefingQuestions: [],  // [{ id, categoria, pergunta, resposta }]
    regras: [],             // [{ id, titulo, link, notas }]
    anexos: [],
    selectedLibSlugs: [],
    auditReferences: []
  },
  frames: [],              // hub de frames documentados (ver estrutura abaixo)
  createdFlows: [],        // fluxos de tela criados
  nextFlowNumber: 1,
  currentUser: null,
  _fichaGenerated: false,  // controla modal de versionamento
  specs: [],               // specs globais (fora de frame)
  docs: {
    proto:    { link: '' },
    a11y:     { link: '' },
    research: { link: '' }
  }
}
```

### Estrutura de cada Frame

```js
{
  id: '<timestamp>',
  figmaId: '<nodeId>',
  nome: 'Nome do Frame',
  isNewComponent: false,
  newComponentObservations: '',
  specs: null,                    // resultado do scan de tokens
  audit: {
    checkDone: false,       // Check Designs realizado
    semDesvios: false,      // designer declara conformidade
    observacoes: '',        // texto livre de desvios/justificativa
    ressalvas: []           // snapshot dos itens não conformes no momento da declaração
                            // [{ category, label, name, nodeId, status: 'error'|'warning' }]
  },
  measurements: [],
  nextMeasurementNumber: 1,
  createdSpecs: [],
  excecoes: [],
  specGroupNames: {},             // { letra: 'nome do grupo' }
  specGroupVisible: {},           // { letra: boolean }
  measurementsGroupVisible: true
}
```

### Regra de Migração de Schema

- Se o estado salvo não contém `_schemaVersion`, ele é descartado automaticamente no `init-plugin`
- Não há migração parcial — descarte total com reinício limpo
- Razão: evitar estados híbridos entre schema v1 (wizard) e v2 (ferramentas independentes)

---

## 2. Regras de Negócio por Funcionalidade

### 2.1 Informações do Projeto

| Campo | Obrigatório | Validação | Comportamento |
|---|---|---|---|
| Título | Sim | Min 1 caractere | Habilita "Gerar Ficha" |
| Versão | Sim | Padrão `v{major}.{minor}` | Default `v1.0` |
| Objetivo | Sim | Min 1 caractere | Habilita "Gerar Ficha" |
| Status | Não | Enum fixo | Default `rascunho` |
| Jornada | Não | Texto livre | Auto-fill do frame selecionado |
| Feature | Não | Texto livre | Auto-fill do frame selecionado |
| Equipe | Sim (1 email) | Regex de email | Min 1 membro com email válido |

**Papéis de equipe disponíveis:** Designer · DEV · PO · QA · Outro

**Validação de email:** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Feedback visual: borda verde + ring-green-100 ao passar
- Validação dispara ao blur do campo email

**Auto-fill de título:** ao abrir o plugin, tenta preencher `s1-titulo` com `figma.root.name` se o campo estiver vazio.

**Auto-fill de Jornada / Feature:** quando o checkbox é marcado, envia `get-context-name` ao backend, que retorna o nome do frame selecionado no canvas no momento do clique.

---

### 2.2 Contexto de Negócio

Toda a seção é opcional. Nenhum campo bloqueia avanço ou geração de ficha.

**Briefing Estratégico**
- Ativado por toggle
- Perguntas pré-categorizadas por: Contexto · Escopo · Stakeholders · UX/Design · Pesquisa
- Cada pergunta tem: categoria, texto e campo de resposta (textarea)
- Ilimitado número de perguntas; removíveis individualmente

**Regras de Negócio**
- Campos: título (obrigatório por item) · link (URL, validado ao blur) · notas (textarea)
- Ilimitado número de regras; removíveis individualmente

**Documentação Externa**
- Protótipo navegável · Acessibilidade · Pesquisa de UX
- Todos opcionais; validação de URL ao blur

---

### 2.3 Escanear Tokens (Hub de Frames)

**Tipos de nó aceitos para registro:**
`FRAME` · `COMPONENT` · `INSTANCE` · `SECTION` · `GROUP`

**Fluxo de registro de frame:**
1. Usuário seleciona frame no canvas do Figma
2. Clica em "+ Registrar Frame" no plugin
3. Plugin envia `get-selection-info` ao backend
4. Backend retorna `{ nodeId, name }` do nó selecionado
5. `addFrame(figmaId, nome)` cria entrada em `handoffData.frames[]`

**Escaneamento de tokens:**
- Categorias selecionáveis: Componentes · Ícones · Tipografia · Frames e Layouts · Vetores
- Envia `scan-frame` com `{ frameId, nodeId, categories, selectedLibSlugs }`
- Resultado organizado em accordion por tipo; exibe contagem por categoria
- Se > 10 itens em uma seção: exibe campo de busca

**Filtragem automática de resultados:**

| Tipo de nó | Comportamento |
|---|---|
| `VECTOR`, `BOOLEAN_OPERATION`, `ELLIPSE`, `RECTANGLE` | Removidos sempre — shapes primitivos não representam conformidade DS |
| `FRAME` / `GROUP` com filhos `INSTANCE` ou `COMPONENT` | Removidos — são contêineres de layout; a conformidade vive nos filhos |
| `FRAME` / `GROUP` sem nenhum filho DS (100% custom) | Mantidos como alerta — indicam construção fora do DS |

Razão da regra: a conformidade não se aplica ao contêiner, mas ao que está dentro dele. Exibir frames de layout como "não conformes" induz o dev a erro sobre a natureza do problema.

**Ícone de localização nos cards escaneados:**
- Cada card de elemento exibe ícone `locate` no header (visível no hover)
- O card inteiro é clicável e chama `focusNode(item.nodeId)` para navegar ao nó no canvas

**Novo Componente:**
- Toggle por frame
- Se marcado: exibe campo de observações (`newComponentObservations`), muda subtítulo para "Novo Componente" (violeta) e **oculta a seção de Conformidade DSC**
- Justificativa: componente inédito passará por revisão dedicada no time DSC — auditoria contra a lib existente não se aplica
- Frames marcados como "Novo Componente" são destacados na ficha e nos documentos exportados

**Conformidade DSC** (visível apenas quando `isNewComponent = false`):
- `checkDone` — declaração de que o Check Designs foi executado
- Se `checkDone = true`:
  - Toggle "Sem desvios encontrados" (`semDesvios`)
  - Ao ativar `semDesvios`: snapshot dos itens não conformes salvo em `audit.ressalvas[]`
  - Textarea de observações visível quando `semDesvios = false` ou há itens no scan

**Status de conformidade (subtítulo do card):**

| Condição | Status | Cor |
|---|---|---|
| `isNewComponent = true` | Novo Componente | Violeta |
| `checkDone = false` | Pendente | Cinza |
| `semDesvios = true` + scan limpo | Conforme | Verde |
| `semDesvios = true` + itens no scan | Conforme com ressalvas | Âmbar |
| `semDesvios = false` | Não Conforme | Vermelho |

**Ressalvas:**
- Ao marcar `semDesvios = true`, o plugin salva um snapshot dos itens `isDS === false/warning` em `audit.ressalvas[]`
- As ressalvas são incluídas na ficha canvas e no MD exportado com Node ID para rastreabilidade em auditoria futura
- Ao desmarcar `semDesvios`, `ressalvas` é limpo

**Detecção de conformidade (scan):**
- `variable.remote = true` → token de variável de biblioteca publicada → `isDS: true`
- `style.remote = true` → estilo (cor, tipografia, efeito) de biblioteca publicada → `isDS: true`
- `mainComponent.remote = true` → instância de biblioteca publicada → `isDS: true`
- Tipografia: `styleKey != null` + fonte CAIXAstd → `isDS: true`
- Componente com prefixo `[dsc]` no nome → `isDS: true` (fallback sem chave no skeleton)
- Chave da instância presente em `componentKeys[]` do skeleton → `isDS: true` (match exato)

---

### 2.4 Anotar Specs

**Estrutura de uma spec:**
```js
{
  id: '<figmaNodeId>',
  targetNodeId: '',   // ID Figma do elemento anotado (para link NODE na ficha e reimportação)
  name: '',           // obrigatório (editável inline)
  letter: 'A',        // 1-2 chars, uppercase, obrigatório
  color: '#005ca9',   // hex — cor semântica da categoria
  type: '',           // campo primário da categoria (alias de categoryLabel); usado na ficha como chip
  category: '',       // slug interno da categoria (ex: 'comportamento', 'layout')
  categoryLabel: '',  // label legível; fallback quando type estiver ausente
  note: '',
  link: '',
  guideSide: 'right', // right | left | top | bottom
  properties: [],     // [{ label, token, value }]
  obs: '',
  excecoes: [],
  visible: true
}
```

**Validações do formulário:**
- Tag (letter): máx 2 caracteres, obrigatório, convertido para uppercase
- Categoria: pode ser "Sem categoria"
- Link: opcional; validado como URL ao blur
- Propriedades: seleção múltipla via modal `spec-properties-modal`

**Categorias padrão de spec:**

| Valor | Label | Cor |
|---|---|---|
| `info` | Informação extra | slate |
| `comportamento` | Comportamento | pink |
| `regra` | Regra de Negócio | blue |
| `api` | Dados da API | lime |
| `layout` | Layout | indigo |
| `interacao` | Interação | emerald |
| `acessibilidade` | Acessibilidade | purple |
| `componente` | Componente | rose |
| `tipografia` | Tipografia | yellow |
| `cor` | Cor | teal |
| `conteudo` | Conteúdo | cyan |

**Categorias personalizadas:**
- Armazenadas em `localStorage['handex-ann-categories-v2']`
- Criáveis, renomeáveis e removíveis pelo usuário
- Se localStorage bloqueado (data: URL), as categorias padrão são carregadas sem persistência

**Agrupamento por frame:**
- Specs são agrupadas por letra (A, B, C…) com conectores coloridos
- Nome do grupo editável por letra
- Visibilidade togglável por spec e por grupo

---

### 2.5 Anotar Medidas

**Tipos de medida disponíveis:**

| Tipo | Descrição |
|---|---|
| `wh` | Altura e Largura (Width / Height) |
| `outer` | Espaçamento Externo (Margin) |
| `inner` | Padding Interno |
| `spacing` | Padding e Gaps |

**Regras:**
- Pelo menos 1 tipo deve ser selecionado para executar
- Numeração sequencial por frame (`frame.nextMeasurementNumber`)
- Opção "Armazenar no frame pai" (`storeInParent`) — disponível mas oculto por padrão
- Resultado retornado como array de `{ name, number, nodeId, details[], visible }`

---

### 2.6 Fluxos de Tela

**Tipos de fluxo:**

| Tipo | Elementos necessários | Descrição |
|---|---|---|
| `event_start` | 1 | Início de jornada |
| `event_end` | 1 | Fim de jornada |
| `line_solid` | 2 | Conexão sequencial |
| `line_dashed` | 2 | Conexão de mensagem |
| `diamond` | 2 | Decisão (com texto obrigatório) |
| `diamond_dashed` | 2 | Decisão opcional |
| `gateway_parallel` | 2+ | Fork / Join paralelo |

**Campos condicionais:**
- `decisionText`: obrigatório para tipos `diamond` e `diamond_dashed`
- `chipText`: opcional para `line_solid` e `line_dashed` (ex: "Sim", "Não")
- `anchorSide`: posição da seta — `auto` · `top` · `bottom` · `left` · `right`

**Regra de seleção:**
- Tipos Início/Fim: exatamente 1 elemento selecionado no canvas
- Demais tipos: exatamente 2 elementos selecionados

---

### 2.7 Exceções de Spec

**Tipos disponíveis:**

| Tipo | Cor | Ícone |
|---|---|---|
| Erro | red-500 | x-circle |
| Sucesso | green-500 | check-circle |
| Confirmação | blue-500 | help-circle |
| Alerta | amber-500 | alert-triangle |

**Campos:**
- Tipo (obrigatório para confirmar)
- Título (texto livre)
- Link âncora (URL opcional)
- Observações (checkbox + textarea condicional)
- "Injetar no frame de spec": visível apenas se a exceção tem `nodeId` de spec associado E `obs` preenchida

**Injeção de obs no canvas:**
- Ao confirmar com "Injetar" marcado: backend cria frame `[Obs]` abaixo do frame de spec correspondente no canvas

---

### 2.8 Geração da Ficha no Canvas

**Pré-requisitos obrigatórios:**
1. `step1.titulo` não vazio
2. `step1.objetivo` não vazio
3. Pelo menos 1 membro de equipe com email válido
4. Papel `Designer` presente na equipe

**Nomeação automática do frame:**
```
Handex | Ficha de Projeto | {titulo} | {DD/MM/AAAA}
```

**Versionamento:**
- Se `_fichaGenerated === true`: abre modal de versionamento antes de gerar
- Opções: Major (v1.0 → v2.0) ou Minor (v1.0 → v1.1)
- Campo de versão editável para customização livre

**Locking automático:**
Todos os nós gerados pelo plugin são criados com `node.locked = true`:
- Frame principal da ficha
- Grupos de spec individual
- Frame de legenda de fluxos
- Frame injetado de observação de exceção
- Grupos de medida

**Chip de status — semântica de cor:**

| Status | Cor |
|---|---|
| rascunho | cinza (#94a3b8) |
| em-revisao | amarelo (#f59e0b) |
| pronto-para-dev | azul (#0070af) |
| finalizado | verde (#22c55e) |

**Seção de Especificações na ficha:**

- As seções "Especificações Visuais" e "Especificações Anotadas" foram **mescladas** em um único card "Especificações"
- Specs são organizadas por letra (grupo), com cabeçalho de nome do grupo quando `frame.specGroupNames[letra]` estiver definido
- Grupos com `frame.specGroupVisible[letra] === false` são omitidos da ficha
- Cada spec exibe:
  - **Chip de categoria** com cor semântica proveniente de `spec.color` (bg suave + borda colorida) e o label de `spec.type || spec.categoryLabel || spec.category` (fallback: `'Geral'`)
  - **Nome da spec** — se `spec.targetNodeId` existir e o nó estiver no documento, o nome é sublinhado e funciona como hyperlink `type: "NODE"` para o elemento anotado no canvas
  - **Propriedades técnicas** — cada entrada de `spec.properties[]` é exibida como linha com `prop.label`, `prop.token` e `prop.value`

**Card User Interface — indicadores de propriedade:**

- Cada propriedade escaneada exibe um ícone semântico por tipo (espaçamento direcional, tipografia, cor como swatch real, borda, raio etc.) seguido de label e valor
- **Dots de conformidade por propriedade foram removidos** — a acurácia de conformidade é responsabilidade do designer e não é informação acionável para o dev
- O badge de status do componente (DSC / AJUSTE / FORA) permanece visível no header do card do elemento, mas apenas quando a auditoria está ativa (`data.isAudit = true`)

---

### 2.9 Limpar Todos os Dados

**Botão:** ícone `trash-2` ao lado do botão "Importar JSON" na home.

**Fluxo:**
1. Clique abre o modal `confirm-clear-modal` (confirmação destrutiva)
2. Ao confirmar "Sim, limpar tudo":
   - `localStorage['handex-state']` removido
   - `localStorage['handex-ann-categories-v2']` removido
   - `handoffData` resetado para o estado inicial (schema v2 limpo)
   - `createdSpecs` esvaziado em memória
   - UI re-populada via `restoreUIFromState()`
   - Navegação para `view-home`
   - Toast: "Todos os dados foram removidos."
3. Ao cancelar: modal fechado sem alteração

> **Nota:** `location.reload()` não é suportado no WebView do Figma (resulta em tela branca). O reset é feito inteiramente em memória sem recarregar a página.

---

### 2.10 Exportação

**Formatos disponíveis:**
- **JSON** — backup completo do `handoffData` (sem previews Uint8Array)
- **Markdown (.md)** — documentação estruturada com tokens por categoria
- **HTML interativo** — standalone com Tailwind e Lucide embarcados

**Tokens no MD/HTML:**
- Listados por categoria com nomes reais (até 10 por categoria)
- Excedente exibido como `+N itens`
- Tags de categoria no HTML com `cursor:default; pointer-events:none` (não são clicáveis)

**Importação de JSON:**
- Valida presença de `step1` na raiz
- Incrementa versão minor automaticamente ao importar
- Merge com defaults para campos ausentes

---

## 3. Travas e Condições de Bloqueio

### 3.1 Botão "Gerar Ficha"

Desabilitado (`opacity-50`, `cursor-not-allowed`) enquanto qualquer condição não for atendida:

| Condição | Origem |
|---|---|
| `step1.titulo` vazio | `validateStep1()` |
| `step1.objetivo` vazio | `validateStep1()` |
| Nenhum email válido na equipe | `validateStep1()` |
| Nenhum Designer na equipe | `validateStep1()` |

### 3.2 Botão "Confirmar Exceção"

Desabilitado até que o usuário selecione um tipo (Erro / Sucesso / Confirmação / Alerta).

### 3.3 Botão "Conectar Frames" (Fluxo)

Desabilitado até que o usuário selecione um tipo de fluxo no modal.

### 3.4 Checklist da Ficha (Step 5)

O checklist exibe status em tempo real:

| Item | Status |
|---|---|
| Título preenchido | ✓ / ✗ |
| Responsável com email | ✓ / ✗ |
| Frames documentados (≥1) | ✓ / ✗ |
| Conformidade declarada | ✓ / ✗ |
| Fluxos mapeados | ◇ (opcional) |

### 3.5 Locking de layers no canvas

Qualquer layer gerada pelo plugin é bloqueada contra edição direta no Figma.
Para remover ou recriar um item, o usuário deve usar os botões de exclusão dentro do plugin.

### 3.6 Schema desatualizado

Se o estado salvo no `figma.clientStorage` não contém `_schemaVersion: 2`, ele é descartado completamente e o plugin inicia com estado limpo. Não há prompt ao usuário — o descarte é silencioso e automático.

### 3.7 Seleção cross-page

Ao tentar focar/selecionar um nó no canvas, o plugin verifica se o nó pertence à página atual (`_nodeOnCurrentPage()`). Se não pertencer, o foco é silenciosamente ignorado sem erro.

---

## 4. Comportamentos Automáticos

| Ação do usuário | Comportamento automático |
|---|---|
| Abre o plugin | Tenta preencher `s1-titulo` com o nome do arquivo Figma |
| Marca checkbox "Jornada" ou "Feature" | Requisita nome do frame selecionado e preenche o campo |
| Adiciona membro com email | Revalida o botão "Gerar Ficha" |
| Remove membro da equipe | Revalida o botão "Gerar Ficha" |
| Altera qualquer campo | Salva automaticamente via `saveToStorage()` |
| Cria spec, medida ou fluxo | Salva e renderiza na lista imediatamente |
| Importa JSON | Incrementa versão minor automaticamente |
| Gera ficha uma segunda vez | Abre modal de versionamento antes de prosseguir |
| Adiciona novo item a uma lista | Auto-scroll para o item adicionado (100 ms) |
| Ativa tema dark/light | Persiste preferência em `localStorage['theme']` |
| Clica em "Limpar todos os dados" (lixeira) | Abre modal de confirmação destrutiva |
| Confirma limpeza no modal | Reseta `handoffData` em memória, limpa localStorage, navega para home e exibe toast |
| Clica em `⇅` (recolher/expandir) | `collapseAllAccordions(container)` — recolhe ou expande todos os accordions visíveis no container, incluindo os cards de frame (`frame-body-{id}`) e accordions internos (tokens, medidas, specs) |

---

## 5. Disclaimers e Mensagens ao Usuário

### 5.1 Toast de feedback (UI)

| Contexto | Mensagem |
|---|---|
| Salvo automaticamente | "Salvo automaticamente" (ícone verde) |
| Step 1 inválido ao avançar | "Preencha o título e ao menos um e-mail de responsável para avançar." |
| Frame já escaneado | "Frame "{nome}" já escaneado. Atualizando..." |
| Cache limpo | "Cache limpo. Plugin reiniciado." |
| Exportação bem-sucedida | "Dados exportados com sucesso!" |
| Ficha gerada | "Ficha gerada no canvas!" |
| Buscando framework | "Buscando framework no canvas..." |

### 5.2 Notify do Figma (backend)

Mensagens exibidas como notificação nativa do Figma:

- Ao criar medidas: confirmação com número e tipo
- Ao criar fluxo: confirmação com nome
- Ao criar spec: confirmação com letra/categoria
- Ao criar legenda: "Legenda criada!"
- Ao criar ficha: "Ficha técnica criada no canvas!"

### 5.3 Hints visíveis na interface

| Local | Texto |
|---|---|
| Escanear Tokens (estado vazio) | "Selecione um Frame no canvas do Figma e clique em **Registrar Frame** para documentá-lo com tokens, medidas e specs." |
| Anotar Specs (estado vazio) | "Selecione um elemento no canvas e toque no botão **+** abaixo." |
| Anotar Medidas (estado vazio) | "Selecione os elementos no canvas e toque no botão **+** abaixo." |
| Fluxos de Tela (estado vazio) | "Selecione dois elementos no Figma e use o botão **+ Conectar Frames** para mapear fluxos de navegação." |
| Tipo Decisão no modal de fluxo | "Dica: Use frases curtas para melhor legibilidade dentro do losango." |
| Como Usar — hint de layers | "Specs, medidas, fluxos e a Ficha de Projeto são criados com bloqueio de edição para preservar a integridade do handoff. Para remover ou recriar um item, utilize os botões de exclusão dentro do próprio plugin." |
| Jornada / Feature | "Ao marcar, preenche com o nome do frame selecionado no Figma" |
| Spec — Dica de uso | "O destaque e o scroll automático no Figma ocorrem apenas ao clicar para expandir um item da lista." |

### 5.4 Confirmações destrutivas

| Ação | Confirmação |
|---|---|
| Limpar cache do plugin | `window.confirm("Limpar todo o cache do plugin?\n\nIsso removerá: formulário, frames, auditoria, medidas, fluxos e histórico.\n\nEssa ação não pode ser desfeita.")` |
| Limpar todos os dados (botão lixeira na home) | Modal `confirm-clear-modal` — título "Limpar todos os dados?", botões "Cancelar" e "Sim, limpar tudo" (vermelho) |

### 5.5 Disclaimers técnicos (sem exibição ao usuário)

- **`clientStorage` sem plugin ID:** o plugin opera sem persistência entre sessões quando executado como plugin de desenvolvimento sem ID registrado no manifesto. Falha silenciosa com log de aviso interno.
- **`localStorage` bloqueado:** em contexto `data:` URL (modo dev), o localStorage é inacessível. O plugin funciona normalmente sem persistência de tema e de preferências de categorias.

---

## 6. Jornadas de Usuário

### 6.1 Jornada Principal — Handoff Completo

```
HOME
 │
 ├─► Informações do Projeto
 │     Preenche: título, versão, objetivo, status, equipe
 │     Opcional: jornada, feature, briefing, regras, docs
 │
 ├─► Escanear Tokens
 │     Seleciona frame no canvas → Registrar Frame
 │     Para cada frame:
 │       Escaneia tokens por categoria
 │       Marca conformidade DSC
 │       Marca se é Novo Componente
 │
 ├─► Anotar Specs
 │     Seleciona elemento no canvas → botão +
 │     Define: letra, categoria, nota, link, guia
 │     Adiciona propriedades técnicas e exceções
 │
 ├─► Anotar Medidas
 │     Seleciona elemento(s) no canvas → botão +
 │     Escolhe tipos (wh / outer / inner / spacing)
 │
 ├─► Fluxos de Tela
 │     Seleciona 1 ou 2 elementos → Conectar Frames
 │     Define tipo, texto de decisão (se diamond) e chip
 │
 └─► Gerar Ficha de Handoff
       Checklist validado → Gerar Ficha no Canvas
       Opcional: Exportar MD / JSON / HTML
```

---

### 6.2 Jornada Rápida — Apenas Specs

```
HOME → Anotar Specs
  Seleciona elemento → botão +
  Preenche letra e categoria
  Confirma → spec aparece no canvas e na lista
```

---

### 6.3 Jornada Rápida — Apenas Medidas

```
HOME → Anotar Medidas
  Seleciona elementos no canvas
  Escolhe tipos de medida → botão +
  Confirma → medidas aparecem no canvas e na lista
```

---

### 6.4 Jornada Rápida — Fluxo de Navegação

```
HOME → Fluxos de Tela
  Seleciona 2 frames no canvas
  Clica + Conectar Frames
  Escolhe tipo (sequência, decisão, etc.)
  Preenche textos condicionais
  Confirma → seta / losango criado no canvas
```

---

### 6.5 Jornada — Atualização de Ficha Existente

```
HOME → Gerar Ficha de Handoff
  Plugin detecta ficha existente (_fichaGenerated = true)
  Abre modal de versionamento:
    Minor: v1.0 → v1.1 (ajuste incremental)
    Major: v1.0 → v2.0 (redesenho significativo)
  Usuário confirma versão → ficha recriada no canvas
```

---

### 6.6 Jornada — Exportação de Documentação

```
HOME → Gerar Ficha de Handoff (view-handoff-summary)
  Exportar como Markdown → download .md
  Exportar como JSON → download .json (backup)
  Gerar Ficha no Canvas → cria frame no Figma
```

---

### 6.7 Jornada — Exceção em Spec

```
Anotar Specs → expande uma spec → + Exceção
  Seleciona tipo (Erro / Sucesso / Confirmação / Alerta)
  Preenche título, âncora, observação
  Se obs preenchida e spec tem nodeId:
    Opção "Injetar observação no frame de spec"
    → Ao confirmar: cria frame [Obs] no canvas abaixo da spec
```

---

### 6.8 Jornada — Importar Dados Existentes

```
HOME → Importar JSON (botão utilitário)
  Seleciona arquivo .json exportado anteriormente
  Plugin valida presença de step1
  Faz merge com estado atual
  Versão minor incrementada automaticamente
  UI re-populada via restoreUIFromState()
```

---

## 7. Persistência e Armazenamento

### 7.1 Figma clientStorage (assíncrono, por arquivo)

| Chave | Conteúdo | Quando salva |
|---|---|---|
| `handoffData` | Estado completo do projeto | A cada alteração (`saveToStorage`) |
| `handex-scan-cache-v1` | Último resultado de scan com previews | Após scan bem-sucedido |
| `handex-history-{fileKey}` | Array de até 5 snapshots de versão | Ao exportar handoff |

> **Limitação:** `figma.clientStorage` não funciona sem um `id` válido no manifesto do plugin. Em ambiente de desenvolvimento sem ID publicado, todas as operações de storage falham silenciosamente. O plugin continua funcionando sem persistência entre sessões.

### 7.2 localStorage (síncrono, por navegador)

| Chave | Conteúdo |
|---|---|
| `theme` | Preferência de tema (`light` / `dark`) |
| `handex-ann-categories-v2` | Categorias personalizadas de spec (JSON) |
| `handex-check-designs-prompted-v1` | Flag: modal "Check Designs" já exibido |

> **Limitação:** `localStorage` é bloqueado em contexto `data:` URL (modo dev do Figma). O plugin captura o `SecurityError` e opera normalmente sem as preferências salvas.

### 7.3 Histórico de snapshots

- Máximo de 5 snapshots por arquivo
- Cada snapshot contém: `exportedAt`, `projectName`, `versao`, dados do scan
- Usado para calcular diff entre versões no HTML interativo

---

## 8. Integrações com o Backend Figma

### 8.1 Mensagens UI → Backend (`code.js`)

| Tipo | Payload principal | Quando enviado |
|---|---|---|
| `save-storage` | `{ data: handoffData }` | A cada alteração |
| `get-selection-info` | — | Ao registrar frame ou abrir fluxo |
| `get-context-name` | — | Ao ativar Jornada / Feature |
| `scan-frame` | `{ nodeId, categories, selectedLibSlugs }` | Ao escanear tokens |
| `measure-nodes-custom` | `{ measureTypes[], storeInParent, startingNumber }` | Ao criar medida |
| `create-unified-spec` | `{ opts: { category, letter, … } }` | Ao criar spec |
| `create-flow` | `{ name, type, nodes[], chipText, … }` | Ao criar fluxo |
| `create-handoff` | `{ data: handoffData }` | Ao gerar ficha |
| `inject-obs-to-spec` | `{ nodeId, obs, specName }` | Ao injetar obs de exceção |
| `highlight-node` | `{ id, shouldScroll }` | Ao expandir item na lista |
| `hide-node` | `{ id, forceState }` | Ao ocultar item |
| `delete-node` | `{ id }` | Ao excluir item |
| `scroll-node-into-view` | `{ id }` | Ao focar frame no canvas |
| `focus-node` | `{ id }` | Ao focar nó no canvas |
| `resize-ui` | `{ width, height }` | Ao redimensionar painel |
| `clear-cache` | — | Ao limpar cache do plugin |

### 8.2 Mensagens Backend → UI

| Tipo | Dados | Efeito |
|---|---|---|
| `init-plugin` | `{ version, theme, currentUser, projectName, savedState }` | Inicializa estado e UI |
| `scan-result` | `{ frameId, data: { components, icons, … } }` | Renderiza tokens |
| `measurements-applied` | `{ data: [medidas] }` | Adiciona medidas à lista |
| `spec-created` | `{ spec }` | Adiciona spec à lista e ao canvas |
| `flow-created` | `{ flow }` | Adiciona fluxo à lista |
| `handoff-complete` | `{ isUpdate, timestamp }` | Marca ficha como gerada |
| `context-name` | `{ name }` | Preenche campo Jornada/Feature |
| `selection-info` | `{ nodes: [{ nodeId, name }] }` | Registra frames |

---

## 9. Limites Técnicos

| Limite | Valor |
|---|---|
| Caracteres da tag de spec (letter) | 2 |
| Snapshots históricos por arquivo | 5 |
| Itens por seção de scan até exibir busca | 10 |
| Tokens listados por categoria na ficha | 10 (+ contagem de excedente) |
| Membros da equipe | Ilimitado |
| Frames documentados | Ilimitado |
| Specs por frame | Ilimitado |
| Medidas por frame | Ilimitado |
| Fluxos | Ilimitado |
| Exceções por spec | Ilimitado |

---

## 10. Glossário

| Termo | Definição |
|---|---|
| **Ficha Técnica** | Frame gerado no canvas do Figma com todos os dados do handoff |
| **Handoff** | Entrega completa de documentação de design: dados + frames + specs + fluxos + exportação |
| **Spec** | Anotação visual criada no canvas com propriedades técnicas, categoria e notas |
| **Exceção** | Cenário alternativo ou estado de erro documentado em uma spec (Erro · Sucesso · Alerta · Confirmação) |
| **Medida** | Dimensão (altura, largura, padding, gap) de um ou mais elementos do canvas |
| **Fluxo** | Conexão visual entre dois frames representando uma transição de tela ou decisão de navegação |
| **Token** | Elemento do Design System (cor, tipografia, espaçamento) identificado pelo scan |
| **Frame Hub** | Central de gerenciamento de frames documentados no plugin |
| **Conformidade DSC** | Declaração do designer de que o frame foi verificado com o Check Designs do Figma |
| **Jornada** | Nome da jornada de usuário à qual o frame pertence (ex: Onboarding, Checkout) |
| **Feature** | Nome da funcionalidade específica sendo documentada |
| **Schema v2** | Versão atual da estrutura de dados do plugin (`_schemaVersion: 2`) |
| **clientStorage** | API do Figma para persistência de dados por plugin e por arquivo |
| **Locking** | Bloqueio de edição de layers geradas pelo plugin — editáveis apenas pelo plugin |
| **Novo Componente** | Frame que introduz um componente inédito ao Design System |
| **Chip de status** | Indicador visual colorido do status da entrega na ficha gerada no canvas |
