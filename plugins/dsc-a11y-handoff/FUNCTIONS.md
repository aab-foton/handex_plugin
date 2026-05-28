# Mapa de Funções — DSC A11Y Handoff

Guia de navegação rápida. Números de linha referem-se ao estado atual do arquivo.

---

## code.ts (~2895 linhas)

### Variáveis globais (17–28)

| Linha | Variável | Descrição |
|-------|----------|-----------|
| 17 | `componentePrincipalAtivo` | Componente selecionado travado no contexto |
| 18 | `handoffAtivo` | Frame/instância do handoff travado |
| 19 | `variacoesContainerId` | ID do frame `[A11Y Variações]` no canvas |
| 20 | `pluginDataNodeId` | Cache do ID do nó `[dsc-h] Plugin Data A11y` |
| 22 | `tempTouchOverlayId` | ID do frame temporário de área de toque |
| 23 | `tempSROverlayId` | ID do frame temporário de área de leitor de tela |
| 24 | `tempSROverlayRefX/Y` | Posição do componente no momento de `create-sr-overlay` (referência para calcular relX/relY) |
| 26 | `componenteVariacaoAtivo` | Nó da variação de toque ativa no canvas |
| 27 | `componenteTabVariacaoAtivo` | Nó da variação de tabulação ativa |
| 28 | `componenteSRVariacaoAtivo` | Nó da variação de leitor de tela ativa |

### Utilitários (38–305)

| Linha | Função | Resumo |
|-------|--------|--------|
| 38 | `resolveDataNode(node)` | Sobe na hierarquia para encontrar `COMPONENT_SET` ou `COMPONENT` pai |
| 52 | `getCachedPluginDataNode()` | Retorna o `[dsc-h] Plugin Data A11y` do handoff ativo (com cache) |
| 64 | `getTouchDimensions(preset)` | Converte string de preset (`'aprimorado'` etc.) em `{ hStr, wStr }` |
| 72 | `updateText(node, value)` | Escreve em TextNode lidando com fontes mistas (`getRangeFontName` fallback) |
| 89 | `applyWcagBackground(imageFrame, comp, vars)` | Aplica cor de fundo com contraste WCAG calculado via variáveis Figma |
| 147 | `computeLetrasTS(conectores)` | Gera array de letras/números para labels de conectores de leitor de tela |
| 166 | `createComponentInstance(comp)` | Cria instância de COMPONENT/COMPONENT_SET com fallback para clone |
| 179 | `clearVariationMarkers(varFrame)` | Remove todos os filhos marcadores de um frame de variação |
| 187 | `drawVariationMarkers(varFrame, markers, color, type)` | Desenha overlays e marcadores numerados para toque/tab/SR |
| 242 | `getOrCreateVariacoesContainer(comp, handoff, parent)` | Garante existência do frame `[A11Y Variações]` no canvas |

### Handler principal — `figma.ui.onmessage` (311–2126)

