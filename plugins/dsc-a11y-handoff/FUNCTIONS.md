# Mapa de Funções — code.ts

> Referência rápida para localizar e editar funções no plugin.

---

## Utilitários de dados (leitura / escrita de pluginData)

| Linha | Função | Descrição |
|-------|--------|-----------|
| 287 | `safeParseJson` | Faz parse de JSON com fallback seguro |
| 298 | `readTouchAreasRaw` | Lê áreas de toque brutas de um nó (prioriza variante específica) |
| 312 | `readFocusOrderRaw` | Lê ordem de foco bruta de um nó (prioriza variante específica) |
| 325 | `readUnifiedAnnotationsRaw` | Lê anotações unificadas (SR) de um nó, com suporte a variante |
| 334 | `variantHasOwnData` | Retorna true se a variante tem dados específicos (não compartilhados) |
| 344 | `saveUnifiedAnnotations` | Salva anotações unificadas no pluginData do nó |
| 354 | `sendUnifiedAnnotations` | Lê e envia anotações unificadas para a UI |
| 384 | `migrateToUnifiedAnnotations` | Migra anotações do formato legado para o formato unificado |
| 485 | `setUnifiedEntry` | Salva ou atualiza uma entrada de anotação unificada |
| 536 | `setLayerDataByPath` | Salva dados de acessibilidade de um layer pelo seu namePath |
| 562 | `removeUnifiedEntry` | Remove uma entrada de anotação unificada por ID ou namePath |
| 635 | `resolveCodeNote` | Retorna a nota de código correta para a plataforma (web / RN) |
| 1860 | `getConsolidatedMap` | Retorna mapa consolidado de roles por namePath (variante ou compartilhado) |
| 1875 | `getEffectiveConsolidatedMap` | Mapa consolidado com fallback para compartilhado se variante vazia |
| 1887 | `saveConsolidatedMap` | Salva mapa consolidado de roles no pluginData |
| 1925 | `readVariantConfigs` | Lê VariantConfigs (variantes parametrizadas) do nó raiz |
| 1932 | `saveVariantConfigs` | Salva VariantConfigs no nó raiz |

---

## Componente raiz / seleção / variantes

| Linha | Função | Descrição |
|-------|--------|-----------|
| 588 | `getCurrentRoot` | Retorna o nó raiz atual (workingNodeId ou currentRootId) |
| 619 | `invalidateSRComponentSetCache` | Limpa o cache de component sets de conectores SR |
| 673 | `isValidSelection` | Verifica se um nó é selecionável como componente |
| 682 | `isNodeDescendantOfRoot` | Verifica se um nó é descendente do root atual |
| 707 | `resolveComponentRoot` | Resolve a instância/componente para seu root (COMPONENT_SET ou COMPONENT) |
| 762 | `buildCanvasNamePath` | Monta o namePath de um nó relativo ao root (para anotações no canvas) |
| 780 | `sendComponentData` | Envia dados completos do componente para a UI (variantes, configs, etc.) |
| 908 | `handleCanvasLayerSelection` | Processa seleção de um layer no canvas e envia dados de anotação para a UI |
| 1346 | `handleSelectionChange` | Callback principal de mudança de seleção no canvas Figma |
| 1614 | `cleanupVariantInstances` | Remove instâncias temporárias de VariantConfigs do canvas |
| 1821 | `switchVariant` | Troca a variante ativa e envia os dados correspondentes para a UI |
| 1845 | `buildNamePath` | Monta namePath de um nó relativo ao rootId (para instâncias no handoff) |
| 1899 | `getAllVariantNames` | Retorna todos os nomes de variantes do COMPONENT_SET atual |
| 1911 | `removeFromAllVariantMaps` | Remove um namePath de todos os mapas de variantes |
| 1940 | `getVariantOverrides` | Retorna quais variantes têm overrides de roles, touch e focus |
| 1975 | `createVariantOverride` | Copia dados compartilhados para criar override específico de variante |
| 1998 | `removeVariantOverride` | Remove override específico de variante (reverte para compartilhado) |

---

## Ordem de foco / tabulação

