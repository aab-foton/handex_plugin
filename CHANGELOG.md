# CHANGELOG — HANDEX Plugin

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