| Linha | Mensagem | O que faz |
|-------|----------|-----------|
| 323 | `run-handoff` / `update-handoff` | **Ponto de entrada do Gerar/Atualizar Handoff** |
| 344 | *(isOldHandoff — swap)* | Detecta `keyboard maping` filho → clona seções desmarcadas (`oldSnapshots`) → `importComponentByKeyAsync` → substitui nó |
| 373 | *(oldSnapshots)* | Para cada seção com `flag===false`: clona frame do antigo, move para página, restaura no novo template após swap |
| 486 | *(restaura oldSnapshots)* | Insere clones nas posições corretas do novo template, remove seções vazias |
| 515 | *(Título)* | Preenche `Component Name` se `runTitulo !== false` |
| 525 | `fillTable` *(inline)* | Clona Row/`[dsc doc] Doc Table` com `Table Cell` para cada mapeamento; suporta 3 estruturas de template |
| 601 | *(Área de Toque — specs)* | Preenche frame `specs` de `target area` com todas as áreas achatadas de `msg.variacoes` |
| 662 | *(Área de Toque — visual)* | Preenche frame `image`, cria overlays e marcadores por variação; badge em cima do componente sem conector |
| 783 | *(Focus Order — visual)* | Preenche frame `focus order` com tab order por variação; badge em cima sem conector |
| 912 | *(Leitor de Tela — preview)* | Monta conectores/agrupamentos no frame `screen reader` por variação; reutiliza nós do handoff antigo para variações de migração |
| 1183 | *(Leitor de Tela — specs)* | Preenche tabela de specs do leitor de tela por variação |
| 1341 | *(Zoom WCAG)* | Aplica zoom e contraste WCAG no frame `zoom` |
| 1457 | *(limpeza pós-geração)* | Remove todos os frames `[A11Y Variação*]` e `[A11Y Variações]` do canvas em **varredura única** |
| 1550 | `create-touch-overlay` | Cria frame rosa sobre o componente; salva ID em `tempTouchOverlayId` |
| 1585 | `confirm-touch-area` | Lê dimensões/posição do frame via `getNodeByIdAsync`; envia `touch-area-confirmed` |
| 1605 | `cancel-touch-area` | Remove frame temporário via ID cacheado; limpa `tempTouchOverlayId` |
| 1627 | `get-component-properties` | Retorna propriedades do componente ativo para uso no form de variações |
| 1669 | `create-variation-frame` | Cria frame de variação de toque no canvas |
| 1728 | `activate-variation` | Foca a variação de toque no canvas |
| 1755 | `get-tab-selection` | Retorna nó selecionado para adicionar ao tab order |
| 1811 | `create-sr-variation-frame` | Cria frame de variação de leitor de tela |
| 1855 | `create-tab-variation-frame` | Cria frame de variação de tabulação |
| 1970 | `save-leitor-tela` | Salva conectores/variações de leitor de tela; usa `handoffAtivo` como fallback se `dbInstance` for null (handoff antigo) |
| 1990 | `import-old-section` | Chama o parser correto (`geral/toque/tabulacao/leitor`) e responde com `old-section-data` |
| 2015 | `save-partial-data` | Salva chave específica no `a11y-component-data`; usa `handoffAtivo` como fallback se `dbInstance` for null |
| 2032 | `get-sr-selection` | Retorna nó selecionado para leitor de tela |
| 2062 | `create-sr-overlay` | Cria overlay de área de leitor de tela; armazena `tempSROverlayRefX/Y` para cálculo correto de relX/relY |
| 2099 | `confirm-sr-area` | Confirma área de leitor de tela usando `tempSROverlayRefX/Y` como referência |

### Funções de suporte (2143–2275)

| Linha | Função | Resumo |
|-------|--------|--------|
| 2143 | `tentarTravarContexto(selection)` | Valida seleção (1 componente + 1 handoff); trava contexto; chama `carregarDadosEEnviarParaUI` |
| 2201 | `parseMasterList(dbInstance)` | Lê tabela `"Mapeamento de Teclado e Gestos do Plugin"` do nó data; retorna `{ mapeamento, descricao, utilizacao }[]` |
| 2236 | `parseRolesList(dbInstance)` | Lê tabela de roles/especificações ARIA do nó data |

### Parsers de migração (2276–2895)

| Linha | Função | Resumo |
|-------|--------|--------|
| 2276 | `parseOldSRData(handoff)` | Extrai dados de leitor de tela do handoff antigo → `{ variacoes[] }` |
| 2452 | `parseOldTabOrder(handoff)` | Extrai tab order do frame `focus order` → `{ variacoes: TabVariacao[] }` |
| 2547 | `toTouchPreset(h, w)` | Converte dimensões numéricas para string de preset de toque |
| 2555 | `parseOldTouchAreas(handoff)` | Extrai áreas de toque do frame `target area` → `{ variacoes: TouchVariacao[] }` |
| 2738 | `parseOldGeralData(handoff)` | Extrai plataformas, zoom e mapeamentos de teclado/gesto do handoff antigo |
| 2842 | `carregarDadosEEnviarParaUI(handoff)` | Detecta `isOldFormat`, carrega pluginData (para ambos os formatos), envia `setup-ui` para a UI |

---

## ui.html — Script (~3039 linhas)

### Variáveis globais principais