| Linha | Função | Descrição |
|-------|--------|-----------|
| 2024 | `focusOrderToNamePaths` | Converte entradas de focus order de nodeIds para namePaths estáveis |
| 2059 | `publishSharedA11yData` | Publica dados de acessibilidade no manifest compartilhado do componente |
| 2430 | `collectAnnotatedNodes` | Coleta nós com anotações a11y dentro de um componente |
| 2455 | `collectAllNodes` | Coleta todos os nós visíveis de um componente (para mapa de foco) |
| 2473 | `getFocusOrder` | Lê ordem de foco e envia para a UI (com resolução de namePaths) |
| 2596 | `setFocusOrder` | Salva ordem de foco (converte nodeIds para namePaths estáveis) |

---

## Áreas de toque

| Linha | Função | Descrição |
|-------|--------|-----------|
| 2348 | `refreshZones` | Atualiza zonas de layer visíveis e envia para a UI |
| 2381 | `saveTouchAreas` | Salva áreas de toque no pluginData |
| 2398 | `getTouchAreas` | Lê áreas de toque e envia para a UI |

---

## CSV / template de dados

| Linha | Função | Descrição |
|-------|--------|-----------|
| 1041 | `getTextChildren` | Retorna textos diretos de um frame (helper para parse do CSV) |
| 1055 | `findFirstText` | Retorna o primeiro texto filho de um frame |
| 1067 | `hasTextDescendant` | Verifica se um nó tem descendente de texto |
| 1078 | `isDataRow` | Verifica se um frame é uma linha de dados do CSV |
| 1100 | `parseCsvFromNode` | Parseia o CSV de um frame de dados do template |
| 1213 | `findPluginDataFrame` | Localiza o frame de "plugin data" dentro do template |
| 1232 | `persistTemplateAssociation` | Salva associação template↔componente no pluginData |
| 1248 | `recoverTemplateNodeId` | Tenta recuperar o ID do template associado ao componente |
| 1263 | `loadCsvFromTemplate` | Carrega e parseia o CSV do template selecionado |
| 1277 | `reloadCsvFromLibrary` | Recarrega o CSV do template da biblioteca |

---

## Preview e geração de handoff (modo legado / sem template)

| Linha | Função | Descrição |
|-------|--------|-----------|
| 1672 | `setComponentData` | Salva configurações gerais do componente (platform, zoom, etc.) |
| 1691 | `collectLayerZones` | Coleta bounding boxes de layers para posicionamento de badges |
| 1722 | `generatePreview` | Gera preview de anotações SR diretamente no canvas (modo legado) |
| 2661 | `sendProgress` | Envia mensagem de progresso para a UI durante geração |
| 2668 | `discoverConnectors` | Descobre component sets de conectores [a11y] no arquivo |
| 2709 | `guessCategory` | Infere categoria de acessibilidade pelo nome do componente conector |
| 2724 | `collectAllAnnotatedLayers` | Coleta todos os layers com anotação de acessibilidade |
| 3270 | `generateHandoff` | Gera handoff completo no modo legado (sem template) |

---

## Helpers de UI / primitivos visuais

| Linha | Função | Descrição |
|-------|--------|-----------|
| 2746 | `appendFill` | Adiciona um nó a um frame com fill (auto-layout helper) |
| 2759 | `createText` | Cria um TextNode com fonte Inter em estilo/cor definidos |
| 2773 | `createSection` | Cria frame vertical com auto-layout |
| 2784 | `createDivider` | Cria linha divisória horizontal |
| 2795 | `createKeyTag` | Cria badge de tecla de teclado (ex.: "Tab", "Enter") |
| 2813 | `createTableRow` | Cria uma linha de tabela com células e larguras fixas |
| 2843 | `createTable` | Cria uma tabela completa com header e linhas |
| 2871 | `createInfoBox` | Cria caixa de aviso/informação estilizada |
| 2896 | `createBadge` | Cria badge circular colorido com letra/número |
| 2915 | `createCategoryBadge` | Cria badge com ícone/cor baseado na categoria de acessibilidade |
| 2991 | `createLegendItem` | Cria item de legenda com cor e label |
| 3014 | `createAnnotationRow` | Cria linha de anotação com badge e texto |
| 3036 | `createPreviewTag` | Cria tag "Preview" escura usada no canto do frame de preview |
| 3051 | `collectTextNodes` | Coleta todos os TextNodes dentro de uma árvore |
| 3067 | `scaleTextNodes` | Escala tamanho de fonte de todos os textos de um nó (para zoom) |
| 3106 | `cloneSource` | Clona o componente fonte para uso no preview/handoff |
| 3124 | `createPreviewFrame` | Cria frame de preview com clone do componente + badges de anotação |
| 3207 | `createTouchPreview` | Cria preview de áreas de toque com overlays coloridos |

