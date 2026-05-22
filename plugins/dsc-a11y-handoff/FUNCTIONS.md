# Mapa de Funções — DSC A11Y Handoff

Guia de navegação rápida. Números de linha referem-se ao estado atual do arquivo.

---

## code.ts (~2545 linhas)

### Utilitários (1–280)

| Linha | Função | Resumo |
|-------|--------|--------|
| 36 | `resolveDataNode(node)` | Sobe na hierarquia para encontrar `COMPONENT_SET` ou `COMPONENT` pai |
| 50 | `getCachedPluginDataNode()` | Retorna o `[dsc-h] Plugin Data A11y` do handoff ativo (com cache) |
| 62 | `getTouchDimensions(preset)` | Converte string de preset (`'aprimorado'` etc.) em `{ hStr, wStr }` |
| 70 | `updateText(node, value)` | Escreve em TextNode lidando com fontes mistas (`getRangeFontName` fallback) |
| 87 | `applyWcagBackground(imageFrame, comp, vars)` | Aplica cor de fundo com contraste WCAG calculado via variáveis Figma |
| 119 | `computeLetrasTS(conectores)` | Gera array de letras/números para labels de conectores de leitor de tela |
| 138 | `createComponentInstance(comp)` | Cria instância de COMPONENT/COMPONENT_SET com fallback para clone |
| 151 | `clearVariationMarkers(varFrame)` | Remove todos os filhos marcadores de um frame de variação |
| 159 | `drawVariationMarkers(varFrame, markers, color, type)` | Desenha overlays e marcadores numerados para toque/tab/SR |
| 214 | `getOrCreateVariacoesContainer(comp, handoff, parent)` | Garante existência do frame `[A11Y Variações]` no canvas |

### Handler principal — `figma.ui.onmessage` (295–1871)

| Linha | Mensagem | O que faz |
|-------|----------|-----------|
| 295 | `run-handoff` / `update-handoff` | **Ponto de entrada do Gerar/Atualizar Handoff** |
| 315 | *(dentro de run-handoff)* | Swap de template antigo: detecta `keyboard maping` filho → `importComponentByKeyAsync` → substitui nó |
| 342 | *(dentro de run-handoff)* | Detach da instância se for INSTANCE; renomeia frame |
| 357 | `fillTable` *(inline)* | Clona Row/`[dsc doc] Doc Table` com `Table Cell` para cada mapeamento; suporta 3 estruturas de template |
| 443 | *(Parte B — Área de Toque)* | Monta `todasAsAreas` de `msg.variacoes`; delega para lógica visual |
| 506 | *(Área de Toque — visual)* | Preenche frame `image`, cria overlays e marcadores por variação |
| 622 | *(Focus Order — visual)* | Preenche frame `focus order` com tab order por variação |
| 743 | *(Leitor de Tela — preview)* | Monta conectores no frame `screen reader` por variação |
| 953 | *(Leitor de Tela — specs)* | Preenche tabela de specs do leitor de tela |
| 1110 | *(Zoom WCAG)* | Aplica zoom e contraste WCAG no frame `zoom` |
| 1300 | `create-touch-overlay` | Cria frame rosa sobre o componente; salva ID em `tempTouchOverlayId` |
| 1338 | `confirm-touch-area` | Lê dimensões/posição do frame via `getNodeByIdAsync`; envia `touch-area-confirmed` |
| 1357 | `cancel-touch-area` | Remove frame temporário; limpa `tempTouchOverlayId` |
| 1379 | `get-component-properties` | Retorna propriedades do componente ativo para uso no form de variações |
| 1421 | `create-variation-frame` | Cria frame de variação de toque no canvas |
| 1487 | `activate-variation` | Foca a variação de toque no canvas |
| 1514 | `get-tab-selection` | Retorna nó selecionado para adicionar ao tab order |
| 1570 | `create-sr-variation-frame` | Cria frame de variação de leitor de tela |
| 1608 | `create-tab-variation-frame` | Cria frame de variação de tabulação |
| 1734 | `import-old-section` | Chama o parser correto (`geral/toque/tabulacao/leitor`) e responde com `old-section-data` |
| 1759 | `save-partial-data` | Salva chave específica no `a11y-component-data` do pluginData |
| 1774 | `get-sr-selection` | Retorna nó selecionado para leitor de tela |
| 1804 | `create-sr-overlay` | Cria overlay de área de leitor de tela |
| 1839 | `confirm-sr-area` | Confirma área de leitor de tela e envia de volta para UI |

