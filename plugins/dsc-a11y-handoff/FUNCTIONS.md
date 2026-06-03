# Mapa de Funções — DSC A11Y Handoff

Guia de navegação rápida. Números de linha referem-se ao estado atual do arquivo.

---

## code.ts (~2965 linhas)

### Variáveis globais (17–29)

| Linha | Variável | Descrição |
|-------|----------|-----------|
| 17 | `componentePrincipalAtivo` | Componente selecionado travado no contexto |
| 18 | `handoffAtivo` | Frame/instância do handoff travado |
| 19 | `variacoesContainerId` | ID do frame `[A11Y Variações]` no canvas |
| 20 | `pluginDataNodeId` | Cache do ID do nó `[dsc-h] Plugin Data A11y` |
| 22 | `tempTouchOverlayId` | ID do overlay de área de toque ativo (dentro do imageFrame) |
| 23 | `tempSROverlayId` | ID do frame temporário de área de leitor de tela |
| 24 | `tempSROverlayRefX/Y` | Posição do componente no momento de `create-sr-overlay` (referência para calcular relX/relY) |
| 26 | `componenteVariacaoAtivo` | Nó da variação de toque ativa no canvas |
| 27 | `componenteTabVariacaoAtivo` | Nó da variação de tabulação ativa |
| 28 | `componenteSRVariacaoAtivo` | Nó da variação de leitor de tela ativa |
| 29 | `isHandoffGenerated` | `boolean` — true após o primeiro `run-handoff` bem-sucedido na sessão |

### Utilitários (39–354)

| Linha | Função | Resumo |
|-------|--------|--------|
| 39 | `resolveDataNode(node)` | Sobe na hierarquia para encontrar `COMPONENT_SET` ou `COMPONENT` pai |
| 53 | `getCachedPluginDataNode()` | Retorna o `[dsc-h] Plugin Data A11y` do handoff ativo (com cache) |
| 65 | `getTouchDimensions(preset)` | Converte string de preset (`'aprimorado'` etc.) em `{ hStr, wStr }` |
| 73 | `updateText(node, value)` | Escreve em TextNode lidando com fontes mistas (`getRangeFontName` fallback) |
| 90 | `applyWcagBackground(imageFrame, comp, vars)` | Aplica cor de fundo com contraste WCAG calculado via variáveis Figma |
| 148 | `computeLetrasTS(conectores)` | Gera array de letras/números para labels de conectores de leitor de tela |
| 167 | `createComponentInstance(comp)` | Cria instância de COMPONENT/COMPONENT_SET com fallback para clone |
| 190 | `ensureHandoffDetached()` | Detacha `handoffAtivo` se for INSTANCE; renomeia; atualiza a variável global |
| 199 | `getTouchImageFrame()` | Encontra o frame `image` (target area) no handoff; detacha se necessário |
| 212 | `clearVariationMarkers(varFrame)` | Remove todos os filhos marcadores de um frame de variação |
| 220 | `drawVariationMarkers(varFrame, markers, color, type)` | Desenha overlays e marcadores numerados para toque/tab/SR |
| 275 | `getOrCreateVariacoesContainer(comp, handoff, parent)` | Garante existência do frame `[A11Y Variações]` no canvas |

### Handler principal — `figma.ui.onmessage` (311–2208)

