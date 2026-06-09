# CHANGELOG — HANDEX Plugin

---

## v4.1.1 — 2026-06-09

### Resumo
Correções de bugs de backend, melhorias de UX consistentes em todas as views, arquivamento de funcionalidades fora de escopo e limpeza geral do código-fonte.

---

### Correções de Backend (`code.js`)

| Bug | Causa | Correção |
|---|---|---|
| `MIN is no longer a supported value for layoutAlign` (~30 avisos) | 6 ocorrências de `layoutAlign = "MIN"` em `code.js` | Substituídas por `"INHERIT"` (valor correto na API atual do Figma) |
| `set_selection: The selection of a page can only include nodes in that page` | `figma.currentPage.selection = [node]` chamado com nó de outra página | Adicionada função `_nodeOnCurrentPage()` e guard nos handlers `scroll-node-into-view` e `focus-node` |
| `localStorage SecurityError` repetido | `localStorage.getItem/setItem` chamado em contexto `data:` URL | Todos os acessos em `messages.js` e `core.js` envolvidos em `try/catch` |

---

### "Ocultar todas as medidas" não funcionava com medidas por frame

- `_getAllMeasurements()` agora agrega `handoffData.measurements` global + medidas de todos os `handoffData.frames[]`
- `updateHideAllMeasuresButtonState` e `toggleAllMeasuresVisibility` atualizados para usar a função agregada

---

### Canvas — Geração da Ficha Técnica

- **Nome do frame sempre inclui data** — formato: `Handex | Ficha de Projeto | {Título} | {Data}`
- **Locking automático** — todos os nós gerados pelo plugin (specs, medidas, fluxos, ficha) são criados com `node.locked = true`
- **Chip de status com semântica de cor:**
  - `rascunho` → cinza
  - `em-revisao` → amarelo
  - `pronto-para-dev` → azul
  - `finalizado` → verde
- **Tokens escaneados** — ficha e exportação MD/HTML agora listam os nomes reais dos tokens por categoria (até 10 + contagem de excedente), em vez de exibir apenas "sim/não"
- **Tags de categoria no HTML** — estilo `cursor:default; pointer-events:none` para não parecerem botões clicáveis
- **Specs do canvas** agregam specs de todos os frames (`frames[].components`), não apenas `step2.specs`

---

### Exceções — Injetar observação no frame de spec

- `exc.obs` agora exibido na UI do plugin (texto itálico abaixo do título da exceção)
- Novo checkbox **"Injetar observação no frame de especificação"** na modal de exceção
  - Visível apenas quando obs está preenchida e a exceção tem `nodeId` de spec
  - Ao confirmar, envia `inject-obs-to-spec` que cria um frame `[Obs]` no canvas abaixo do frame de spec correspondente

---

### UX — Espaçamento e Tipografia

- **Header das views** — padding ajustado para `pt-0 pb-3`: sem espaço acima do título, 12 px de respiro abaixo
- **Conteúdo das views** — top padding reduzido de `p-4` para `pt-1 px-4 pb-4`
- **Fontes padronizadas** em todas as views:
  - Views simples: `font-bold text-[18px]`
  - Views com subtítulo (Handoff, Conformidade DSC, Laboratório): `font-bold text-[16px]`
- **"CONFIGURAÇÃO"** — label desnecessária removida da view Informações do Projeto
- **Jornada / Feature** — descrição movida para linha separada abaixo do checkbox (era inline à direita, cortava o texto)
- **Hint `?` de Especificações** — agora abre o guia completo diretamente (`openHelp()`), sem popover intermediário
- **Hint de layers bloqueadas** (Como Usar) — movido para o final do card; descrição atualizada: "Para remover ou recriar um item, utilize os botões de exclusão dentro do próprio plugin."

---

### Performance

- `snapshot-load` e `scan-cache-load` removidos do handler `init-plugin` — carregamento diferido elimina lentidão na abertura do plugin

---

### Arquivamento de funcionalidades fora de escopo

Movidos para `src/plugin/_unused/` (código preservado, fora do bundle):

| Arquivo | Funcionalidade |
|---|---|
| `views/lab.html` | Laboratório de Design |
| `views/audit.html` | Conformidade DSC |
| `modules/lab.js` | Lógica do Laboratório |
| `modules/audit.js` | Lógica de Auditoria (UI) |

- Referências removidas de `build.cjs` e `modules/core.js`
- Bundle reduzido de ~1471 KB para ~1442 KB (−29 KB)

---

### Arquivos Modificados

| Arquivo | Tipo de mudança |
|---|---|
| `src/plugin/code.js` | Fix `layoutAlign "MIN"`, guard cross-page selection, `_nodeOnCurrentPage()` |
| `src/plugin/modules/core.js` | Fix `localStorage`, remove `navigateToAudit` |
| `src/plugin/modules/messages.js` | Fix `localStorage` em `applyFigmaTheme` |
| `src/plugin/modules/measurement.js` | `_getAllMeasurements()` agrega medidas por frame |
| `src/plugin/modules/specifications.js` | Exibe `exc.obs`, checkbox injetar obs |
| `src/plugin/modules/handoff.js` | Tokens com nomes reais, tags não-clicáveis |
| `src/plugin/build.cjs` | Remove lab/audit do bundle |
| `src/plugin/views/specifications.html` | Hint `?` abre guia direto |
| `src/plugin/views/dados-projeto.html` | Remove label "Configuração", descrição jornada/feature em linha separada |
| `src/plugin/views/guide.html` | Hint de layers no final, descrição atualizada |
| `src/plugin/views/*.html` (todas) | Padding de header e fontes padronizados |
| `src/plugin/_unused/` | Lab e Audit arquivados |