### Funções de suporte (1872–2015)

| Linha | Função | Resumo |
|-------|--------|--------|
| 1887 | `tentarTravarContexto(selection)` | Valida seleção (1 componente + 1 handoff); trava contexto; chama `carregarDadosEEnviarParaUI` |
| 1945 | `parseMasterList(dbInstance)` | Lê tabela `"Mapeamento de Teclado e Gestos do Plugin"` do nó data; retorna `{ mapeamento, descricao, utilizacao }[]` |
| 1980 | `parseRolesList(dbInstance)` | Lê tabela de roles/especificações ARIA do nó data |

### Parsers de migração (2016–2545)

| Linha | Função | Resumo |
|-------|--------|--------|
| 2020 | `parseOldSRData(handoff)` | Extrai dados de leitor de tela do handoff antigo → `{ variacoes[] }` |
| 2122 | `parseOldTabOrder(handoff)` | Extrai tab order do frame `focus order` → `{ variacoes: TabVariacao[] }` |
| 2217 | `toTouchPreset(h, w)` | Converte dimensões numéricas para string de preset de toque |
| 2225 | `parseOldTouchAreas(handoff)` | Extrai áreas de toque do frame `target area` → `{ variacoes: TouchVariacao[] }` |
| 2386 | `parseOldGeralData(handoff)` | Extrai plataformas, zoom e mapeamentos de teclado/gesto do handoff antigo |
| 2490 | `carregarDadosEEnviarParaUI(handoff)` | Detecta `isOldFormat`, lê pluginData, envia `setup-ui` para a UI |

---

## ui.html — Script (~2876 linhas)

### Variáveis globais principais

| Linha | Variável | Tipo / Descrição |
|-------|----------|-----------------|
| 701 | `masterList` | `{ mapeamento, descricao, utilizacao }[]` — lido do template via `setup-ui` |
| 701 | `currentData` | Mapeamentos selecionados para o componente atual |
| 701 | `touchData` | Áreas de toque da variação ativa |
| 1536 | `variationsData` | `Variacao[]` — variações de toque |
| 1537 | `tabVariationsData` | `TabVar[]` — variações de tabulação |
| 1538 | `isOldFormat` | `boolean` — handoff antigo detectado |
| 1539 | `srVariationsData` | `SRVar[]` — variações de leitor de tela |

### Funções principais

| Linha | Função | Resumo |
|-------|--------|--------|
| 727 | `setupSearch(inputId, resId, filterType)` | Registra listeners de busca; chamado **1× por tipo** fora do `onmessage` |
| 770 | `addItem(item)` | Adiciona mapeamento a `currentData`; sem duplicatas |
| 782 | `renderLists()` | Renderiza cards de teclado/gesto; atualiza badges |
| 817 | `updateSummaryCards()` | Atualiza contadores nos cards de resumo de todas as abas |
| 1482 | `updatePZCount()` | Atualiza badge de plataformas/zoom selecionados |
| 1526 | `reloadTemplateData()` | Força recarga do masterList do template (usado em sync) |
| 1551 | `renderTouchList()` | Renderiza lista de áreas de toque da variação ativa |
| 1570 | `removeTouchArea(i)` | Remove área de toque pelo índice |
| 1582 | `getTouchPreset()` | Deriva preset string de `touchSelectedSize × touchSelectedForma` |
| 1613 | `showView(viewId)` | Alterna entre views de variação e main view (toque) |
| 1702 | `renderTabOrderList()` | Renderiza lista de tab order da variação ativa |
| 1752 | `showSRView(viewId)` | Alterna entre views de variação e main view (leitor de tela) |
| 1759 | `renderSRVariationList()` | Renderiza lista de variações de leitor de tela |

### Handlers de mensagem recebida (`window.onmessage`)

| Mensagem | Linha aprox. | O que faz |
|----------|-------------|-----------|
| `setup-ui` | ~930 | Popula masterList, roles, componentData; detecta `isOldFormat`; inicializa form |
| `old-section-data` | ~1050 | Recebe dados de migração por seção; mescla em variationsData/tabVariationsData/srVariationsData |
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
