# DSC A11Y Handoff — Plugin Figma

Plugin para preencher templates de handoff de acessibilidade no Figma.
Branch atual: `migration-from-old-handoff`.

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `code.ts` | Lógica do plugin (sandbox Figma, ~2545 linhas) |
| `ui.html` | Interface (iframe sandboxado, ~2876 linhas) |
| `FUNCTIONS.md` | Mapa de funções e handlers com números de linha |
| `Makefile` | `push-github` / `push-gitlab` / `push-all` |

## Fluxo normal (template novo)

```
Seleção Figma (1 componente + 1 handoff)
  → tentarTravarContexto()
  → carregarDadosEEnviarParaUI()
      → parseMasterList()        ← lê tabela Figma (não pluginData)
      → postMessage('setup-ui', isOldFormat=false)
  → UI: renderLists() + dropdowns prontos
  → Usuário clica "Atualizar Handoff"
  → run-handoff: detach → fillTable → salva a11y-component-data
```

## Fluxo de migração (handoff antigo)

```
Seleção com handoff antigo (tem filho 'keyboard maping/mapping')
  → carregarDadosEEnviarParaUI() envia isOldFormat=true
  → UI: exibe banner "Handoff Antigo Detectado"
  → Usuário clica "Importar Tudo"
      → import-old-section para cada seção (geral, toque, tabulacao, leitor)
      → parseOldGeralData / parseOldTouchAreas / parseOldTabOrder / parseOldSRData
      → UI preenche formulário com dados migrados
  → Usuário clica "Atualizar Handoff"
  → run-handoff detecta isOldHandoff → swap do template:
      → importComponentByKeyAsync('4ebd8a017a86b29ca60427416ed4b76af05e4a67')  ← variant=Acessibility
      → createInstance() posicionada onde o antigo estava
      → transfere pluginData, deleta o antigo
      → continua fluxo normal (detach → fillTable)
```

## Fonte do masterList

Tabela Figma `"Mapeamento de Teclado e Gestos do Plugin"` dentro do nó
`[dsc-h] Plugin Data A11y` (oculto, bloqueado) no template.
Colunas em ordem: `mapeamento` → `descricao` → `utilizacao` (`"teclado"` ou `"gesto"`).

## Regras de seleção

- **Handoff**: nome contém `[dsc-h] Template Handoff` ou começa com `[dsc] A11Y Handoff:`
- **Componente**: `COMPONENT | COMPONENT_SET | INSTANCE | FRAME` que não seja o handoff
- Precisa exatamente **1 de cada**

## Estrutura interna do template (novo)

```
keyboard maping
  └── table
      ├── [dsc doc] Doc Table  →  2× [dsc] Table Header  ← cabeçalho (preservar)
      └── [dsc doc] Doc Table  →  2× [dsc] Table Cell    ← modelo de linha (clonar)
```

No template fresco (colocado manualmente pelo designer), `table` pode ter `Header` e `Row` direto. `fillTable` suporta ambas as estruturas.

## Persistência

- Chave: `a11y-component-data` no pluginData do nó `[dsc-h] Plugin Data A11y`
- Estrutura completa:
```ts
{
  plataformas: string[],
  zoom: string[],
  mapeamentos: { mapeamento, descricao, utilizacao }[],
  areas_toque: TouchAreaItem[],   // legado — sem variações
  sem_toque: boolean,
  variacoes: Variacao[],          // variações de toque (novo)
  variacoes_tabulacao: TabVar[],
  variacoes_leitor: SRVar[],
  conectores_leitor: any[],
  sem_leitor: boolean
}
```
- `TouchAreaItem`: `{ nome, preset, width, height, relX, relY }`
- `Variacao`: `{ id, nome, propriedades, areas_toque, sem_toque, frameNodeId, instanceNodeId }`
- `TabVar`: `{ id, nome, propriedades, tab_order, sem_tabulacao, frameNodeId, instanceNodeId }`

## Convenções

- `setupSearch()` é chamado **uma única vez** fora do `onmessage` (evita acúmulo de listeners)
- Ao preencher tabela do template: remove `(unitário)` e `(em sequência)` do campo mapeamento
- Ao gerar handoff: `detachInstance()` se o nó for `INSTANCE` antes de `appendChild`
- `figma.getNodeByIdAsync(id)` (async) — `getNodeById` síncrono falha no modo `dynamic-page`
- Template antigo detectado por: filho com nome `'keyboard maping'` ou `'keyboard mapping'`