---

## v4.0.0-beta — 2026-06-02

### Resumo
Refatoração arquitetural completa: eliminação do wizard linear de 5 etapas e introdução de ferramentas independentes acessíveis diretamente pela home. Novo schema de dados (`_schemaVersion: 2`), novos campos de contexto e melhorias de acessibilidade em todo o plugin.

---

### Nova Arquitetura — Home com cards independentes

- **Antes:** fluxo linear obrigatório de 5 etapas (wizard)
- **Agora:** home com 6 cards de ferramentas independentes
  - Como usar o plugin
  - Informações do Projeto
  - Escanear Tokens
  - Anotar Specs
  - Anotar Medidas
  - Fluxos de Tela
- Botão "Gerar Ficha de Handoff" fixo na home, sempre acessível
- Importar JSON mantido como ação utilitária no rodapé

---

### Novas Views

| View | Descrição |
|---|---|
| `view-frames` | Hub por Frame — scan de tokens, medidas, specs e conformidade por frame |
| `view-flows` | Fluxos de navegação extraídos como view standalone |
| `view-dados-projeto` | Informações do projeto acessíveis a qualquer momento |
| `view-handoff-summary` | Resumo e exportação do handoff |

---

### Novos Campos — Jornada e Feature

- Campos `jornada` e `feature` adicionados ao schema (`handoffData.step1`)
- Propagados para **todos** os formatos de exportação:
  - Ficha no canvas (Figma)
  - Exportação Markdown (.md)
  - Exportação JSON
  - Exportação HTML interativa

---

### Correções de Bug

| Bug | Causa | Correção |
|---|---|---|
| Scan de tokens, medidas e specs parou de funcionar | `_lucideTimer` em TDZ — declaração `let` após chamada síncrona em `core.js` | Movido `_lucideTimer` + `_refreshIcons` para o topo do arquivo |
| Cards de tipo de fluxo não respondiam ao clique | `selectFlowType()` usava classes Tailwind CDN não compiladas (`bg-blue-50/30`) | Reescrito com `el.style.*` inline |
| `confirmDecisionConnection is not defined` | Função referenciada no HTML do modal mas nunca definida | Adicionada em `specifications.js` |
| Duas barras de rolagem na home | Wrapper externo e `view-home` ambos com `overflow-y-auto` | Wrapper alterado para `overflow-hidden` |

---

### Acessibilidade (WCAG 2.1 AA)

- `text-slate-400` (#94a3b8 — ratio 2.85:1 ❌) substituído por `text-slate-500` (#64748b — ratio 5.91:1 ✅) em todos os 205 pontos dos arquivos fonte
- `dark-muted` ajustado de `#94a3b8` para `#b4c6d8` — passa de ~4.2:1 para ~6.5:1 sobre `dark-surface`

---

### Performance

- **Onboarding removido** — modal de 3 slides com `lucide.createIcons()` disparado no `window.load` causava lentidão perceptível na abertura do plugin
- `_refreshIcons` com debounce de 30ms — evita múltiplas chamadas a `lucide.createIcons()` durante renderizações em sequência

---

### UI / UX

- Headers de todas as views de ferramentas compactados (`pt-5/6 pb-4` → `pt-3 pb-3`)
- `mb-6` e `mb-4` extras removidos de measurement e specifications
- Home ajustada para caber sem scroll na janela padrão do Figma (~500px)
- Laboratório de Design removido da home
- Subtítulo da home atualizado para comunicar o propósito do plugin

---

### Schema v2

```js
handoffData = {
  _schemaVersion: 2,
  step1: {
    titulo: '',
    versao: 'v1.0',
    objetivo: '',
    status: 'rascunho',
    jornada: '',       // NOVO
    feature: '',       // NOVO
    equipe: []
  },
  step2: { ... },
  frames: [],
  createdFlows: [],
  nextFlowNumber: 1
}
```

Estados salvos com schema anterior (`_schemaVersion` ausente) são descartados automaticamente no init.

---

### Arquivos Modificados

| Arquivo | Tipo de mudança |
|---|---|
| `src/plugin/modules/core.js` | Fix TDZ, schema v2, campos jornada/feature, restoreUIFromState |
| `src/plugin/modules/handoff.js` | collectHandoffData com jornada/feature, HTML interativo atualizado |
| `src/plugin/modules/specifications.js` | selectFlowType reescrito, confirmDecisionConnection adicionado |
| `src/plugin/modules/messages.js` | Detecção de schema antigo |
| `src/plugin/modules/measurement.js` | Ajustes de UI |
| `src/plugin/modules/audit.js` | Ajustes de contraste |
| `src/plugin/code.js` | Ficha canvas com jornada/feature |
| `src/plugin/build.cjs` | dark-muted corrigido, wrapper overflow-hidden |
| `src/plugin/views/home.html` | Nova grade, nomes de ferramentas, textos revisados |
| `src/plugin/views/handoff.html` | Hub por Frame |
| `src/plugin/views/flows.html` | Nova view standalone |
| `src/plugin/views/dados-projeto.html` | Campos jornada/feature adicionados |
| `src/plugin/views/handoff-summary.html` | Linhas jornada/feature condicionais |
| `src/plugin/views/modals.html` | Onboarding removido |
| `src/plugin/views/measurement.html` | Header compactado |
| `src/plugin/views/specifications.html` | Header compactado |
| `src/plugin/views/audit.html` | Header compactado |

---

*Gerado em 2026-06-02*