| Linha | Mensagem | O que faz |
|-------|----------|-----------|
| 356 | `run-handoff` / `update-handoff` | **Ponto de entrada do Gerar/Atualizar Handoff** |
| 378 | *(isOldHandoff)* | Detecta handoff antigo pelo **nome** (`startsWith('[dsc] A11Y Handoff:')`) — não usa `findOne` |
| 391 | *(swap antigo→novo)* | Clona seções desmarcadas (`oldSnapshots`) → `importComponentByKeyAsync` → substitui nó |
| 512 | *(restaura oldSnapshots)* | Insere clones nas posições corretas do novo template, remove seções vazias |
| 541 | *(Título)* | Preenche `Component Name` se `runTitulo !== false` |
| 551 | `fillTable` *(inline)* | Clona Row/`[dsc doc] Doc Table` com `Table Cell` para cada mapeamento; suporta 3 estruturas de template |
| 628 | *(Área de Toque — specs)* | Preenche frame `specs` de `target area` com todas as áreas achatadas de `msg.variacoes`; numeração global (`i + 1`) |
| 688 | *(Área de Toque — visual/preview)* | Oculta modelos, aplica WCAG, renumera badges globalmente, redimensiona imageFrame pelas instâncias presentes |
| 751 | *(Focus Order — visual)* | Preenche frame `focus order` com tab order por variação; badge em cima sem conector |
| 884 | *(Leitor de Tela — preview)* | Monta conectores/agrupamentos no frame `screen reader` por variação |
| 1149 | *(Leitor de Tela — specs)* | Preenche tabela de specs do leitor de tela por variação |
| 1313 | *(Zoom WCAG)* | Aplica zoom e contraste WCAG no frame `zoom` |
| 1410 | *(limpeza pós-geração)* | Remove frames `[A11Y Tab Variação*]`, `[A11Y LT Variação*]` e `[A11Y Variações]` do canvas (toque fica no imageFrame) |
| 1511 | `create-touch-overlay` | Cria overlay (`[dsc-h] Handoff areas`) + badge (`[dsc-h] Item Number`) DENTRO do imageFrame; índice global entre todas as variações; idempotente por variationId |
| 1598 | `confirm-touch-area` | Lê posição/dimensão do overlay no imageFrame + `componentProperties` do badge (conector); envia `touch-area-confirmed` com `badgeProps` |
| 1637 | `cancel-touch-area` | Remove overlay + badge do imageFrame pelo `tempTouchOverlayId` e index |
| 1657 | `remove-touch-overlay` | Remove overlay + badge do imageFrame por `variationId + nome` |
| 1671 | `highlight-touch-area` | Seleciona e zoom no overlay do imageFrame por `variationId + nome` |
| 1683 | `get-component-properties` | Retorna propriedades do componente ativo para uso no form de variações |
| 1725 | `create-variation-frame` | Cria instância da variação DENTRO do imageFrame; posição acumulada; idempotente |
| 1799 | `activate-variation` | Seleciona + zoom na instância da variação no imageFrame |
| 1807 | `deactivate-variation` | Zera `componenteVariacaoAtivo` |
| 1811 | `get-tab-selection` | Retorna nó selecionado para adicionar ao tab order |
| 1858 | `delete-variation-frame` | Remove instância por `instanceNodeId` + overlays/badges por `variationId` do imageFrame |
| 1878 | `create-sr-variation-frame` | Cria frame de variação de leitor de tela |
| 1922 | `create-tab-variation-frame` | Cria frame de variação de tabulação |
| 1968 | `activate-tab-variation` | Foca variação de tabulação no canvas |
| 1994 | `delete-tab-variation-frame` | Remove frame de tabulação |
| 2037 | `save-leitor-tela` | Salva conectores/variações de leitor de tela; usa `handoffAtivo` como fallback |
| 2057 | `import-old-section` | Chama o parser correto e responde com `old-section-data` |
| 2082 | `save-partial-data` | Salva chave específica no `a11y-component-data` |
| 2099 | `get-sr-selection` | Retorna nó selecionado para leitor de tela |
| 2129 | `create-sr-overlay` | Cria overlay de área de leitor de tela; armazena `tempSROverlayRefX/Y` |
| 2166 | `confirm-sr-area` | Confirma área de leitor de tela usando `tempSROverlayRefX/Y` como referência |

### Funções de suporte (2210–2341)

| Linha | Função | Resumo |
|-------|--------|--------|
| 2210 | `tentarTravarContexto(selection)` | Valida seleção (1 componente + 1 handoff); trava contexto; chama `carregarDadosEEnviarParaUI` |
| 2268 | `parseMasterList(dbInstance)` | Lê tabela `"Mapeamento de Teclado e Gestos do Plugin"` do nó data; retorna `{ mapeamento, descricao, utilizacao }[]` |
| 2303 | `parseRolesList(dbInstance)` | Lê tabela de roles/especificações ARIA do nó data |

### Parsers de migração (2343–2965)

| Linha | Função | Resumo |
|-------|--------|--------|
| 2343 | `parseOldSRData(handoff)` | Extrai dados de leitor de tela do handoff antigo → `{ variacoes[] }` |
| 2519 | `parseOldTabOrder(handoff)` | Extrai tab order do frame `focus order` → `{ variacoes: TabVariacao[] }` |
| 2614 | `toTouchPreset(h, w)` | Converte dimensões numéricas para string de preset de toque |
| 2622 | `parseOldTouchAreas(handoff)` | Extrai áreas de toque do frame `target area` → `{ variacoes: TouchVariacao[] }` |
| 2805 | `parseOldGeralData(handoff)` | Extrai plataformas, zoom e mapeamentos de teclado/gesto do handoff antigo |
| 2909 | `carregarDadosEEnviarParaUI(handoff)` | Detecta `isOldFormat`, carrega pluginData (para ambos os formatos), envia `setup-ui` para a UI |

