# Mapa de Funções — DSC A11Y Handoff

> Referência rápida para localizar e editar funções no plugin.

---

## code.ts

| Linha | Função | Descrição |
|-------|--------|-----------|
| 13 | `updateText(node, value)` | Atualiza TextNode lidando com fontes mistas (`getRangeFontName` fallback para o primeiro caractere) |
| 30 | `parseMasterList(dbInstance)` | Lê a tabela `"Mapeamento de Teclado e Gestos do Plugin"` dentro do `[dsc-h] Plugin Data A11y`; retorna `{ mapeamento, descricao, utilizacao }[]`; pula cabeçalho e linhas com menos de 3 textos |
| 62 | `carregarDadosEEnviarParaUI(handoff)` | Encontra `dbInstance`, chama `parseMasterList`, lê `a11y-component-data` do pluginData, envia `setup-ui` para a UI |
| 139 | `tentarTravarContexto(selection)` | Valida seleção (exatamente 1 componente + 1 handoff); trava `contextoTravado`; chama `carregarDadosEEnviarParaUI` |
| 71 | `fillTable(container, data)` (inline em `run-handoff`) | Dentro do container `"keyboard maping"`, clona a linha `"Row"` para cada item de data, preenche os 2 primeiros TextNodes, deleta o Row original |

### Handlers globais

| Handler | Mensagens tratadas |
|---------|--------------------|
| `figma.ui.onmessage` | `load-initial-data` — verifica seleção inicial  `run-handoff` / `update-handoff` — gera/atualiza handoff |
| `figma.on('selectionchange')` | Chama `tentarTravarContexto` enquanto contexto não está travado |

---

## ui.html — Script

| Função | Descrição |
|--------|-----------|
| `setupSearch(inputId, resId, type)` | Registra `click` e `input` no campo de busca e `click` no document para fechar. Chamado **uma única vez** na inicialização (fora do `onmessage`). `type` = `'teclado'` ou `'gesto'` |
| `openMenu()` *(closure)* | Filtra `masterList` por `utilizacao.includes(type)` + texto digitado; renderiza itens; posiciona dropdown acima ou abaixo conforme espaço disponível |
| `addItem(item)` | Adiciona item a `currentData` (sem duplicatas), limpa inputs, fecha dropdowns, chama `renderLists` |
| `removeItem(mapeamento)` | Remove item de `currentData` por `mapeamento`, chama `renderLists` |
| `renderLists()` | Separa `currentData` em teclado / gesto; renderiza cards; atualiza badges `tBadge` e `gBadge` |
| `updatePZCount()` | Conta checkboxes marcados e atualiza badge `pzCount` |

### Variáveis globais (ui.html)

| Variável | Descrição |
|----------|-----------|
| `masterList` | Todos os mapeamentos lidos do template via `setup-ui` |
| `currentData` | Mapeamentos selecionados para o componente atual |

---

## Fonte de dados — masterList

A lista de teclas e gestos vem de uma **tabela Figma**, não de pluginData:

- Nó: `[dsc-h] Plugin Data A11y` (instância oculta dentro do template)
- Tabela: `"Mapeamento de Teclado e Gestos do Plugin"`
- Colunas (textos em ordem por linha): `mapeamento` → `descricao` → `utilizacao`
- `utilizacao` contém `"teclado"` ou `"gesto"` (case-insensitive)

---

## Persistência de dados do componente

- **Nó alvo**: `[dsc-h] Plugin Data A11y` dentro do handoff
- **Chave**: `a11y-component-data`
- **Estrutura**: `{ plataformas: string[], zoom: string[], mapeamentos: { mapeamento, descricao, utilizacao }[] }`

---

## Regras de seleção

Para travar o contexto o usuário precisa selecionar **exatamente**:

| Tipo | Critério |
|------|----------|
| Handoff | Nome contém `[dsc-h] Template Handoff` **ou** começa com `[dsc] A11Y Handoff:` |
| Componente | Tipo `COMPONENT \| COMPONENT_SET \| INSTANCE \| FRAME` que não seja o handoff |