| Linha | Variável | Tipo / Descrição |
|-------|----------|-----------------|
| 701 | `masterList` | `{ mapeamento, descricao, utilizacao }[]` — lido do template via `setup-ui` |
| 701 | `currentData` | Mapeamentos selecionados para o componente atual |
| 701 | `touchData` | Áreas de toque da variação ativa |
| 1536 | `variationsData` | `Variacao[]` — variações de toque |
| 1537 | `tabVariationsData` | `TabVar[]` — variações de tabulação |
| 1538 | `isOldFormat` | `boolean` — handoff antigo detectado (banner só exibe se componentData estiver vazio) |
| 1539 | `srVariationsData` | `SRVar[]` — variações de leitor de tela |

### Funções principais

| Linha | Função | Resumo |
|-------|--------|--------|
| 730 | `setupSearch(inputId, resId, filterType)` | Registra listeners de busca; chamado **1× por tipo** fora do `onmessage` |
| 773 | `addItem(item)` | Adiciona mapeamento a `currentData`; sem duplicatas |
| 785 | `renderLists()` | Renderiza cards de teclado/gesto; atualiza badges |
| 820 | `updateSummaryCards()` | Atualiza contadores nos cards de resumo de todas as abas |
| 1497 | `updatePZCount()` | Atualiza badge de plataformas/zoom selecionados |
| 1541 | `openInfo() / closeInfo()` | Abre/fecha painel "Como usar" (infoOverlay) |
| 1548 | `reloadTemplateData()` | Força recarga do masterList do template (usado em sync) |
| 1573 | `renderTouchList()` | Renderiza lista de áreas de toque da variação ativa |
| 1592 | `removeTouchArea(i)` | Remove área de toque pelo índice |
| 1604 | `getTouchPreset()` | Deriva preset string de `touchSelectedSize × touchSelectedForma` |
| 1635 | `showView(viewId)` | Alterna entre views de variação e main view (toque) |
| 1641 | `openTabForm()` | Abre form de adição de foco de tabulação (overlay) |
| 1652 | `closeTabForm()` | Fecha form de tabulação |
| 1724 | `renderTabOrderList()` | Renderiza lista de tab order da variação ativa |
| 1774 | `showSRView(viewId)` | Alterna entre views de variação e main view (leitor de tela) |
| 1781 | `renderSRVariationList()` | Renderiza lista de variações de leitor de tela |
| 1953 | `editTabVariation(id)` | Carrega variação de tabulação; guarda defensiva garante `panel-tabulacao` ativo ao final |
| 2076 | `editVariation(id)` | Carrega variação de toque; guarda defensiva garante `panel-toque` ativo ao final |
| 1820 | `selectSRVariation(id)` | Carrega variação de leitor de tela; guarda defensiva garante `panel-leitor` ativo ao final |
| 2133 | `renderImportBanners()` | Exibe banner de migração; chamado apenas quando `isOldFormat && componentData vazio` |
| 2140 | `importAllSections(evt)` | Dispara `import-old-section` para cada seção; acumula resultados |
| 2153 | `saveGeralData(debounce)` | Envia `save-partial-data` para plataformas, zoom e mapeamentos |
| 2533 | `saveLeitorTela()` | Envia `save-leitor-tela` com conectores e variações de SR |

### Handlers de mensagem recebida (`window.onmessage`)

| Mensagem | Linha aprox. | O que faz |
|----------|-------------|-----------|
| `setup-ui` | ~930 | Popula masterList, roles, componentData; detecta `isOldFormat`; mostra banner só se dados vazios |
| `old-section-data` | ~994 | Recebe dados de migração por seção; mescla em variationsData/tabVariationsData/srVariationsData; chama `save-partial-data` |
| `feedback` | ~980 | Exibe mensagem de status na UI |
| `touch-area-confirmed` | ~1240 | Adiciona área confirmada ao touchData da variação ativa |
| `sr-area-confirmed` | ~1260 | Adiciona área de SR confirmada |
| `component-properties` | ~1290 | Preenche dropdowns de propriedades no form de variações |

---

## Chaves de componentes (biblioteca DSC)

| Componente | Tipo | Key |
|-----------|------|-----|
| `[dsc-h] Template Handoff` (set) | COMPONENT_SET | `b9dd10fb8aa3b49af1b37206fb2d32e44828618b` |
| `[dsc-h] Template Handoff` variant=Acessibility | COMPONENT | `4ebd8a017a86b29ca60427416ed4b76af05e4a67` |
| `[dsc-h] Template Handoff` variant=Design | COMPONENT | `b7edcc2f70402c3173bf36815867ea17e5cfdf26` |