---

## ui.html — Script (~3077 linhas)

### Variáveis globais principais

| Linha | Variável | Tipo / Descrição |
|-------|----------|-----------------|
| 701 | `masterList` | `{ mapeamento, descricao, utilizacao }[]` — lido do template via `setup-ui` |
| 701 | `currentData` | Mapeamentos selecionados para o componente atual |
| 701 | `touchData` | Áreas de toque da variação ativa (`TouchAreaItem[]` com `badgeProps` opcional) |
| 1570 | `variationsData` | `Variacao[]` — variações de toque (inclui sempre a `'default'`) |
| 1571 | `tabVariationsData` | `TabVar[]` — variações de tabulação |
| 1572 | `isOldFormat` | `boolean` — handoff antigo detectado |
| 1573 | `srVariationsData` | `SRVar[]` — variações de leitor de tela |
| 1581 | `currentVariationId` | `string | null` — variação de toque ativa (`'default'` ou UUID) |

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
| 1675 | `openTabForm()` | Abre form de adição de foco de tabulação (overlay) |
| 1686 | `closeTabForm()` | Fecha form de tabulação; zera `tabFormPendingSave` |
| 1693 | `saveTabForm()` | Salva itens do form: se 'selection' → `get-tab-selection`; se 'component' → push + `saveTouchTabData()` + `activate-tab-variation` |
| 1721 | `selectTabFormType(type)` | Seleciona tipo 'selection' ou 'component'; 'component' aciona `get-component-as-tab` imediatamente |
| 1757 | `renderTabOrderList()` | Renderiza lista de tab order da variação ativa |
| 1774 | `showSRView(viewId)` | Alterna entre views de variação e main view (leitor de tela) |
| 1781 | `renderSRVariationList()` | Renderiza lista de variações de leitor de tela |
| 1953 | `editTabVariation(id)` | Carrega variação de tabulação |
| 2076 | `editVariation(id)` | Carrega variação de toque; sincroniza `touchData` com a variação ativa |
| 1820 | `selectSRVariation(id)` | Carrega variação de leitor de tela |
| 2133 | `renderImportBanners()` | Exibe banner de migração (apenas se `isOldFormat && componentData vazio`) |
| 2140 | `importAllSections(evt)` | Dispara `import-old-section` para cada seção |
| 2153 | `saveGeralData(debounce)` | Envia `save-partial-data` para plataformas, zoom e mapeamentos |
| 2161 | `saveTouchTabData()` | Envia `save-partial-data` para `variacoes` e `variacoes_tabulacao` |
| 2533 | `saveLeitorTela()` | Envia `save-leitor-tela` com conectores e variações de SR |

### Handlers de mensagem recebida (`window.onmessage`)

| Mensagem | Linha aprox. | O que faz |
|----------|-------------|-----------|
| `setup-ui` | ~930 | Popula masterList, roles, componentData; detecta `isOldFormat` |
| `old-section-data` | ~1083 | Recebe dados de migração por seção; mescla em variationsData/tabVariationsData/srVariationsData |
| `feedback` | ~980 | Exibe mensagem de status na UI |
| `touch-area-confirmed` | ~1246 | Adiciona nova área ao `touchData`; salva `badgeProps` (conector) se disponível; persiste na variação ativa |
| `sr-area-confirmed` | ~1278 | Adiciona área de SR confirmada |
| `component-properties` | ~1290 | Preenche dropdowns de propriedades no form de variações |

### run-handoff — sincronização antes de enviar

Antes de enviar `run-handoff` (~linha 2461), o código sincroniza:
1. `touchData` → `variationsData[currentVariationId || 'default'].areas_toque` (garante que áreas da variação ativa chegam no payload mesmo se `currentVariationId === null`)
2. `tabOrderData` → `tabVariationsData[currentTabVariationId]` (existia antes)

---

## Chaves de componentes (biblioteca DSC)

| Componente | Tipo | Key |
|-----------|------|-----|
| `[dsc-h] Template Handoff` (set) | COMPONENT_SET | `b9dd10fb8aa3b49af1b37206fb2d32e44828618b` |
| `[dsc-h] Template Handoff` variant=Acessibility | COMPONENT | `4ebd8a017a86b29ca60427416ed4b76af05e4a67` |
| `[dsc-h] Template Handoff` variant=Design | COMPONENT | `b7edcc2f70402c3173bf36815867ea17e5cfdf26` |
