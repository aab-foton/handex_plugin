# Mapa de Funções — DSC A11Y Handoff

Guia de navegação rápida. Números de linha referem-se ao estado atual do arquivo.

---

## code.ts (~3972 linhas)

### Variáveis globais (17–29)

| Linha | Variável | Descrição |
|-------|----------|-----------|
| 17 | `componentePrincipalAtivo` | Componente selecionado travado no contexto |
| 18 | `handoffAtivo` | Frame/instância do handoff travado |
| 19 | `variacoesContainerId` | ID do frame `[A11Y Variações]` no canvas |
| 20 | `pluginDataNodeId` | Cache do ID do nó `[dsc-h] Plugin Data A11y` |
| 22 | `tempTouchOverlayId` | ID do overlay de área de toque ativo (dentro do imageFrame) |
| 23 | `tempSROverlayId` | ID do clone de conector SR pendente de confirmação (dentro do srImageFrame) |
| 24 | `tempSROverlayRefX/Y` | Posição da instância SR ativa no momento de `create-sr-overlay` (referência para relX/relY) |
| 26 | `tempSROverlayTipo` | Tipo do overlay SR pendente: `'agrupamento'` ou `'conector'` |
| 27 | `componenteVariacaoAtivo` | Nó da variação de toque ativa no canvas |
| 28 | `componenteTabVariacaoAtivo` | Nó da variação de tabulação ativa |
| 29 | `componenteSRVariacaoAtivo` | Nó da variação de leitor de tela ativa |
| 30 | `isHandoffGenerated` | `boolean` — true após o primeiro `run-handoff` bem-sucedido; lido da chave `a11y-handoff-generated` no pluginData do frame |

### Utilitários (48–438)

| Linha | Função | Resumo |
|-------|--------|--------|
| 48 | `resolveDataNode(node)` | Sobe na hierarquia para encontrar `COMPONENT_SET` ou `COMPONENT` pai |
| 62 | `getCachedPluginDataNode()` | Retorna o `[dsc-h] Plugin Data A11y` do handoff ativo (com cache) |
| 74 | `getTouchDimensions(preset)` | Converte string de preset (`'aprimorado'` etc.) em `{ hStr, wStr }` |
| 82 | `updateText(node, value)` | Escreve em TextNode lidando com fontes mistas (`getRangeFontName` fallback) |
| 99 | `applyWcagBackground(imageFrame, comp, vars)` | Aplica cor de fundo com contraste WCAG calculado via variáveis Figma; escolhe entre `card background` e `card background 2` pela maior razão de contraste contra a cor do componente; assume branco quando o frame não tem fill |
| 189 | `computeLetrasTS(conectores)` | Gera array de letras/números para labels de conectores de leitor de tela |
| 208 | `createComponentInstance(comp)` | Cria instância de COMPONENT/COMPONENT_SET com fallback para clone |
| 231 | `ensureHandoffDetached()` | Detacha `handoffAtivo` se for INSTANCE; renomeia; atualiza a variável global |
| 240 | `renumberTouchBadges(imageFrame)` | Renumera badges de toque por variação; usa `Map` pré-indexado para O(1) lookup |
| 291 | `getTouchImageFrame()` | Encontra o frame `image` (target area) no handoff; detacha se necessário; reseta contexto se nó não existe mais |
| 314 | `getTabImageFrame()` | Análogo para `focus order > image` |
| 336 | `getSRImageFrame()` | Análogo para `screen reader > image`; detacha INSTANCE |
| 358 | `clearVariationMarkers(varFrame)` | Remove todos os nós com `a11y-marker ≠ ''` de um frame |
| 421 | `getOrCreateVariacoesContainer(comp, handoff, parent)` | Garante existência do frame `[A11Y Variações]` no canvas |

### Handler principal — `figma.ui.onmessage` (502–3206)

