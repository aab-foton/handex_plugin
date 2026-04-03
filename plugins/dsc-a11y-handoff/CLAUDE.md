# DSC A11Y Handoff — Plugin Figma

Plugin para preencher templates de handoff de acessibilidade no Figma.
Branch ativa: `new-a11y-plugin`. Reescrita completa iniciada em 2026-03-31.

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `code.ts` | Lógica do plugin (sandbox Figma, ~414 linhas) |
| `ui.html` | Interface (iframe sandboxado, ~710 linhas) |
| `FUNCTIONS.md` | Mapa detalhado de todas as funções |
| `Makefile` | `push-github` / `push-gitlab` / `push-all` |

## Fluxo de dados

```
Seleção Figma (1 componente + 1 handoff)
  → tentarTravarContexto()
  → carregarDadosEEnviarParaUI()
      → parseMasterList()        ← lê tabela Figma (não pluginData)
      → postMessage('setup-ui')
  → UI: renderLists() + dropdowns prontos
  → Usuário clica "Gerar Handoff"
  → run-handoff: detach → fillTable → salva a11y-component-data
```

## Fonte do masterList

Tabela Figma `"Mapeamento de Teclado e Gestos do Plugin"` dentro do nó
`[dsc-h] Plugin Data A11y` (oculto, bloqueado) no template.
Colunas em ordem: `mapeamento` → `descricao` → `utilizacao` (`"teclado"` ou `"gesto"`).

## Regras de seleção

- **Handoff**: nome contém `[dsc-h] Template Handoff` ou começa com `[dsc] A11Y Handoff:`
- **Componente**: `COMPONENT | COMPONENT_SET | INSTANCE | FRAME` que não seja o handoff
- Precisa exatamente **1 de cada**

## Persistência

- Chave: `a11y-component-data` no pluginData do `[dsc-h] Plugin Data A11y`
- Estrutura: `{ plataformas, zoom, mapeamentos, areas_toque, sem_toque }`
- `areas_toque`: `{ nome, preset, width, height, relX, relY }[]`
- `sem_toque`: `boolean` — quando true, oculta o botão Adicionar e limpa a lista

## Convenções

- `setupSearch()` é chamado **uma única vez** fora do `onmessage` (evita acúmulo de listeners)
- Ao preencher tabela do template: remove `(unitário)` e `(em sequência)` do campo mapeamento
- Ao gerar handoff: `detachInstance()` se o nó for `INSTANCE` antes de `appendChild`