---

## Geração de handoff via template (modo principal)

| Linha | Função | Descrição |
|-------|--------|-----------|
| 3697 | `findByName` | Busca um nó filho pelo nome (helper) |
| 3712 | `createDetachedTemplate` | Cria instância detachada do template a partir da chave do componente |
| 3745 | `getTemplateSectionFresh` | Retorna uma seção do template pelo nome (instância fresca) |
| 3764 | `getTemplateSectionsAll` | Retorna todas as seções nomeadas do template de uma vez |
| 3789 | `getTemplateSectionNames` | Retorna os nomes de todas as seções de um template |
| 3886 | `readHandoffData` | Lê todos os dados necessários para gerar o handoff (roles, touch, focus, etc.) |
| 4115 | `fillTitleSection` | Preenche a seção de título com o nome do componente |
| 4128 | `fillMappingSection` | Preenche a seção de mapeamento de teclado e gestos |
| 4209 | `fillTouchAreaSection` | Preenche a seção de áreas de toque com previews e specs |
| 4401 | `fillFocusOrderSection` | Preenche a seção de ordem de foco com previews e specs |
| 4610 | `connectorTypeToCategory` | Converte tipo de conector (string do CSV) para categoria interna |
| 4627 | `fillScreenReaderSection` | **Principal.** Preenche a seção de Leitor de Tela: posiciona conectores no preview e preenche specs por variante |
| 5075 | `fillZoomSection` | Preenche a seção de zoom/responsividade com previews escalados |
| 5160 | `findExistingHandoff` | Localiza um handoff já gerado para o componente na página |
| 5674 | `generateHandoffFromTemplate` | **Ponto de entrada principal.** Gera ou regera o handoff completo via template |

---

## Atualização de handoff existente

| Linha | Função | Descrição |
|-------|--------|-----------|
| 5181 | `calcularCaminhoNo` | Calcula o caminho de um nó relativo a um raiz (para update) |
| 5206 | `coletarTextosSecao` | Coleta todos os TextNodes de uma seção (para preservar textos manuais) |
| 5227 | `extrairTextosSecao` | Extrai mapa caminho→texto de uma seção antes do update |
| 5242 | `reinjetarTextosSecao` | Reinjeta textos manuais preservados após update da seção |
| 5274 | `syncLayoutProps` | Sincroniza propriedades de layout entre frames fonte e destino |
| 5309 | `syncVisualsRecursive` | Sincroniza fills, strokes e efeitos visuais recursivamente |
| 5348 | `extractMarkerPositions` | Extrai posições de marcadores numéricos para restauração pós-update |
| 5374 | `restoreMarkerPositions` | Restaura posições de marcadores após update do template |
| 5419 | `updateHandoffFromTemplate` | Atualiza handoff existente preservando textos manuais e posições |

---

## Funções internas de `fillScreenReaderSection` (linha 4627)

| Linha | Função | Descrição |
|-------|--------|-----------|
| ~4718 | `blockInstances` (array) | Instâncias pré-criadas por bloco de variante para o imageFrame |
| ~4880 | `calcPos` (inline) | Calcula posição de um conector em um edge+ring específico |
| ~4891 | `sobrepoe` (inline) | Verifica colisão de uma posição com `ocupados` (+COLL_PAD) |
| 4950 | `createSpecRow` | Cria linha de spec (nome de elemento) na seção de specs |
| 4968 | `createSpecBox` | Cria box de detalhes de anotação (descrição, observação, código) |

---

## Constantes relevantes para posicionamento (fillScreenReaderSection)

| Constante | Valor | Descrição |
|-----------|-------|-----------|
| `PAD` | 64 | Padding interno do imageFrame |
| `CONN_MARGIN` | 8 | Margem do conector no fallback (cRight + 8) |
| `GAP_BETWEEN_VARIANTS` | 120 | Espaço entre blocos de variante no imageFrame |
| `CONNECTOR_MARGIN` | 120 | Margem mínima lateral do cursorX inicial |
| `COLL_PAD` | 4 | Buffer de colisão no `sobrepoe` |
| `ocupados` | array | Lista de posições ocupadas por bloco (**resetado por variante**) |