| Linha | Mensagem | O que faz |
|-------|----------|-----------|
| 502 | `run-handoff` / `update-handoff` | **Ponto de entrada do Gerar/Atualizar Handoff** |
| ~518 | *(isOldHandoff)* | Detecta handoff antigo pelo **nome** (`startsWith('[dsc] A11Y Handoff:')`) — não usa `findOne` |
| ~531 | *(swap antigo→novo)* | Clona seções desmarcadas (`oldSnapshots`) → `importComponentByKeyAsync` → substitui nó |
| ~649 | *(Título)* | Preenche `Component Name` se `runTitulo !== false` |
| ~659 | `fillTable` *(inline)* | Clona Row/`[dsc doc] Doc Table` com `Table Cell` para cada mapeamento; suporta 3 estruturas de template |
| ~636 | *(Área de Toque — specs)* | Preenche frame `specs` de `target area` com todas as áreas achatadas de `msg.variacoes`; numeração global (`i + 1`) |
| ~696 | *(Área de Toque — visual/preview)* | Oculta modelos (`visible=false`), aplica WCAG, renumera badges globalmente; bounding-box sobre todos os filhos relevantes (variation-component/touch-overlay/touch-badge); `clipsContent = false` |
| ~759 | *(Focus Order — visual)* | Preenche frame `focus order` com tab order por variação; badge em cima sem conector |
| ~892 | *(Leitor de Tela — preview)* | Monta conectores/agrupamentos no frame `screen reader` por variação; aplica `setProperties(overlayProps)` para orientação/tipo (fallback geométrico para dados antigos) |
| ~1157 | *(Leitor de Tela — specs)* | Preenche tabela de specs do leitor de tela por variação |
| ~1635 | *(Zoom WCAG)* | Aplica zoom e contraste WCAG no frame `zoom` |
| ~1735 | *(Zoom spec rows)* | Oculta/mostra `element` dentro de `specs` no `zoom` conforme `zoomTypes`; renumera os visíveis |
| 1847 | `create-touch-overlay` | Cria overlay (`[dsc-h] Handoff areas`) + badge (`[dsc-h] Item Number`) DENTRO do imageFrame; índice global entre todas as variações; idempotente por variationId |
| 1941 | `confirm-touch-area` | Lê posição/dimensão do overlay no imageFrame + `componentProperties` do badge (conector); envia `touch-area-confirmed` com `badgeProps` |
| 1988 | `cancel-touch-area` | Remove overlay + badge do imageFrame pelo `tempTouchOverlayId` e index |
| 2008 | `remove-touch-overlay` | Remove overlay + badge do imageFrame por `variationId + nome` |
| 2023 | `highlight-touch-area` | Seleciona e zoom no overlay do imageFrame por `variationId + nome` |
| 2035 | `get-component-properties` | Retorna propriedades do componente ativo para uso no form de variações |
| 2077 | `create-variation-frame` | Cria instância da variação DENTRO do imageFrame; posição acumulada; idempotente |
| 2153 | `activate-variation` | Seleciona + zoom na instância da variação no imageFrame; redimensiona imageFrame com bounding-box |
| 2283 | `deactivate-variation` | Zera `componenteVariacaoAtivo` |
| 2287 | `get-tab-selection` | Retorna nó selecionado para adicionar ao tab order |
| 2324 | `get-component-as-tab` | Usa componente ativo como item de tab order |
| 2343 | `delete-variation-frame` | Remove instância por `instanceNodeId` + overlays/badges por `variationId` do imageFrame |
| 2363 | `create-sr-variation-frame` | Cria instância SR no srImageFrame (idempotente por pluginData); oculta modelos (`visible=false`) |
| 2413 | `create-tab-variation-frame` | Cria instância tab no tabImageFrame (idempotente) |
| 2462 | `activate-tab-variation` | Recria/busca instância tab; desenha markers com offset; envia `tab-variation-instance-recreated` |
| 2587 | `deactivate-tab-variation` | Zera `componenteTabVariacaoAtivo` |
| 2591 | `delete-tab-variation-frame` | Remove instância tab por `variationId` |
| 2605 | `activate-sr-variation` | Busca/cria instância SR; aplica `setProperties(overlayProps)` em agrupamentos e conectores; fallback geométrico para dados antigos |
| 2824 | `deactivate-sr-variation` | Zera `componenteSRVariacaoAtivo` |
| 2828 | `append-sr-marker` | Adiciona só o marker do conector recém-adicionado; aplica `setProperties(overlayProps)` na orientação/tipo |
| 2957 | `delete-sr-variation-frame` | Remove instância SR por `variationId` + clearVariationMarkers |
| 2976 | `save-leitor-tela` | Salva conectores/variações SR; usa `handoffAtivo` como fallback |
| 2996 | `import-old-section` | Chama o parser correto e responde com `old-section-data` |
| 3021 | `save-setting` | Persiste setting em `figma.clientStorage`; atualiza `templateHandoffNames` em memória se a key for `a11y-template-names` |
| 3028 | `save-partial-data` | Salva chave específica no `a11y-component-data` |
| 3045 | `get-sr-selection` | Retorna nó selecionado para leitor de tela (compatibilidade legado) |
| 3075 | `create-sr-overlay` | Clona `[a11y] Conectores` ou `[a11y] Agrupamento` dentro do srImageFrame para posicionamento; armazena `tempSROverlayRefX/Y` e `tempSROverlayTipo` |
| 3153 | `confirm-sr-area` | Lê posição/dimensão do clone relativo à instância; salva todas as `componentProperties` como `overlayProps` (chaves com sufixo `#id`); remove clone |
| 3183 | `cancel-sr-area` | Remove clone pendente do srImageFrame |

### Funções de suporte (3207–3337)

| Linha | Função | Resumo |
|-------|--------|--------|
| 3207 | `tentarTravarContexto(selection)` | Valida seleção (1 componente + 1 handoff); trava contexto; chama `carregarDadosEEnviarParaUI`. Nomes de template aceitos vêm de `templateHandoffNames` (editável em Configurações, ver linha ~31) |
| 3267 | `parseMasterList(dbInstance)` | Lê tabela `"Mapeamento de Teclado e Gestos do Plugin"` do nó data; retorna `{ mapeamento, descricao, utilizacao }[]` |
| 3302 | `parseRolesList(dbInstance)` | Lê tabela de roles/especificações ARIA do nó data |

### Parsers de migração (3342–3907)

| Linha | Função | Resumo |
|-------|--------|--------|
| 3342 | `parseOldSRData(handoff)` | Extrai dados de leitor de tela do handoff antigo → `{ variacoes[] }` |
| 3518 | `parseOldTabOrder(handoff)` | Extrai tab order do frame `focus order` → `{ variacoes: TabVariacao[] }` |
| 3613 | `toTouchPreset(h, w)` | Converte dimensões numéricas para string de preset de toque |
| 3621 | `parseOldTouchAreas(handoff)` | Extrai áreas de toque do frame `target area` → `{ variacoes: TouchVariacao[] }` |
| 3804 | `parseOldGeralData(handoff)` | Extrai plataformas, zoom e mapeamentos de teclado/gesto do handoff antigo |
| 3908 | `carregarDadosEEnviarParaUI(handoff)` | Detecta `isOldFormat`, carrega pluginData (para ambos os formatos), envia `setup-ui` para a UI |

---

## ui.html — Script (~2985 linhas)

### Variáveis globais principais

| Linha | Variável | Tipo / Descrição |
|-------|----------|-----------------|
| 692 | `escapeHtml(s)` | Helper de sanitização: converte `&`, `<`, `>`, `"`, `'` para entidades HTML antes de interpolar em `innerHTML` |
| 701 | `masterList` | `{ mapeamento, descricao, utilizacao }[]` — lido do template via `setup-ui` |
| 701 | `currentData` | Mapeamentos selecionados para o componente atual |
| 701 | `touchData` | Áreas de toque da variação ativa (`TouchAreaItem[]` com `badgeProps` opcional) |
| ~1570 | `variationsData` | `Variacao[]` — variações de toque (inclui sempre a `'default'`) |
| ~1571 | `tabVariationsData` | `TabVar[]` — variações de tabulação |
| ~1572 | `isOldFormat` | `boolean` — handoff antigo detectado |
| ~1573 | `srVariationsData` | `SRVar[]` — variações de leitor de tela |
| ~1581 | `currentVariationId` | `string | null` — variação de toque ativa (`'default'` ou UUID) |

### Funções principais

| Linha | Função | Resumo |
|-------|--------|--------|
| ~742 | `setupSearch(inputId, resId, filterType)` | Registra listeners de busca; chamado **1× por tipo** fora do `onmessage`; dropdown usa `position: fixed` + `getBoundingClientRect` |
| ~773 | `addItem(item)` | Adiciona mapeamento a `currentData`; sem duplicatas |
| ~785 | `renderLists()` | Renderiza cards de teclado/gesto; atualiza badges |
| ~820 | `updateSummaryCards()` | Atualiza contadores nos cards de resumo de todas as abas |
| ~1497 | `updatePZCount()` | Atualiza badge de plataformas/zoom selecionados |
| ~1541 | `openInfo() / closeInfo()` | Abre/fecha painel "Como usar" (infoOverlay) |
| ~1548 | `reloadTemplateData()` | Força recarga do masterList do template (usado em sync) |
| ~1573 | `renderTouchList()` | Renderiza lista de áreas de toque da variação ativa |
| ~1592 | `removeTouchArea(i)` | Remove área de toque pelo índice |
| ~1604 | `getTouchPreset()` | Deriva preset string de `touchSelectedSize × touchSelectedForma` |
| ~1635 | `showView(viewId)` | Alterna entre views de variação e main view (toque) |
| ~1675 | `openTabForm()` | Abre overlay "Adicionar foco de tabulação" |
| ~1686 | `closeTabForm()` | Fecha form de tabulação |
| ~1693 | `saveTabForm()` | Salva itens do form: se 'selection' → `get-tab-selection`; se 'component' → push + `saveTouchTabData()` + `activate-tab-variation` |
| ~1721 | `selectTabFormType(type)` | Seleciona tipo 'selection' ou 'component' |
| ~1757 | `renderTabOrderList()` | Renderiza lista de tab order da variação ativa |
| ~1774 | `showSRView(viewId)` | Alterna entre views de variação e main view (leitor de tela) |
| ~1781 | `renderSRVariationList()` | Renderiza lista de variações de leitor de tela |
| ~1953 | `editTabVariation(id)` | Carrega variação de tabulação |
| ~2076 | `editVariation(id)` | Carrega variação de toque; sincroniza `touchData` com a variação ativa |
| ~1820 | `selectSRVariation(id)` | Carrega variação de leitor de tela |
| ~2133 | `renderImportBanners()` | Exibe banner de migração (apenas se `isOldFormat && componentData vazio`) |
| ~2140 | `importAllSections(evt)` | Dispara `import-old-section` para cada seção |
| ~2153 | `saveGeralData(debounce)` | Envia `save-partial-data` para plataformas, zoom e mapeamentos |
| ~2161 | `saveTouchTabData()` | Envia `save-partial-data` para `variacoes` e `variacoes_tabulacao` |
| ~2533 | `saveLeitorTela()` | Envia `save-leitor-tela` com conectores e variações de SR |

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
| `[dsc-h] Template Handoff` (set) — descontinuado, só referência p/ handoffs antigos ainda não migrados | COMPONENT_SET | `b9dd10fb8aa3b49af1b37206fb2d32e44828618b` |
| `[dsc-h] Template Handoff` variant=Acessibility — descontinuado | COMPONENT | `4ebd8a017a86b29ca60427416ed4b76af05e4a67` |
| `[dsc-hub] Handoff Acessibility` — template atual, usado no swap de migração (code.ts:541) | COMPONENT | `d95d06ed0e31131a29a6f7c87c3fcc0f2eee6950` |
| `[dsc-h] Template Handoff` variant=Design | COMPONENT | `b7edcc2f70402c3173bf36815867ea17e5cfdf26` |
