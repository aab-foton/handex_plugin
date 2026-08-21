# Migração Beta → Main — Handex

**Data:** 2026-08-20
**Versão da beta no momento deste documento:** `6.1.0-beta.1` (`package.json`)
**Commit de origem:** trabalho não commitado ainda (working tree da sessão de 2026-08-19/20)

## Contexto geral — leia antes de migrar qualquer coisa

Este documento cobre **14 features/bugfixes** implementados na beta nesta sessão, nenhum deles ainda portado para `main`. Todos os trechos de código correspondentes estão marcados no código-fonte com comentários `BETA-ONLY: <id>` (blocos com `══ BETA-ONLY: <id> (início/fim) ══` quando extraíveis; comentário de linha única `// BETA-ONLY: <id>` quando o código está inseparável de lógica pré-existente). Busque por `BETA-ONLY: <id>` para localizar todos os pontos de uma feature.

**Nota estrutural importante (mapeada em sessão anterior, não reinvestigada aqui):** `main` e `beta` já divergiram estruturalmente antes desta sessão. Em particular, `main` tem uma arquitetura de geração de ficha baseada em prefixo `_hd*` que a beta não usa da mesma forma — ao migrar qualquer feature que toque a geração da Ficha (`ficha-atualiza-sem-duplicar`, `ficha-specs-avulsas-sem-frame`, `ficha-a11y-agrupada-por-area`), confirme como a função equivalente está estruturada em `main` antes de colar o diff da beta — não assuma que a função tem o mesmo nome/formato.

**Escopo desta sessão:** todo o trabalho de Acessibilidade (formulário dinâmico, detecção automática, ordem de tabulação, layout em colunas, marcar área, subaccordions) é uma frente única e interdependente — a maioria dessas features assume que as outras já existem. Migrar Acessibilidade parcialmente é arriscado; ver seção "Ordem de migração recomendada" no fim.

Os 12 arquivos-fonte com marcadores (arquivos gerados — `code.bundle.js`, `ui.html`, `tailwind-compiled.css` — não têm marcadores manuais, são build artifacts):

```
src/plugin/code.js
src/plugin/modules/accessibility.js
src/plugin/modules/core.js
src/plugin/modules/design-data.js
src/plugin/modules/handoff.js
src/plugin/modules/messages.js
src/plugin/modules/specifications.js
src/plugin/views/flows.html
src/plugin/views/handoff.html
src/plugin/views/measurement.html
src/plugin/views/modals.html
src/plugin/views/specifications.html
```

---

## 1. `a11y-formulario-dinamico`

**O que é.** Formulário de "Elementos e Imagens" (categoria `elemento` de a11y) passa a mostrar campos REAIS do componente escolhido: um `<select>` de variante secundária (ex: Button → default/desabilitado/de icone) e toggles booleanos (Nome Acessível/Observações/Notas de Código) — só os que aquele componente específico tem catalogado na lib "Design Acessível". As outras 4 categorias (estrutura/título/decorativo/informações) ganham a versão "fixa" do mesmo mecanismo (toggles sem `<select>` de componente, porque não têm um nível 1 dinâmico).

**Arquivos e blocos afetados.**
- `refs/design-acessivel-component-properties.json` — arquivo de dados novo, catálogo extraído via REST API (25 component sets `[a11y base]`).
- `src/plugin/code.js` — bloco `a11y-formulario-dinamico` (import do JSON, `_A11Y_SELECT_TO_SHORTNAME`, `_normalizeA11yToggleName`, `_getA11yComponentToggleMap`), e trecho intercalado grande dentro de `_tryImportA11yComponent` (instâncias aninhadas de nível 2/3, aplicação de `variantFields`/toggles reais via `setProperties`).
- `src/plugin/modules/accessibility.js` — bloco grande no topo (`A11Y_COMPONENT_PROPERTIES` literal colado, `_getA11yComponentToggles`, `_capitalizeFirst`), `_renderA11yElementoVariants`/`_renderA11yElementoToggles`/`_collectA11yElementoVariantValue`/`_collectA11yElementoToggleProperties`/`_restoreA11yElementoVariant`/`_restoreA11yElementoToggles`, versão genérica `_renderA11yFixedToggles`/`_collectA11yFixedToggleProperties`/`_restoreA11yFixedToggles` (usada por estrutura/título/decorativo/informações), branch `elemento` reescrito em `confirmA11ySpec`, chamadas intercaladas em `updateA11yElementoFields`/`updateA11yEstruturaFields`/`updateA11yTituloFields`/`updateA11yDecorativoFields`/`updateA11yInformacoesFields`, restauração em `_prefillA11ySpecForEdit`.
- `src/plugin/views/modals.html` — `#a11y-el-variants-wrap`/`#a11y-el-toggles-wrap` e os 4 wraps equivalentes (`#a11y-estrutura-toggles-wrap`, `#a11y-titulo-toggles-wrap`, `#a11y-decorativo-toggles-wrap`, `#a11y-informacoes-toggles-wrap`).

**Dependências que a main não tem hoje.**
- `refs/design-acessivel-component-properties.json` precisa ser gerado na main — rodar o script correspondente (ver `refs/fetch-a11y-component-properties.cjs`/`refs/build-dsc-a11y-mapping.cjs`, presentes no working tree mas não commitados/documentados formalmente ainda; confirme se sobrevivem antes de migrar).
- `A11Y_COMPONENT_PROPERTIES_RAW` (backend) e o literal `A11Y_COMPONENT_PROPERTIES` colado em `accessibility.js` (frontend) são **duas cópias conscientes do mesmo catálogo** — o frontend não tem bundler de módulos, então não há import real lá. Ao migrar, os dois precisam ser mantidos sincronizados manualmente (mesmo padrão já usado por `A11Y_CONTENT`/`design-acessivel-content.json`).

**O que verificar/adaptar ao migrar.**
- Confirme que `main` já tem `_findNestedInstanceWithAnyProp`/`_findTextNodeByCurrentValue` (usadas por este bloco) — devem existir, já eram pré-existentes na beta também.
- `let found` em `_tryImportA11yComponent` virou `let` (era `const`) para permitir reatribuição no nível 2 — se `main` tiver essa função com assinatura diferente, ajustar manualmente, não só colar o diff.

**Risco de migração:** médio. Lógica pura de backend/frontend, mas depende de um catálogo de dados extenso e de coordenação entre 2 cópias do mesmo JSON.

---

## 2. `bugfixes-a11y-diversos` (inclui "conectores reais de a11y")

**O que é.** Um conjunto de correções pontuais e reais na integração com a lib "Design Acessível": (a) badge de "Nível de Título" no Agrupamento tinha o texto "H" hardcoded na lib publicada, sem vínculo de property — corrigido via workaround escrevendo `.characters` direto; (b) o Conector-linha de Título usa uma property de texto diferente (`nível de título#6411:2`) das demais categorias (`letra#3925:6`) — antes usava sempre a segunda, silenciosamente sem efeito; (c) exclusão de Área Marcada agora remove em cascata as specs vinculadas a ela (antes viravam órfãs no bucket "Sem área"); (d) 5 keys `desativado` adicionadas em `A11Y_CONECTOR_LINHA_KEYS` (catalogadas, ainda sem uso na UI) e a constante `A11Y_COMBINADOS_KEYS` (catalogada, sem chamador, removida do bundle por tree-shaking).

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — `_tryImportA11yAgrupamento` (workaround do badge "H"), `_tryImportA11yConectorLinha` (property de título), `A11Y_CONECTOR_LINHA_KEYS.*.desativado`, `A11Y_COMBINADOS_KEYS`.
- `src/plugin/modules/accessibility.js` — `deleteA11yArea` (cascata de exclusão de specs).

**Dependências que a main não tem hoje.** Nenhuma nova — usa componentes/keys já catalogados por `a11y-conectores-reais`/`a11y-marcar-area` (pré-requisito lógico, não arquivo novo).

**O que verificar/adaptar ao migrar.** Se `main` ainda não tiver o mecanismo de import real de "[a11y] Agrupamento"/"[a11y] Conectores" (ver histórico do CLAUDE.md — bugs corrigidos), esses fixes não fazem sentido sozinhos; migrar junto com a base de import real de componentes a11y (que já deve existir em `main` de sessões anteriores — confirmar).

**Risco de migração:** baixo. Correções pontuais e bem isoladas, mas dependem de contexto de a11y já existir em `main`.

---

## 3. `a11y-marcar-area`

**O que é.** O modal "Marcar Área" ganha um seletor de posição do conector (superior/inferior/esquerda/direita/desativado) e um campo de número editável — antes o conector nascia sempre "superior" e o número era só sugerido automaticamente, sem poder editar.

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — handler `create-a11y-area` expandido (`A11Y_AREA_CONECTOR_KEYS`, `_conector`, cálculo de posição por lado).
- `src/plugin/modules/accessibility.js` — `openA11yAreaModal`/`confirmA11yArea` (leitura dos 2 campos novos, payload `conector`).
- `src/plugin/views/modals.html` — seção "Posição do conector" + input "Número" dentro do modal `#a11y-area-modal`.

**Dependências que a main não tem hoje.** Nenhuma — reaproveita keys do component set "[a11y] Conectores" que (supõe-se) já existem em `main` via feature de conectores reais anterior a esta sessão. Confirmar.

**O que verificar/adaptar ao migrar.** O payload de `create-a11y-area` ganhou o campo `conector` — se `main` tiver esse handler, precisa aceitar o campo novo (com fallback pra `'superior'` se ausente, compatível com specs antigas).

**Risco de migração:** baixo.

---

## 4. `a11y-deteccao-automatica`

**O que é.** Substitui o antigo botão solto "Detectar Componentes" (dependente de `activeFrameId`, que ficava quebrado se o designer nunca usasse a aba Escanear Tokens) por um modal que abre automaticamente logo após "Marcar Área", escopado ao elemento marcado. Expande o scan para 4 categorias (components/icons/typography/vectors) com heurísticas de correspondência DSC → categoria de a11y (alta confiança para componentes reais do DSC, baixa confiança para heurísticas de nome de camada/estilo em texto/ícones soltos). Inclui o botão "Gerar Handoff Automatizado" em lote, que cria várias specs de uma vez a partir das detecções.

**Arquivos e blocos afetados.**
- `refs/dsc-component-a11y-mapping.json` — mapa novo (componente DSC → categoria de a11y).
- `src/plugin/code.js` — `_resolveDscComponentA11yMatch`/`_getDscComponentKeyToFrameMap`/`_getDscFrameToA11yMap` (usa `refs/_skeleton.json`), `_resolveTypographyA11yMatch`/`_resolveDecorativeA11yMatch` (heurísticas), enriquecimento do scan com `dscComponentMatch`, `origin` ecoado em `scan-result`.
- `src/plugin/modules/messages.js` — roteamento de `scan-result` com `origin === 'a11y-detection'`, handler de `a11y-area-created` abrindo o modal, resolução do `_a11yBatchCreateResolve` em `spec-created`.
- `src/plugin/modules/accessibility.js` — bloco grande: `openA11yPostAreaDetectModal`/`runA11yPostAreaDetection`/`handleA11yPostAreaDetectionResult`/`useA11yDetection`, e Fase 3 do lote (`_buildA11yElementoPayload`/`_buildA11yTituloPayload`/`_buildA11yDecorativoPayload`, `openA11yBatchSummaryModal`/`confirmA11yBatchGenerate`/`_createA11ySpecAndWait`, `_collectAreaSiblingSpecIds`/`_collectAreaAllSpecIds`/`_suggestNextA11yTagForArea`). Também `presetComponente` em `openA11yModal`/`prefillA11yComponentName`.
- `src/plugin/views/modals.html` — `#a11y-post-area-detect-modal`, `#a11y-batch-summary-modal`.
- `src/plugin/views/specifications.html` — remoção da seção fixa "Detecção Automática" (comentário documentando a mudança).

**Dependências que a main não tem hoje.**
- `refs/dsc-component-a11y-mapping.json` (novo).
- `refs/_skeleton.json` já existe em `main` (é o skeleton das libs DSC), mas a leitura via `_getDscComponentKeyToFrameMap` é nova.
- Depende de `a11y-layout-colunas` (item 6) para posicionar corretamente specs criadas em lote dentro de uma área.

**O que verificar/adaptar ao migrar.** `_collectAreaSiblingSpecIds`/`_collectAreaAllSpecIds` são compartilhadas com o item 6 (`a11y-layout-colunas`) — migrar os dois juntos. `presetComponente` em `openA11yModal` é uma mudança de assinatura de função pública (`options` novo parâmetro) — confirmar que nenhum outro chamador em `main` passa um segundo argumento incompatível.

**Risco de migração:** alto. É o bloco mais extenso e mais interdependente (scan expandido + 2 modais + lote assíncrono sequencial). Migrar com testes manuais no Figma, não só revisão de código.

---

## 5. `a11y-ordem-tabulacao-por-area`

**O que é.** Nova ferramenta dentro da aba Acessibilidade, separada de "Especificação para Leitor de Tela": documenta a sequência de foco do teclado (Tab) usando o componente real `[a11y] Item Number`. Dois fluxos de entrada: clique sequencial manual (ativa um modo que numera automaticamente cada elemento clicado no canvas) e geração automática por varredura de camadas de uma Área Marcada. Lista reordenável por drag-and-drop, com botão "Atualizar" para propagar a nova ordem pro canvas.

Reformulada (sub-feature `a11y-ordem-tabulacao-por-area`) para viver **escopada por Área Marcada**, em vez de uma lista fixa única por frame: cada item ganhou o campo `a11yAreaId`, a numeração 1,2,3... reinicia a cada área (é sempre um filtro por `a11yAreaId`, nunca uma reestruturação do array em sub-arrays), e toda a UI (botões "Iniciar"/"Gerar Automaticamente", lista reordenável, botão "Atualizar") passou a nascer **dentro do accordion de cada Área Marcada**, ao lado dos subaccordions de categoria de specs (item 7). Itens legados sem `a11yAreaId` (ou cuja área foi excluída) caem no bucket "Sem área" — mesmo padrão visual do bucket de specs órfãs (`_a11ySemAreaAccordionEl`), só como vitrine read-only, sem botões de criação (não há área real pra escopar clique manual ou varredura).

**Arquivos e blocos afetados.**
- `src/plugin/modules/core.js` — array de estado `tabOrderItems`, `handoffData.tabOrderItems`, `removeTabOrderItemById`, inicialização em `addFrame`, merge em `syncAndRenderSpecs`, desligamento do modo ao navegar (`navigate`). Sem mudança estrutural na reformulação — `tabOrderItems` continua uma lista solta só, agora com `a11yAreaId` por item.
- `src/plugin/modules/design-data.js` — limpeza de `tabOrderItems` no reset de dados.
- `src/plugin/code.js` — listener compartilhado de `selectionchange` (`_tabOrderModeActive`), handlers `start-tab-order-mode`/`stop-tab-order-mode`/`create-tab-order-item`/`generate-tab-order-from-layers`/`renumber-tab-order-items`, `_createTabOrderBadge` (função compartilhada pelos 2 fluxos de criação, agora com parâmetro `areaId` — só ecoado no item retornado como `a11yAreaId`, não influencia o desenho no canvas), `A11Y_ITEM_NUMBER_KEYS`. Handlers `create-tab-order-item`/`generate-tab-order-from-layers` repassam `msg.areaId`.
- `src/plugin/modules/messages.js` — roteamento de `tab-order-selection-changed`/`tab-order-item-created`/`tab-order-generated-from-layers`/`tab-order-renumbered`.
- `src/plugin/modules/accessibility.js` — bloco grande no fim do arquivo (marcador `a11y-ordem-tabulacao-por-area`): `window._tabOrderActiveAreaId` (área escopada do modo de clique manual ativo), `toggleTabOrderMode(areaId, btnEl)`/`handleTabOrderSelectionChanged`/`_currentTabOrderItems(areaId)` (filtra por área, aceita sentinel `'__sem_area__'`)/`addTabOrderItem`/`_confirmGenerateTabOrderFromLayers(areaId, targetNodeId)` (chamado direto do accordion, sem modal)/`addTabOrderItemsFromLayers`/`_renderTabOrderListForArea(areaId, containerEl)` (substitui a antiga `renderTabOrderList()` única e global)/`_tabOrderDrag*`/`updateTabOrderNumbering(areaId)`/`deleteTabOrderItem`. Também: `_tabOrderSectionHtml(uid, area)` (markup reaproveitado por `_a11yAreaAccordionEl` e `_a11ySemAreaAccordionEl`) e ajuste em `renderA11yGroupedList` para popular cada `<ul>` de tab order depois de inserir o accordion no DOM. `openGenerateTabOrderModal`/`confirmGenerateTabOrderFromLayers`/`closeGenerateTabOrderModal` (modal de escolha de área) foram **removidas** — obsoletas, já que cada botão nasce escopado à área do próprio accordion.
- `src/plugin/views/specifications.html` — seção fixa "Ordem de Tabulação" (`#tab-order-results`, `#tab-order-count`, `#btn-tab-order-toggle`, `#btn-tab-order-generate`, `#hint-tab-order`, `#btn-tab-order-update`) **removida inteiramente**; a UI agora nasce dinamicamente dentro de cada accordion de área (`_tabOrderSectionHtml`, accessibility.js).
- `src/plugin/views/modals.html` — `#tab-order-generate-area-modal` **removido** (modal de escolha de área obsoleto).

**Dependências que a main não tem hoje.** Nenhum arquivo de dados novo — usa as mesmas keys de componente já catalogadas em `a11y-marcar-area` (`A11Y_ITEM_NUMBER_KEYS` reaproveita literalmente as 5 keys de `A11Y_AREA_CONECTOR_KEYS`). **Migrar `a11y-marcar-area` antes** (ou junto) — e também `a11y-subaccordions` (item 7), já que a seção de Ordem de Tabulação agora vive ao lado dos subaccordions de categoria dentro do mesmo accordion de área (`_a11yAreaAccordionEl`).

**O que verificar/adaptar ao migrar.** O filtro de canvas em `delete-canvas-content` (código.js) precisa reconhecer o prefixo `[TabOrder` — isso está marcado sob `apagar-tudo` (item 9), mas é uma dependência cruzada real: sem essa linha, "Apagar dados do canvas" não vai limpar os selos de Ordem de Tabulação. Migrar os dois juntos ou confirmar que a linha já foi portada. Ao portar, note que `renderTabOrderList()` não existe mais como função global — qualquer chamador externo ao bloco (havia dois: `switchSpecsMainTab` em `specifications.js` e `syncAndRenderSpecs` em `core.js`) deve ser removido, já que `renderA11yGroupedList()` sozinha já cobre a re-renderização da seção de tab order de cada área.

**Risco de migração:** médio-alto. Feature nova e extensa, com acoplamento novo à estrutura de accordion de área (item 7) que não existia na primeira versão — migrar os dois juntos, não a `a11y-ordem-tabulacao-por-area` isolada.

---

## 6. `a11y-layout-colunas`

**O que é.** Specs de a11y vinculadas a uma Área Marcada passam a se organizar em sub-colunas por categoria dentro do espaço da área (mesma área + mesma categoria empilham na mesma coluna X; categorias diferentes da mesma área abrem colunas lado a lado). Antes o agrupamento era só por área, sem diferenciar categoria dentro dela.

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — bloco `_areaColKey`/`_areaMap`/`_areaRightmostOtherCategory` dentro do handler `create-unified-spec`, e o uso desses valores no cálculo de `targetX`/`targetY`.
- `src/plugin/modules/accessibility.js` — `_collectAreaSiblingSpecIds`/`_collectAreaAllSpecIds` (calculam `opts.existingAreaSpecIds`/`opts.existingAreaAllSpecIds` enviados pelo frontend), usados em `confirmA11ySpec` e no lote (`confirmA11yBatchGenerate`, item 4).

**Dependências que a main não tem hoje.** Nenhuma além de "Marcar Área"/specs de a11y com `a11yAreaId` já existirem em `main` (pré-requisito lógico).

**O que verificar/adaptar ao migrar.** Migrar junto com `a11y-deteccao-automatica` (item 4) — o lote automatizado depende diretamente deste cálculo de posicionamento.

**Risco de migração:** médio. Lógica de posicionamento geométrico pura, sem UI própria, mas fácil de quebrar silenciosamente (specs se sobrepondo) se só parte do cálculo for portada.

---

## 7. `a11y-subaccordions`

**O que é.** Dentro de cada Área Marcada na listagem, as specs agora se agrupam em subaccordions por categoria (Elementos/Estrutura/Título/Decorativo/Informações), em vez de aparecerem todas juntas.

**Arquivos e blocos afetados.**
- `src/plugin/modules/accessibility.js` — `_a11yCategoryAccordionEl` (função nova) e o trecho de `_a11yAreaAccordionEl` que a chama, substituindo o antigo `areaSpecs.map(_a11ySpecItemHtml)` direto.

**Dependências que a main não tem hoje.** Nenhuma.

**O que verificar/adaptar ao migrar.** Depende de `A11Y_CATEGORIES` (já pré-existente) para ordenar/rotular as categorias. Sem dependência de dados novos.

**Risco de migração:** baixo. Puramente de apresentação (render), fácil de isolar.

---

## 8. `specs-busca-filtro`

> ⚠️ **Ponto de atenção.** O usuário suspeita que `main` já tem uma versão desta feature mais evoluída do que a implementada aqui na beta. **Antes de migrar: comparar com o estado atual em `main` em vez de assumir que este é o ponto de partida — não sobrescrever uma versão mais madura com a da beta.**

**O que é.** Barra de busca por texto + filtro por categoria nas duas listagens (aba Specs normais e aba Acessibilidade). Filtro é só de exibição (não persiste, não altera `createdSpecs`/`a11ySpecs`), reseta ao trocar de aba ou navegar pra fora da view.

**Arquivos e blocos afetados.**
- `src/plugin/modules/specifications.js` — bloco `_resetSpecsSearchInputs`/`_normalizeSearchText`/`_setupSpecsSearchBar`/`applySpecsSearchFilter`/`applySpecsCategoryFilter`/`_applySpecsFilters`, e `data-spec-group`/`data-spec-category`/`data-spec-search` no render de specs.
- `src/plugin/modules/accessibility.js` — `_setupA11ySearchBar`/`applyA11ySearchFilter`/`applyA11yCategoryFilter`/`_applyA11yFilters`, e `data-a11y-area`/`data-a11y-area-search`/`data-a11y-spec-item`/`data-a11y-category`/`data-a11y-search` no render.
- `src/plugin/modules/core.js` — chamada de `_resetSpecsSearchInputs` em `navigate`.
- `src/plugin/views/specifications.html` — `#specs-search-bar`/`#specs-search-input`/`#specs-category-filter`/`#specs-search-empty` e os equivalentes `#a11y-*`.

**Dependências que a main não tem hoje.** Nenhuma — usa `_normalizeSearchText` que é definida uma vez em `specifications.js` e reaproveitada por `accessibility.js` (ordem de carregamento no bundle importa: `specifications.js` precisa vir antes de `accessibility.js`, ou `_normalizeSearchText` precisa ser duplicada/movida).

**O que verificar/adaptar ao migrar.** Confirmar a ordem de concatenação dos módulos no `build.cjs` de `main` — se a ordem for diferente da beta, `_normalizeSearchText` pode não estar definida ainda quando `accessibility.js` roda.

**Risco de migração:** baixo.

---

## 9. `finalizar-registros-condicional`

> ⚠️ **Ponto de atenção.** O usuário suspeita que `main` já tem uma versão desta feature mais evoluída do que a implementada aqui na beta. **Antes de migrar: comparar com o estado atual em `main` em vez de assumir que este é o ponto de partida — não sobrescrever uma versão mais madura com a da beta.**

**O que é.** O botão "Finalizar Registros" (já existente em `main`, sempre visível) passa a só aparecer quando há dado registrado naquela tela — evita "finalizar" um trabalho que nem começou.

**Arquivos e blocos afetados.**
- `src/plugin/modules/handoff.js` — `_updateFinalizeVisibility` (função nova).
- `src/plugin/modules/core.js` — chamadas em `saveToStorage`/`navigate`.
- `src/plugin/views/handoff.html`/`flows.html`/`measurement.html`/`specifications.html` — `id="finalize-wrap-*"` + classe `hidden` inicial nos wraps dos botões.

**Dependências que a main não tem hoje.** Nenhuma — mas o toggle de `#btn-resync-flows` dentro de `_updateFinalizeVisibility` pertence à feature `flows-mini-mapa-conector-criacao` (item 13); se migrar `finalizar-registros-condicional` sem essa feature, remover essa linha do toggle (ou deixar o `getElementById` retornar `null` e o `if` não fazer nada — já é seguro, mas o botão nunca existirá).

**O que verificar/adaptar ao migrar.** Confirmar que **memória do usuário já registra** que "paridade main→beta portada antes" (4 botões Finalizar + 4 modais) foi commitada como `931febe` — isso pode já cobrir parcialmente esta feature em `main`. Verificar se `main` já tem os 4 wraps antes de assumir que é 100% novo.

**Risco de migração:** baixo.

---

## 10. `apagar-tudo`

**O que é.** Botão "Apagar Tudo (dados + canvas)" no modal de limpar dados, que combina as duas ações existentes (`confirmClearAllData` + `delete-canvas-content` com todos os 5 checkboxes marcados) num único clique. Inclui 2 correções: `tabOrderItems` não estava sendo limpo no reset de dados, e o filtro de canvas não reconhecia o prefixo `[TabOrder`.

**Arquivos e blocos afetados.**
- `src/plugin/modules/design-data.js` — `confirmClearEverything` (função nova).
- `src/plugin/views/modals.html` — botão "Apagar Tudo" no modal de limpar dados.
- `src/plugin/code.js` — linha do filtro de canvas em `delete-canvas-content` reconhecendo `[TabOrder`.

**Dependências que a main não tem hoje.** Depende de `a11y-ordem-tabulacao-por-area` (item 5) — sem essa feature, o bugfix do filtro `[TabOrder` não tem o que corrigir (mas também não quebra nada se migrado sozinho).

**O que verificar/adaptar ao migrar.** Nenhuma armadilha grande — reaproveita 100% de lógica já existente.

**Risco de migração:** baixo.

---

## 11. `label-automatico`

> ⚠️ **Ponto de atenção.** O usuário suspeita que `main` já tem uma versão desta feature mais evoluída do que a implementada aqui na beta. **Antes de migrar: comparar com o estado atual em `main` em vez de assumir que este é o ponto de partida — não sobrescrever uma versão mais madura com a da beta.**

**O que é.** O campo Label (accessibilityLabel) do formulário de "Elementos e Imagens" passa a ser pré-preenchido com o texto real do primeiro elemento de texto visível encontrado no elemento selecionado (em vez de ficar vazio), tanto no fluxo manual quanto no "Usar sugestão" da Detecção Automática.

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — `_findMainTextContent`, `mainText` ecoado em `get-selection-name`, handler novo `get-node-main-text`.
- `src/plugin/modules/messages.js` — `mainText` repassado em `selection-name`, handler `node-main-text`.
- `src/plugin/modules/accessibility.js` — `_fillA11yLabelIfEmpty`/`prefillA11yLabelFromMainText`, `mainText` como segundo parâmetro de `prefillA11yComponentName`.

**Dependências que a main não tem hoje.** Nenhuma.

**O que verificar/adaptar ao migrar.** `prefillA11yComponentName` ganhou um segundo parâmetro (`mainText`) — mudança de assinatura pública, confirmar chamadores em `main`.

**Risco de migração:** baixo.

---

## 12. Correções de bugs diversos (sem bloco dedicado — ver `bugfixes-a11y-diversos` acima para a parte de conectores)

Itens do pedido original que já estão cobertos por outras seções deste documento:
- "Spec não vinculada à área ao usar 'Usar sugestão'" → coberto em `a11y-deteccao-automatica` (item 4), função `useA11yDetection`.
- "Exclusão de área não excluía specs filhas em cascata" → coberto em `bugfixes-a11y-diversos` (item 2), função `deleteA11yArea`.
- "Tag sequencial 'K' em vez de 'A' no lote" → coberto em `a11y-deteccao-automatica` (item 4), função `_suggestNextA11yTagForArea`.

---

## 13. `flows-mini-mapa-conector-criacao`

> ⚠️ **Ponto de atenção.** O usuário suspeita que `main` já tem uma versão desta feature mais evoluída do que a implementada aqui na beta. **Antes de migrar: comparar com o estado atual em `main` em vez de assumir que este é o ponto de partida — não sobrescrever uma versão mais madura com a da beta.**

**Não estava na lista original do pedido — descoberto durante o mapeamento do diff real.** O usuário pediu para eu confirmar tudo via `git diff` em vez de confiar só na lista, e isto apareceu: uma feature completa de Fluxos de Tela implementada nesta mesma sessão.

**O que é.** O modal de criação de fluxo (Conectar Frames) ganha: (a) um mini-mapa SVG mostrando os 2 elementos selecionados e a linha de conexão em tempo real (atualiza ao vivo conforme a seleção muda no canvas); (b) seletor de estilo de linha (reto/curvo/esquinas) na CRIAÇÃO — antes esse controle só existia na edição de um fluxo já criado; (c) botão "Atualizar Fluxos" que recria em lote todos os fluxos salvos (útil quando os elementos de origem/destino foram movidos ou o desenho ficou desatualizado).

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — `_getFlowSelectionBoundsPayload` (payload do mini-mapa), listener compartilhado de `selectionchange` postando `flow-selection-bounds`, cálculo de `linePath`/`arrowAngle` em `_buildFlowConnection` (reto/curvo/esquinas), `_buildFlowConnection` passou a **retornar** `{ group, flow }` em vez de postar mensagem/notificar direto (mudança estrutural que afeta os 3 chamadores pré-existentes: `create-flow-connection`/`recreate-flow-connection`/`edit-spec-connector`), handlers novos `get-flow-selection-bounds`/`resync-all-flows`.
- `src/plugin/modules/messages.js` — roteamento de `flow-selection-bounds`/`flows-resynced`.
- `src/plugin/modules/specifications.js` — bloco do mini-mapa (`_computeFlowAnchorLayout`/`_flowRectEdgePoints`/`_flowNearestPoint`/`updateFlowAnchorPreview`/`_renderFlowAnchorPreview`/`_setFlowAnchorSide`), trecho de reset em `openFlowFormModal`, `connectorStyle`/`curvature` em `confirmFlowConnection`, `_updateCreateFlowCurvatureLabel`/`_onCreateFlowConnectorStyleChange`/`resyncAllFlows`.
- `src/plugin/views/modals.html` — `#flow-anchor-preview`/`#flow-anchor-svg`/`#flow-anchor-empty`, seção "Estilo da Linha" no modal de criação.
- `src/plugin/views/flows.html` — botão `#btn-resync-flows`.
- `src/plugin/modules/handoff.js` — toggle de visibilidade do `#btn-resync-flows` dentro de `_updateFinalizeVisibility` (acoplamento leve com o item 9).

**Dependências que a main não tem hoje.** Nenhum arquivo de dados novo.

**O que verificar/adaptar ao migrar.** A mudança de `_buildFlowConnection` (retornar em vez de postar/notificar direto) é a mais arriscada desta feature: **se `main` tiver essa função com a assinatura antiga (void, posta mensagem internamente), os 3 chamadores pré-existentes em `main` vão continuar funcionando old-style — só quebra se você colar o novo corpo da função sem atualizar os 3 chamadores junto**. Migrar a função e os 3 pontos de chamada como uma unidade só, nunca em partes.

**Risco de migração:** médio-alto, especificamente por causa da mudança de contrato de `_buildFlowConnection` (função interna, mas com 4 chamadores).

---

## 14. `ficha-atualiza-sem-duplicar`

> ⚠️ **Ponto de atenção.** O usuário suspeita que `main` já tem uma versão desta feature mais evoluída do que a implementada aqui na beta. **Antes de migrar: comparar com o estado atual em `main` em vez de assumir que este é o ponto de partida — não sobrescrever uma versão mais madura com a da beta.**

**Não estava na lista original — descoberto no diff.** "Gerar Ficha" detecta se já existe uma ficha do mesmo projeto no canvas e a substitui (herdando a posição x/y) em vez de criar uma nova ao lado. Mensagem de toast simplificada ("Ficha atualizada" em vez de "Nova versão X gerada ao lado").

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — `_hdFindExistingFicha` (função dedicada), lógica de detecção/remoção da ficha antiga antes de construir a nova, atalho que pula o cálculo de posicionamento/colisão quando é atualização.
- `src/plugin/modules/messages.js` — texto do toast em `handoff-complete`.

**Dependências que a main não tem hoje.** Nenhuma, mas **atenção à nota estrutural do topo deste documento**: `main` tem uma arquitetura `_hd*` de geração de ficha que a beta não usa da mesma forma — confirmar como `main` gera a Ficha antes de colar esta lógica; pode já ter mecanismo próprio de detectar "atualização" que só precisa ser adaptado, não substituído.

**Risco de migração:** médio, por causa da divergência estrutural já conhecida entre `main` e `beta` na geração de ficha.

---

## 15. `ficha-specs-avulsas-sem-frame` + `ficha-a11y-agrupada-por-area`

**Não estavam na lista original — descobertos no diff.** Dois ajustes na exportação da Ficha (canvas):
- `ficha-specs-avulsas-sem-frame`: a Ficha agora inclui specs (normais e de a11y) que nunca foram associadas a um frame — antes ficavam de fora silenciosamente porque a Ficha só olhava `frame.createdSpecs`/`frame.a11ySpecs`. Isso está relacionado à [memória do usuário sobre bug de resync de specs](bug_spec_resync.md) — a mesma duplicidade avulsa-vs-por-frame já vista em outros lugares do código.
- `ficha-a11y-agrupada-por-area`: a seção de a11y da Ficha agora agrupa specs por Área Marcada (espelhando o agrupamento que já existe na UI, `renderA11yGroupedList`), em vez de listar todas as specs de a11y linearmente.

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — ambos dentro do handler de geração de handoff/ficha: `_looseSpecs`/`_framesWithSpecs.push(...)` (seção 1.9), `_looseA11ySpecs`/`_looseA11yAreas`/`_framesWithA11y.push(...)` (seção 1.9b), `buildA11ySpecCard` extraída + loop por área (`aAreasBox`).

**Dependências que a main não tem hoje.** Nenhuma nova, mas **de novo a nota estrutural do topo**: confirmar contra a arquitetura `_hd*` de `main` antes de colar.

**O que verificar/adaptar ao migrar.** Migrar os dois juntos com `ficha-atualiza-sem-duplicar` (item 14) — as 3 mudanças vivem no mesmo handler grande de geração de ficha em `code.js`.

**Risco de migração:** médio, mesma razão do item 14.

---

## 16. `a11y-mapeamento-interativo`

Quatro correções pontuais no pipeline de detecção automática de a11y e na Ordem de Tabulação, todas confirmadas com dados reais antes de implementar.

**Achado 1 — bug de contagem no resumo `_meta.byShortName`.** `refs/build-dsc-a11y-mapping.cjs` só somava o bucket `alta` no agregado por shortName, escondendo famílias reais classificadas via sinônimo (`baixa`). Ex.: `inputs` aparecia zerado mesmo com 10 famílias reais em `baixaConfianca`. Corrigido para somar `alta` + `baixa`. Após correção, `byShortName.inputs` passou a refletir 16 famílias / 570 variantes. A classificação em si (bucket) já estava correta — só o resumo estava errado.

**Achado 2 — sinônimos faltando para `inputs`.** `[dsc] Select`, `[dsc] Select with Chips`, `[dsc] Range Slider`, `[dsc] Slider` existem na lib real mas caíam em `semMatch` por falta de sinônimo. Adicionados `'select'` e `'slider'` a `A11Y_SYNONYMS.inputs`. Confirmado depois de rodar o script que nenhuma família virou `inputs` por engano (nenhuma colisão indevida). `[dsc] Link` não existe na lib — lacuna real de biblioteca, não de código, não foi inventada correspondência.

**Achado 3 — imagens soltas nunca entravam na detecção de a11y.** O scan de tokens (`code.js`) não tinha categoria `images` — nodes com fill do tipo `IMAGE` nunca eram coletados em categoria nenhuma e nunca passavam pelo enriquecimento de a11y. Adicionado:
- Nova categoria `images` no loop de categorização de `extractSpecs` (checada ANTES das demais ramificações, pra manter categorização mutuamente exclusiva — um node com fill de imagem não também vira `vectors`/`components`/`icons`).
- `_resolveImageA11yMatch(node)` (mesmo padrão de `_resolveDecorativeA11yMatch`), retornando `{ containingFrame: null, a11yCategory: 'imagem', confidence: 'baixa', source: 'image-fill' }`. Confirmado contra o uso real em `accessibility.js` que `a11yCategory` é sempre o shortName (não a categoria macro) — `'imagem'` cai corretamente no branch `_buildA11yElementoPayload` dentro da categoria macro `elemento` ("Elementos e Imagens").
- Plugado no mesmo bloco de enriquecimento do scan, como mais um `else if` para `category === 'images'`.
- `specs.images` (Map), `frameJson.elements.images` (`audit.js` → `frameJsonTemplate`), `prepareListWithPreviews(specs.images)` e `images: formatMap(specs.images)` no `postMessage` final — replicando o padrão das demais categorias.

**Correção tardia (sessão seguinte).** `_collectA11yDetections` (`accessibility.js`) — a função que agrega os buckets do scan pra alimentar a Detecção Automática — não tinha sido atualizada junto com o Achado 3: agregava só `components`/`icons`/`typography`/`vectors`, faltando `images`. Ou seja, imagens já eram capturadas corretamente pelo scan (Achado 3) mas nunca apareciam na Detecção Automática de a11y. Corrigido incluindo `...(data.images || [])` no array agregado.

**Achado 4 — geração automática de Ordem de Tabulação não filtrava por interatividade real.** `generate-tab-order-from-layers` (`code.js`) coletava qualquer `INSTANCE`/`COMPONENT`, sem diferenciar componente interativo de decorativo/layout/imagem — contrariando o texto da lib "Design Acessível" ("links, botões e campos de formulário"). Corrigido:
- Nova constante `A11Y_INTERACTIVE_SHORTNAMES` (Set): `button`, `checkbox`, `radio button`, `switch`, `inputs`, `paginator`, `stepper`, `tab group`, `accordion`, `breadcrumb`. Decisão própria de escopo (autorizada pelo enunciado da tarefa): `dialog`, `snackbar`, `table`, `listas`, `imagem` ficam de fora — não são o elemento focável em si (ou nunca são focáveis).
- `_walk` (antes síncrona) virou `async`, com `await` em cada recursão — resolve `componentKey` via `getMainComponentAsync()` (INSTANCE) ou `child.key` (COMPONENT) e só empurra pra `collected` se `_resolveDscComponentA11yMatch(componentKey)?.a11yCategory` estiver no Set. Se não for interativo, o componente inteiro é ignorado (nem ele nem os filhos entram) — preserva a regra pré-existente de "não descer dentro de uma unidade já avaliada".
- Mensagem de erro existente em `addTabOrderItemsFromLayers` (`accessibility.js`, "Nenhum elemento interativo (instância ou componente) encontrado dentro dessa área.") já cobre `collected.length === 0` corretamente — nenhuma mudança de texto necessária.

**Arquivos e blocos afetados.**
- `src/plugin/refs/build-dsc-a11y-mapping.cjs` — `A11Y_SYNONYMS.inputs`, loop de `byShortName` em `main()`.
- `src/plugin/refs/dsc-component-a11y-mapping.json` — regenerado (não editado à mão).
- `src/plugin/code.js` — `_resolveImageA11yMatch`, `A11Y_INTERACTIVE_SHORTNAMES`, categorização em `extractSpecs`, bloco de enriquecimento do scan, `specs`/`prepareListWithPreviews`/`postMessage` do handler `scan-frame`, `_walk` async em `generate-tab-order-from-layers`.
- `src/plugin/audit.js` — `frameJsonTemplate` (`elements.images`).

**Dependências que a main não tem hoje.** As mesmas do bloco de a11y como um todo (`_resolveDscComponentA11yMatch`, `refs/dsc-component-a11y-mapping.json`, `REF_SKELETON`) — ver itens anteriores deste documento, especialmente a seção de `a11y-deteccao-automatica`.

**Risco de migração:** baixo-médio. Os achados 1/2 são isolados ao script gerador (sem risco pro plugin em si). Os achados 3/4 tocam o handler de scan e o de Ordem de Tabulação — migrar junto com o restante do bloco de a11y (não em isolado, pela mesma razão estrutural do topo deste documento).

---

## 17. `a11y-ordenacao-espacial`

A listagem agrupada de a11y (`renderA11yGroupedList`, dentro de cada Área Marcada) ordenava as specs alfabeticamente pela tag (`letter`: A, B, C...), que reflete ordem de CRIAÇÃO da spec, não a ordem real de leitura de tela (esquerda→direita, cima→baixo — mesmo padrão já usado na Ordem de Tabulação). Decisão de produto confirmada: a mudança é só na ordem de EXIBIÇÃO da listagem — tags/selos no canvas não são recalculados nem tocados.

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — novo handler `resolve-nodes-bounds`: recebe `{ ids: string[] }`, resolve cada id via `figma.getNodeByIdAsync` em paralelo (`Promise.all`) e responde `{ type: 'nodes-bounds-resolved', bounds: { [id]: {x,y} | null } }`. Consulta pura — sem seleção, scroll ou notificação.
- `src/plugin/modules/accessibility.js` — `window._a11yNodeBoundsCache` (cache em memória, não persiste entre sessões), `A11Y_SPATIAL_ROW_THRESHOLD` (24px), `_a11ySortSpecsSpatially` (substitui os dois `.sort(...)` por `letter`/`localeCompare` dentro de `renderA11yGroupedList` — um para `areaSpecs`, outro para `semArea`), `_a11yQueueBoundsResolution` (coleta `targetNodeId` ainda não cacheados de todas as specs visíveis e dispara `resolve-nodes-bounds`; chamada ao final de `renderA11yGroupedList`).
- `src/plugin/modules/messages.js` — roteamento de `nodes-bounds-resolved`: mescla a resposta no cache e re-renderiza `renderA11yGroupedList()`.

**Decisões tomadas sem confirmação explícita da vertical (documentar se for revisitar).**
- Threshold de "mesma linha de leitura": 24px, escolhido sem dado da vertical de a11y — cobre a maioria dos selos/cards pequenos do canvas sem juntar linhas genuinamente distintas.
- Disparo da consulta de bounds: ao final de toda renderização de `renderA11yGroupedList` (não só na entrada da aba/criação de spec) — mais simples e cobre naturalmente qualquer cenário que possa ter mexido em posição, à custa de uma checagem extra de "já está em cache" a cada render (barata, é só um filtro em memória).
- Fallback: se o bounds de qualquer um dos dois lados da comparação ainda não foi resolvido (ou o node não existe mais, ex. deletado manualmente), cai pro comparador alfabético antigo (`letter`/`localeCompare`) só para aquele par — evita reordenação instável enquanto a consulta está em voo.

**Dependências que a main não tem hoje.** As mesmas do bloco de a11y como um todo (`a11yAreas`, `a11ySpecs`, `targetNodeId` por spec, `renderA11yGroupedList`) — migrar junto com o restante do bloco de a11y.

**Risco de migração:** baixo. Mudança isolada a ordenação de exibição; não altera schema salvo (`targetNodeId` já existia), não altera canvas, não altera contrato de nenhum handler pré-existente.

---

## 18. `a11y-injecao-em-massa`

O botão individual "Usar sugestão" por item detectado (fluxo de confirmação item a item antes de criar) foi REMOVIDO. O único caminho de criação a partir da Detecção Automática pós-Marcar-Área passou a ser o lote ("Gerar Handoff Automatizado", já existente desde `a11y-deteccao-automatica`) — que já cria todas as specs elegíveis de uma vez (alta e baixa confiança). Itens de baixa confiança, uma vez criados, ganham uma tag/badge "Verificar" visível no card já renderizado na listagem principal — clicável, leva direto pra edição da spec (`editA11ySpec`).

**Arquivos e blocos afetados.**
- `src/plugin/modules/accessibility.js` — `itemHtml` (dentro de `handleA11yPostAreaDetectionResult`) perdeu o `<button onclick="useA11yDetection(...)">`, item da lista de resultado ficou só informativo. Função `useA11yDetection` removida inteira (não deixada morta) — era o único chamador de `get-node-main-text`/`prefillA11yLabelFromMainText` (ver nota abaixo). `confirmA11yBatchGenerate` — cada item do loop calcula `needsReview = item.dscComponentMatch.confidence !== 'alta'` e inclui no `opts` enviado a `create-unified-spec`. `_a11ySpecItemHtml` — novo badge "Verificar" (ícone `alert-triangle`, estilo âmbar) renderizado quando `spec.needsReview === true`, ao lado do badge de categoria já existente.
- `src/plugin/code.js` — handler `create-unified-spec`: objeto `spec` retornado em `spec-created` ganhou `needsReview: !!opts.needsReview` (ecoa o campo, mesmo padrão de `letter`/`color`/`category`). Specs criadas fora do lote nunca enviam `opts.needsReview` — cai em `false` por padrão, sem exigir o campo em nenhum outro ponto de criação.

**Nota — dead code introduzido por esta mudança (não removido, sinalizado).** `get-node-main-text` (handler em `code.js`), o roteamento em `messages.js` e `prefillA11yLabelFromMainText` (`accessibility.js`) — toda a cadeia de "buscar o texto do nó sugerido pra pré-preencher o Label" — ficaram inalcançáveis: `useA11yDetection` era o único disparador de `parent.postMessage({type: 'get-node-main-text', ...})` no frontend, e não existe mais. Mantidos por ora (fora do escopo desta mudança limpar), candidatos a remoção numa passada de limpeza futura — ou a um novo disparador, se o pré-preenchimento de Label a partir da sugestão detectada for reintroduzido de outra forma. Ver também `label-automatico` (item 11) — feature relacionada, já marcada como "ponto de atenção" (possivelmente mais evoluída em `main`).

**Dependências que a main não tem hoje.** As mesmas do bloco de a11y como um todo — migrar junto com `a11y-deteccao-automatica` (item 4), que é pré-requisito direto (o lote que esta mudança torna único caminho já existe lá).

**O que verificar/adaptar ao migrar.** Se `main` ainda tiver o fluxo individual "Usar sugestão" antigo (de uma versão anterior a esta mudança), a remoção do botão + função precisa ser reaplicada — não é só copiar `confirmA11yBatchGenerate`/`_a11ySpecItemHtml` novos, é também DELETAR o botão/função antigos, senão os dois caminhos coexistem de novo em `main`.

**Risco de migração:** baixo-médio. Mudança de fluxo (remove uma opção de UI), não de dado — mas precisa ser migrada como unidade (remoção do botão antigo + badge novo + campo `needsReview`), não em partes.

---

## 19. `a11y-toggle-visibilidade-tipo`

Dois atalhos novos de "ocultar/mostrar tudo de uma vez" por TIPO de marcação no canvas, independentes do toggle por item já existente (`toggleA11ySpecVisibility`): um pra todas as specs de leitor de tela (áreas marcadas + cards de a11y) e outro só pros selos de Ordem de Tabulação — permite alternar a visualização do canvas conforme o que o designer estiver documentando no momento, sem os dois tipos competirem visualmente.

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — novo handler `toggle-a11y-category-visibility`, recebe `{ category: 'specs'|'tabOrder', visible: boolean }`. Localiza a Section `A11Y_SECTION_NAME` e alterna `.visible` dos filhos que batem o critério: `isTabOrder` (nome com prefixo `[TabOrder`) vs `isA11ySpec` (tudo que não é tab order E tem `handexCategory === 'a11y'` via `getPluginData`, com fallback pro prefixo de nome `[SpecA11y`/`[A11yArea` se a pluginData não estiver setada). Mesma distinção por prefixo que `delete-canvas-content` já usa — reaproveitada, não duplicada com lógica nova. Responde `{ type: 'a11y-category-visibility-toggled', category, visible, changed }`.
- `src/plugin/modules/accessibility.js` — `toggleAllA11ySpecsVisibility`/`toggleAllTabOrderVisibility` (estado local efêmero `_a11ySpecsHiddenAll`/`_a11yTabOrderHiddenAll`, não persiste entre sessões — clique otimista, atualiza ícone/label do botão antes da resposta do backend), `_setA11yCategoryToggleBtnState`.
- `src/plugin/modules/messages.js` — roteamento de `a11y-category-visibility-toggled`: só usado pra avisar o designer quando `changed === 0` (nada encontrado no canvas pra esse tipo) — o resto do feedback visual já é otimista no clique.
- `src/plugin/views/specifications.html` — dois botões nas Áreas Marcadas (`#btn-hide-all-a11y-specs`/`#btn-hide-all-tab-order`), mesmo padrão visual de `#btn-hide-all-measures` (`views/measurement.html`).

**Dependências que a main não tem hoje.** `A11Y_SECTION_NAME`/Section dedicada de Acessibilidade (pré-requisito lógico, já deve existir em `main` de sessões anteriores). Depende de `a11y-ordem-tabulacao-por-area` (item 5) pro filtro `tabOrder` fazer sentido (senão não há selos `[TabOrder` pra alternar).

**Risco de migração:** baixo. Aditivo, não altera nenhum handler/contrato pré-existente — só lê `.visible`/`getPluginData` de nodes já existentes na Section.

---

## 20. `a11y-inferencia-variante-lote`

Fase 1 de um pedido maior do designer de "mapeamento profundo" entre características reais do componente DSC detectado no canvas e os parâmetros de a11y da lib "Design Acessível". Investigação concluiu que a varredura já é profunda o suficiente (mesma função recursiva do scan de tokens) e que os toggles de a11y (Nome Acessível/Observações/Notas de Código) são decisões textuais puras do designer, sem correspondência automática possível — não há o que inferir aí. O único cruzamento viável com dado já disponível e sem heurística arriscada: pré-selecionar a variante secundária ("tipo") no `<select>` de "Elementos e Imagens" durante o lote de "Gerar Handoff Automatizado", a partir das variantes REAIS do componente DSC (`item.variants`, já vinha do scan — nenhuma mudança de backend foi necessária).

Cobre só 3 pares de correspondência clara e confirmados contra a lib real: Button `state=disabled` → a11y `'desabilitado'`; Button `icon only=true` → a11y `'de icone'` (com precedência de `desabilitado` quando os dois sinais coexistem — estado é mais crítico que variação visual); Inputs `state=readonly` → a11y `'somente leitura'`. Nenhum outro componente (`checkbox`, `radio button`, `switch`, etc.) foi mapeado — os `variantOptions` deles descrevem presença de rótulo/agrupamento, não estado, e não há como inferir isso com segurança a partir das variantes do DSC; continuam caindo no default do catálogo, como antes.

**Arquivos e blocos afetados.**
- `src/plugin/modules/accessibility.js` — nova função `_inferA11yVariantFromDsc(shortName, itemVariants)`, comparação case-insensitive/trim de `name`/`value` (`item.variants` já vem com `name` limpo de sufixo `#id`, mas o case original do Figma não é garantido). `confirmA11yBatchGenerate` passa `{ tipo: _inferA11yVariantFromDsc(shortName, item.variants) || undefined }` para `_buildA11yElementoPayload` em vez do `{}` fixo anterior — `undefined` (não `null`) preserva o fallback pro defaultValue do catálogo já existente quando não há correspondência.
- Nenhuma mudança em `code.js` — `item.variants` já chegava pronto no payload da detecção (`extractNodeProperties`/`addElement`), consumido só no frontend.
- `_prefillA11ySpecForEdit`/`_restoreA11yElementoVariant` (edição de spec já criada) já liam `spec.a11ySubtype.tipo` antes desta mudança — nenhum ajuste necessário ali, a spec criada pelo lote com `tipo` inferido é indistinguível de uma criada manualmente com o mesmo valor.

**Decisões tomadas sem pedido explícito (documentar se for revisitar).** A comparação usa `name`/`value` normalizados (`.trim().toLowerCase()`) por segurança, já que o formato exato de capitalização das variantes no arquivo Figma real (`"state"` vs `"State"`) não foi reconfirmado nó a nó antes da implementação — os pares de valor (`disabled`, `readonly`, `true`) seguem a convenção documentada em `refs/_skeleton.json` → `componentsDetailed`.

**Fora de escopo (trabalho futuro, decisão explícita do designer).** O restante do "mapeamento profundo" pedido originalmente — inferência automática dos toggles reais (Nome Acessível/Observações/Notas de Código) e expansão da tabela de correspondência pra mais componentes (`checkbox`, `radio button`, `switch`, etc.) — ficou fora desta fase por não ter correspondência clara ou viável hoje. Não implementar sem novo material da vertical de a11y confirmando semântica de estado desses componentes.

**Dependências que a main não tem hoje.** As mesmas do bloco de a11y como um todo (`a11y-deteccao-automatica`, item 4) — `item.variants`/`item.dscComponentMatch` só existem no payload do scan quando esse bloco já está migrado.

**Risco de migração:** baixo. Mudança aditiva e isolada a uma função nova + um call site; não altera schema salvo, não altera contrato de nenhum handler, comportamento padrão (sem correspondência) idêntico ao anterior.

---

## 21. `a11y-fixes-pos-teste`

Quatro correções pontuais reportadas pelo designer após teste da build mais recente — sem mudança de schema, aditivas ou de ajuste de comportamento já existente.

**(a) Loading no lote de Detecção Automática.** `confirmA11yBatchGenerate` fechava `#a11y-batch-summary-modal` (resumo) de imediato mas deixava `#a11y-post-area-detect-modal` (Detecção Automática) aberto e sem feedback durante todo o loop sequencial de criação (`await _createA11ySpecAndWait` por item, pode levar vários segundos em lotes grandes) — parecia travado. Agora o loop troca o modal pro mesmo estado visual de loading já usado durante a varredura inicial (`#a11y-post-area-loading`, reaproveitado — não duplicado), só com o texto trocado para "Criando especificações…" (evita sugerir que ainda está escaneando). `openA11yPostAreaDetectModal` reseta o texto de volta a "Detectando componentes…" ao reabrir o modal do zero, pra não vazar o texto de uma rodada de lote anterior pra próxima varredura.

**(b) Profundidade do scan (8 → 16 níveis).** `extractSpecs(n, depth)` em `code.js` cortava a recursão em `depth > 8`, raso demais pra telas bancárias reais (sidebar + conteúdo com cards/seções aninhadas), fazendo o scan "esquecer" elementos legítimos nos níveis mais profundos. Limite dobrado para `depth > 16`. Afeta os dois scans que usam essa função (tokens normal e Detecção Automática de a11y — mesmo código, só o `origin` no payload difere o roteamento da resposta).

**(c) Ordem de tabulação automática por posição espacial.** O handler `generate-tab-order-from-layers` (`code.js`) coletava elementos interativos em `collected` na ordem de camadas/z-order do Figma (ordem de `n.children`) e numerava direto nessa ordem bruta — nunca respeitava o fluxo de leitura ocidental (esquerda→direita, cima→baixo) que o designer já tinha pedido antes. Agora `collected` é reordenado por `absoluteBoundingBox` (mesmo campo já usado no loop de numeração) imediatamente após `_walk` terminar de coletar, com um comparador espacial equivalente ao que já existe no FRONTEND para a listagem de specs (`_a11ySortSpecsSpatially`/`A11Y_SPATIAL_ROW_THRESHOLD`, sub-feature `a11y-ordenacao-espacial`, `accessibility.js`) — mesma tolerância de 24px pra considerar dois elementos "na mesma linha" antes de desempatar por `y` e cair no desempate final por `x`. Implementado como constante local `TAB_ORDER_SPATIAL_ROW_THRESHOLD` no backend (não importa a constante do frontend — são bundles/escopos JS separados), mas com o mesmo valor documentado em comentário.

**(d) Subaccordion recolhível pra Ordem de Tabulação.** A seção "Ordem de Tabulação" (`_tabOrderSectionHtml`) ficava sempre exposta dentro do body do accordion de Área/"Sem área", junto com os subaccordions de categoria de specs (`_a11yCategoryAccordionEl`) — pesado visualmente quando várias categorias estão abertas ao mesmo tempo. `_tabOrderSectionHtml` passou a gerar seu próprio header clicável com chevron (mesmo padrão visual/mecânica de `_a11yCategoryAccordionEl`: `id="tab-order-chevron-${uid}"` + corpo `id="tab-order-body-${uid}"` com classe `accordion-content`/`hidden`), controlado por `toggleA11yTabOrderAccordion(uid)` nova. Estado de expansão guardado num Set PRÓPRIO, `window._a11yExpandedTabOrderIds` (chaveado pelo `uid` do accordion pai) — deliberadamente separado de `window._a11yExpandedAreaIds`, pra expandir/recolher a seção de tab order de uma área não afetar o estado de expansão da própria área. Os três botões internos (`toggleTabOrderMode`, `_confirmGenerateTabOrderFromLayers`, `updateTabOrderNumbering`) ganharam `event.stopPropagation()` pra não disparar o toggle do header ao clicar neles — mesmo cuidado já usado nos botões de ação dentro do header de `_a11yAreaAccordionEl`. `_tabOrderSectionHtml` continua sendo a única função que gera o conteúdo (botões + `<ul>`), chamada sem alteração de assinatura por `_a11yAreaAccordionEl` e `_a11ySemAreaAccordionEl` — o `ulId` (`tab-order-list-${uid}`) não mudou, então `_renderTabOrderListForArea` continua encontrando o container normalmente mesmo com o body do accordion recolhido (`getElementById` funciona em elementos ocultos por CSS).

**Arquivos e blocos afetados.**
- `src/plugin/modules/accessibility.js` — `confirmA11yBatchGenerate` (loading), `openA11yPostAreaDetectModal` (reset do texto), `toggleA11yTabOrderAccordion`/`window._a11yExpandedTabOrderIds` (novos), `_tabOrderSectionHtml` (reescrita com wrapper de accordion).
- `src/plugin/code.js` — `extractSpecs` (limite de profundidade), handler `generate-tab-order-from-layers` (ordenação espacial de `collected` antes do loop de numeração).

**Decisões tomadas sem pedido explícito (documentar se for revisitar).** Nenhuma decisão de produto nova — os quatro pontos já vieram com causa raiz e direção de correção confirmadas pelo designer. Detalhe de implementação: o comparador espacial do backend foi escrito como função local inline (não importado do frontend, que roda em bundle/escopo JS separado), com a mesma tolerância de 24px documentada em comentário — se a vertical de a11y validar um valor diferente no futuro, os dois pontos (frontend `A11Y_SPATIAL_ROW_THRESHOLD` e backend `TAB_ORDER_SPATIAL_ROW_THRESHOLD`) precisam ser atualizados juntos.

**Dependências que a main não tem hoje.** As mesmas do bloco de a11y como um todo — `a11y-deteccao-automatica` (item 4, loading do lote), `a11y-ordem-tabulacao-por-area` (item 5, subaccordion e ordenação de tab order), `a11y-ordenacao-espacial` (comparador de referência no frontend).

**Risco de migração:** baixo. Todos os quatro pontos são ajustes de comportamento sobre código já existente na main (uma vez que os blocos-base acima estiverem migrados) — sem mudança de schema salvo, sem novo contrato de mensagem backend↔frontend.

---

## 22. `a11y-pular-listagem-deteccao`

Simplifica/substitui parte do comportamento descrito no item 4 (`a11y-deteccao-automatica`): o modal de Detecção Automática (`#a11y-post-area-detect-modal`) tinha 3 estados sequenciais (`ask` → `loading` → `result`), mas o estado `result` (listagem intermediária dos itens detectados) já não tinha nenhuma ação individual desde `a11y-injecao-em-massa` (item 18) — virou só um passo extra entre marcar a área e criar as specs. Testado e confirmado pelo designer: o estado `result` foi removido. O modal passa a ter só 2 estados visíveis (`ask`/`loading`); ao terminar a varredura, o fluxo pula direto pro resumo do lote (`openA11yBatchSummaryModal`, já existente) quando há ao menos 1 item elegível, ou fecha o modal com um toast informativo quando não há nada reconhecido.

**Arquivos e blocos afetados.**
- `src/plugin/modules/accessibility.js` — `handleA11yPostAreaDetectionResult` reescrita: não monta mais listagem HTML (funções locais `itemHtml`/`blockHtml`/`_a11yDetectionLabel` deletadas, sem outro chamador no arquivo). Agora só decide entre toast de "nada detectado" (com `closeA11yPostAreaDetectModal()`) ou abrir o resumo do lote. Pra não empilhar os dois modais visíveis ao mesmo tempo, mas também sem perder `window._a11yPendingDetectionArea` (usado por `openA11yBatchSummaryModal` pra pré-selecionar a área de origem no `<select>`, e zerado por `closeA11yPostAreaDetectModal`), a ordem é: abre o resumo do lote PRIMEIRO, depois fecha o modal de detecção via `closeModal('a11y-post-area-detect-modal')` direto (não o wrapper). `openA11yPostAreaDetectModal` e `confirmA11yBatchGenerate` perderam as referências mortas a `#a11y-post-area-result`/`#a11y-post-area-footer-result`. `confirmA11yBatchGenerate` agora precisa REABRIR `#a11y-post-area-detect-modal` (`openModal(...)`) antes de reaproveitar seu estado de loading como feedback de progresso do lote (ver item 21-a) — antes desta mudança o modal já ficava aberto por baixo do resumo o tempo todo, então esse reaproveitamento nunca precisava reabrir nada; agora que o modal é fechado de fato entre a detecção e o resumo, sem essa reabertura o loading do lote deixaria de aparecer (regressão silenciosa do item 21-a, evitada aqui).
- `src/plugin/views/modals.html` — `#a11y-post-area-detect-modal`: removidos `#a11y-post-area-result` (com `#a11y-post-area-result-empty`, `#a11y-post-area-result-found`, `#a11y-post-area-results-list`, `#btn-a11y-post-area-batch-generate`) e `#a11y-post-area-footer-result`. Modal fica só com `#a11y-post-area-ask` + `#a11y-post-area-loading` + `#a11y-post-area-footer-ask`.

**Decisões tomadas sem pedido explícito (documentar se for revisitar).** Texto do toast de "nada detectado" (`'Nenhum componente do DSC reconhecido nessa área — anote manualmente.'`) seguiu o tom/estrutura de toasts já existentes no mesmo arquivo (ex.: `'Nenhum elemento interativo (instância ou componente) encontrado dentro dessa área.'`) — não veio de pedido literal, só de convenção local.

**Dependências que a main não tem hoje.** As mesmas do bloco de a11y como um todo — depende de `a11y-deteccao-automatica` (item 4) e `a11y-injecao-em-massa` (item 18, que já tinha deixado o estado `result` sem ação nenhuma) estarem migrados primeiro.

**Risco de migração:** baixo. Simplificação de fluxo (remove um estado visual), sem mudança de schema salvo nem de contrato de handler backend↔frontend. Atenção só ao detalhe de reabertura do modal em `confirmA11yBatchGenerate` (ver acima) — se migrar por partes, não pular esse ajuste.

---

## 23. `a11y-marcar-area-unificado`

Substitui/simplifica parte do comportamento dos itens 4 (`a11y-deteccao-automatica`) e 22 (`a11y-pular-listagem-deteccao`): a escolha Automático vs Manual deixa de ser uma pergunta feita DEPOIS de marcar a área (2º modal separado, `#a11y-post-area-detect-modal` no estado `ask`) e passa a ser feita JUNTO, no próprio modal "Marcar Área" (`#a11y-area-modal`). Decisão de produto do designer: "se eu fiz a detecção automática, eu certamente vou querer criar as specs mapeadas; do contrário, eu faria manualmente" — não faz sentido separar as duas decisões em dois momentos.

**Fluxo final.** `#a11y-area-modal` ganhou um controle "Como documentar esta área?" com 2 opções em radio estilo segmented (`name="a11y-area-detect-mode"`, values `auto`/`manual`, `auto` pré-selecionado/recomendado), posicionado logo após o campo "Rótulo da área". `confirmA11yArea` lê o valor escolhido e inclui `autoDetect` (boolean) no payload de `create-a11y-area`. O backend (`create-a11y-area` em `code.js`) só ECOA esse campo de volta no objeto `area` de `a11y-area-created` — nenhuma lógica nova no backend. O roteamento em `messages.js` (handler `a11y-area-created`) passa a só chamar `openA11yPostAreaDetectModal(area)` quando `area.autoDetect` é truthy; em Manual não abre modal nenhum (a área já foi criada/expandida/renderizada normalmente — comportamento idêntico ao antigo "Agora não").

**Modal de Detecção Automática perde o estado de pergunta.** `#a11y-post-area-detect-modal` (que já tinha sido reduzido a `ask`/`loading` no item 22) perde também o `ask`: o estado `#a11y-post-area-ask` e o footer `#a11y-post-area-footer-ask` (botões "Agora não"/"Detectar") foram removidos do HTML. O modal passa a ter só o estado `loading`, sem footer e sem botão de fechar manual (é transitório — reaproveitado depois pro loading da criação do lote, igual já documentado no item 21-a). `openA11yPostAreaDetectModal` (accessibility.js) foi fundida com o disparo da varredura: abre o modal já no estado de loading e chama `runA11yPostAreaDetection()` na sequência, sem esperar clique nenhum. `runA11yPostAreaDetection` deixou de manipular visibilidade de estados (`ask`/`footerAsk` não existem mais) — só dispara o `postMessage` de scan.

**Arquivos e blocos afetados.**
- `src/plugin/views/modals.html` — `#a11y-area-modal`: novo bloco de radio `a11y-area-detect-mode` (2 opções, ícones `radar`/`pencil`). `#a11y-post-area-detect-modal`: removido estado `#a11y-post-area-ask` + footer `#a11y-post-area-footer-ask`; removido `onclick` de fechar no backdrop e o botão X do header (modal só fecha sozinho ao terminar o fluxo).
- `src/plugin/modules/accessibility.js` — `confirmA11yArea` (lê `a11y-area-detect-mode`, inclui `autoDetect` no payload); `openA11yPostAreaDetectModal` (abre direto em loading + chama `runA11yPostAreaDetection()`, sem esperar clique); `runA11yPostAreaDetection` (removida manipulação de `ask`/`footerAsk`, que não existem mais); `confirmA11yBatchGenerate` (removida referência morta a `ask`/`footerAsk` no trecho que reabre o modal pro loading do lote, ver item 21-a).
- `src/plugin/modules/messages.js` — handler `a11y-area-created`: `openA11yPostAreaDetectModal(area)` agora só é chamado se `area.autoDetect` for truthy.
- `src/plugin/code.js` — handler `create-a11y-area`: objeto `area` de retorno ganhou o campo `autoDetect: !!msg.autoDetect` (eco simples, sem lógica nova).

**Decisões tomadas sem pedido explícito (documentar se for revisitar).** (1) Controle visual escolhido: 2 radios em grid 2 colunas, mesmo padrão visual (`has-[:checked]`, `sr-only` + label clicável) já usado no seletor "Posição do conector" logo abaixo no mesmo modal — não um segmented control diferente. (2) `openA11yPostAreaDetectModal` e `runA11yPostAreaDetection` foram MANTIDAS como duas funções (não fundidas em uma só) — a primeira cuida de estado/UI do modal e chama a segunda, que só dispara o `postMessage`; a fusão seria só cosmética e quebraria a separação já usada em outros pontos do arquivo (ex. reabertura pro loading do lote em `confirmA11yBatchGenerate` não passa por `openA11yPostAreaDetectModal`).

**Dependências que a main não tem hoje.** As mesmas do bloco de a11y como um todo — depende de `a11y-marcar-area` (item de marcação de área em si), `a11y-deteccao-automatica` (item 4) e `a11y-pular-listagem-deteccao` (item 22) estarem migrados primeiro.

**Risco de migração:** baixo. Muda o momento da decisão Automático/Manual (de "depois" pra "junto"), mas não introduz schema novo — `autoDetect` é só um campo transiente no payload/resposta de `create-a11y-area`, não é persistido em `handoffData`. Atenção ao migrar por partes: se `a11y-deteccao-automatica`/`a11y-pular-listagem-deteccao` forem migrados sem este item, o comportamento correto é o modal de pergunta antigo (`ask`) — só migrar este item depois que os outros dois já estiverem na main.

---

## 24. `a11y-reducao-ruido-visual`

Três correções de ruído visual na seção "Áreas Marcadas" (aba Acessibilidade), reportadas pelo designer após teste da build mais recente. **Substitui o comportamento descrito no item 19 (`a11y-toggle-visibilidade-tipo`)** — os dois botões globais de "ocultar tudo" daquele item saem da seção e o handler de backend correspondente é removido; ver item 19 para o comportamento anterior que este item revoga.

**(a) Texto duplicado/competindo no topo da seção.** Havia dois textos explicativos em sequência dizendo praticamente a mesma coisa antes de qualquer conteúdo real aparecer: o parágrafo fixo abaixo do título "Áreas Marcadas" e o banner azul de dica (`#hint-a11y-areas`, visível só no estado sem áreas). Consolidado em um único parágrafo fixo, mais curto (`views/specifications.html`); o reforço para o estado vazio virou o snackbar do item (b), não mais um segundo bloco de texto permanente.

**(b) Banner de estado vazio virou snackbar.** `#hint-a11y-areas` era um `<div>` fixo no fluxo normal do documento, ocupando espaço permanente enquanto não havia nenhuma área marcada. Removido do HTML; `renderA11yGroupedList` (`accessibility.js`) agora dispara `showToast(...)` — o MESMO componente de toast já usado em dezenas de outros pontos do plugin (`#toast-container`, `showToast()` em `core.js`), não um sistema de notificação novo. **Decisão de timing tomada sem pedido explícito:** dispara só 1x por sessão do plugin (flag em memória `window._a11yEmptyAreasHintShown`, não persiste entre sessões) — a função é chamada toda vez que a lista é renderizada (criar/excluir spec, trocar de aba, etc.), e um toast a cada render seria irritante.

**(c) Botões de ocultar/mostrar viraram controle POR ÁREA — e depois viraram um switch de 3 posições.** Os botões globais `#btn-hide-all-a11y-specs`/`#btn-hide-all-tab-order` ficavam fixos no topo da seção e ocultavam/mostravam TUDO de uma vez, via handler `toggle-a11y-category-visibility` (`code.js`) que operava sobre a Section de Acessibilidade inteira no canvas, filtrando por prefixo de nome — sem nenhum vínculo com área específica (o canvas não guarda esse vínculo; só existe `handexCategory: 'a11y'` genérico). Removidos; a primeira versão substituiu por 2 botões independentes ("Ocultar Specs"/"Ocultar Ordem de Tabulação") escopados ao `a11yAreaId` de cada área. **Revisão (`a11y-switch-modo-visualizacao`), feita ainda na mesma rodada de trabalho após avaliação de UX:** os 2 botões independentes viraram um único segmented control de 3 posições — "Specs" / "Tabulação" / "Ambos" — por área, já que exigiam 2 cliques para sair de "specs visíveis" e chegar em "tab order visível", contra 1 clique do switch. Default por área (quando ainda não há entrada no mapa): `'specs'`, por ser o fluxo primário/mais frequente da vertical. Posicionamento mantido: linha discreta no início do body expandido, antes dos subaccordions de categoria — **decisão de posicionamento tomada sem pedido explícito, válida para as duas versões:** o cabeçalho do accordion já estava cheio (selo numerado, label, contagem, "Nova spec", "Focar", "Remover", chevron); inserir mais controles ali pioraria o próprio problema de ruído visual que esta sub-feature resolve.

**Arquivos e blocos afetados.**
- `src/plugin/views/specifications.html` — parágrafo único consolidado; `#hint-a11y-areas` e os botões `#btn-hide-all-a11y-specs`/`#btn-hide-all-tab-order` removidos.
- `src/plugin/modules/accessibility.js` — `renderA11yGroupedList`: remove a manipulação de `#hint-a11y-areas`, adiciona o `showToast` de 1x por sessão. **Versão atual (pós-revisão `a11y-switch-modo-visualizacao`):** função única `setAreaViewMode(areaId, mode)` (substitui as antigas `toggleAreaSpecsVisibility`/`toggleAreaTabOrderVisibility`, removidas, que por sua vez tinham substituído `toggleAllA11ySpecsVisibility`/`toggleAllTabOrderVisibility`) — valida `mode` em `['specs', 'tabOrder', 'ambos']` (default `'specs'`), grava em `window._a11yAreaViewMode[areaId]` (objeto em memória, substitui os antigos `window._a11yAreaSpecsHiddenIds`/`window._a11yAreaTabOrderHiddenIds`, dois Sets independentes), e recalcula explicitamente a visibilidade de AMBOS os tipos a cada chamada (`specsVisible = mode === 'specs' || mode === 'ambos'`; `tabOrderVisible = mode === 'tabOrder' || mode === 'ambos'`) — não é mais um toggle que inverte, é uma decisão absoluta por modo, já que qualquer um dos 3 modos pode tornar um tipo visível e o outro oculto ao mesmo tempo. Itera `a11ySpecs`/`_currentTabOrderItems(areaId)` filtrando por `a11yAreaId === areaId`, atualiza o campo `visible` local de cada item (mesmo padrão de `toggleA11ySpecVisibility`) e dispara `hide-node`/`show-node` (handlers singulares já existentes em `code.js`) um nó por vez, em loop — não um handler de "lote" novo no backend; ao final chama tanto `saveToStorage()` quanto `saveSpecsToStorage()` (as duas funções antigas usavam uma cada, a nova função afeta os dois tipos de dado sempre). `_a11yAreaAccordionEl`: os 2 botões antigos deram lugar a um segmented control de 3 opções (`role="group"`, `aria-pressed` na opção ativa), estilo pill compacto (`bg-gray-100`/`dark:bg-dark-line/40` no trilho, opção ativa com fundo branco/surface e texto `#0070AF`), inserido no mesmo ponto do body expandido.
- `src/plugin/modules/messages.js` — removido o bloco de roteamento de `a11y-category-visibility-toggled` (resposta do handler de backend revogado abaixo); sem handler de "lote" no backend, não há mais confirmação a tratar aqui.
- `src/plugin/code.js` — removido o handler `toggle-a11y-category-visibility` (órfão: sem chamador depois da mudança acima). `A11Y_SECTION_NAME` foi mantida — ainda usada por outros trechos do arquivo.

**Decisões tomadas sem pedido explícito (documentar se for revisitar).** (1) Texto final do parágrafo único: "Marque uma área da tela (selo numerado) e crie as especificações dentro dela, usando o botão "+" no cabeçalho de cada área." — versão enxuta do parágrafo fixo original, com a menção redundante a "de acessibilidade" removida (já estava implícito pelo contexto da aba). (2) Texto do snackbar: "As especificações de acessibilidade nascem dentro de uma área marcada." — deliberadamente não repete "toque em Marcar Área no topo" porque essa instrução já aparece, sempre visível, no próprio estado vazio da lista (`renderA11yGroupedList`, ícone de mapa-pin) por baixo do toast. (3) Gatilho do snackbar: qualquer render da lista sem áreas (não um hook dedicado de "abrir a aba pela primeira vez") — mais simples de implementar e correto na prática, já que a flag de sessão garante que só dispara uma vez independente de quantas vezes a lista for re-renderizada. (4) Posição dos botões por área: linha própria no topo do body expandido, não um menu "..." — o body já tem espaço vertical disponível e uma linha de texto é mais direta de entender do que um overflow menu, para um público de designers não-técnicos.

**Dependências que a main não tem hoje.** `a11y-marcar-area` (item 3, para a Área Marcada existir), `a11y-ordem-tabulacao-por-area` (item 5, para `_currentTabOrderItems(areaId)` e `_tabOrderSectionHtml` existirem), `a11y-subaccordions` (item 7, para `_a11yAreaAccordionEl` no formato atual). Revoga o item 19 (`a11y-toggle-visibilidade-tipo`) — se migrar por partes, não migrar o item 19 depois deste; se o item 19 já estiver na main, este item deve substituí-lo por completo (remover os artefatos do item 19 ao aplicar este).

**Risco de migração:** baixo. Não altera schema salvo (`visible` por spec/item já existia como campo local); não introduz contrato novo de mensagem backend↔frontend (reaproveita `hide-node`/`show-node` já existentes). Único ponto de atenção: remover o handler `toggle-a11y-category-visibility` só é seguro se o item 19 estiver sendo migrado/revogado junto — não deixar o handler órfão na main caso a ordem de migração seja diferente da recomendada.

---

## 25. `a11y-revisao-mapeamento-profundo`

Três correções pontuais no scan/detecção de a11y, investigadas e com causa raiz confirmada antes de implementar — nenhuma delas muda schema salvo nem contrato de mensagem novo.

**(a) Instâncias duplicadas descartadas do scan de a11y.** `addElement` (`code.js`) indexa o `Map` de resultados por `node.name` (nome da camada) — intencional pro scan de tokens normal, que agrega "tipos de elemento" repetidos numa única linha de conformidade (ex.: 6 instâncias de `[dsc] Alert` com o mesmo nome de camada viram 1 item + `Set` de camadas, pra não poluir a listagem). Só que isso descartava silenciosamente instâncias reais na Detecção Automática de a11y: se o designer tem várias instâncias de um componente com o MESMO nome de camada (comum quando não renomeadas individualmente), só a 1ª virava um item detectável (com `nodeId`/`dscComponentMatch` próprios) — as outras eram só incrementadas num `Set` de nomes sem uso prático de a11y. Confirmado que isso também explicava cards/títulos de página não escaneados (mesmo nome de camada que algo já visto antes no frame) e "só 1 de 6 alerts detectado". Corrigido SÓ para o caminho de a11y: quando `msg.origin === 'a11y-detection'`, a chave do `Map` passa a ser `node.id` (sempre único por node) em vez de `name` — cada instância real gera um item de detecção próprio. Fora desse origin (scan de tokens normal, usado pela aba "Escanear Tokens"), comportamento idêntico ao anterior — nenhuma mudança perceptível pra quem usa o scan de tokens.

**(b) Nível de título (H1-H6) nunca era inferido.** `_resolveTypographyA11yMatch` (`code.js`) só decidia SE um texto parecia título (via regex de nome de estilo/camada), nunca QUAL nível — sempre caía no default fixo H1 no formulário/lote. Nova função `_inferHeadingLevelFromTypography(styleName)` infere o nível a partir do TOKEN de tipografia real aplicado (nunca do nome da camada — nome não carrega tamanho/peso), cruzando com a escala real do DSC (`refs/_skeleton.json` → lib `fundamentos-visuais`, 39 tokens, formato `"categoria tamanho/peso (variante)"`): `display *` (qualquer tamanho) → H1; `heading huge`/`heading big` → H2; `heading large` → H3; `heading standard` → H4; `heading small` → H5; `heading tiny` → H6; `text *`/`link/*`/`caption *` → não infere (retorna `null`, mantém default H1) — mesmo que o NOME da camada/estilo tenha batido na regex de heading (falso positivo comum: camada chamada "Heading" com estilo de corpo aplicado), aplicar heading num texto de corpo seria semanticamente errado mesmo que o designer tenha nomeado de forma enganosa. Também retorna `null` quando não há `styleKey` aplicado (texto "solto"/customizado, sem token real do DSC) — sem dado pra inferir nada. `_resolveTypographyA11yMatch` ganhou o campo `suggestedLevel` no objeto retornado. No frontend, `_buildA11yTituloPayload` (`accessibility.js`) ganhou um 3º parâmetro `suggestedLevel`, usado como nível quando presente (fallback `'h1'` idêntico ao comportamento anterior); o chamador no lote (`confirmA11yBatchGenerate`) passa `item.dscComponentMatch.suggestedLevel`.

**(c) Revisão completa do Set de categorias "interativas" (Ordem de Tabulação).** `A11Y_INTERACTIVE_SHORTNAMES` (`code.js`) filtra quais componentes DSC reais viram candidatos a foco de teclado na geração automática de Ordem de Tabulação (`generate-tab-order-from-layers`). Bug confirmado: `'listas'` (cobre `[dsc] Menu item`/`[dsc] Menu Lateral`, ver `refs/dsc-component-a11y-mapping.json`) não estava no Set — itens de menu de navegação, que são links de navegação reais e genuinamente focáveis via Tab, nunca eram mapeados. **Adicionado `'listas'`.** Revisadas também as outras 4 categorias fora do Set (critério: "esse tipo de componente, quando existe como instância real no canvas, é algo que um usuário de teclado alcançaria com Tab?"):
- `'dialog'` — mantido FORA: o container do diálogo em si não é o alvo de foco; ações/botões internos (fechar, confirmar) já são instâncias próprias de `'button'`, capturadas separadamente.
- `'link'` — **adicionado** por consistência semântica, sem mudança de comportamento na prática: não existe componente `[dsc] Link` publicado na lib real hoje (lacuna já confirmada em rodada anterior), então `_resolveDscComponentA11yMatch` nunca vai casar `'link'` contra um `componentKey` real — a presença no Set é inerte até a lib publicar esse componente, momento em que já viria coberto sem precisar de outra revisão.
- `'snackbar'` — mantido FORA: notificação efêmera, não faz parte do fluxo de navegação principal por Tab (aparece/some sem foco intencional do usuário); eventual botão de ação/dispensar dentro já é instância própria de `'button'`.
- `'table'` — mantido FORA: a tabela como container não é o elemento focável; células com controles interativos (checkbox de seleção, input de edição inline) já são capturadas por `'checkbox'`/`'inputs'` quando são instâncias reais desses componentes. Incluir a tabela inteira geraria ruído (um passo de Tab que não existe de fato).
- `'imagem'` — confirmado FORA, sem mudança (nunca é foco de Tab, é conteúdo).

**Arquivos e blocos afetados.**
- `src/plugin/code.js` — `addElement` (chave do `Map` condicional a `msg.origin`); `_resolveTypographyA11yMatch` + nova `_inferHeadingLevelFromTypography`; `A11Y_INTERACTIVE_SHORTNAMES` (Set + comentário de justificativa expandido).
- `src/plugin/modules/accessibility.js` — `_buildA11yTituloPayload` (novo parâmetro `suggestedLevel`); chamador em `confirmA11yBatchGenerate` (passa `item.dscComponentMatch.suggestedLevel`).

**Decisões tomadas sem pedido explícito (documentar se for revisitar).** (1) Direção do mapeamento tamanho→nível seguiu a proposta literal da tarefa (token maior/mais proeminente → H1, menor → H6), sem ajuste fino adicional — a escala de 39 tokens batia exatamente com o esperado (`display {large,standard,small}`, `heading {huge,big,large,standard,small,tiny}`, `text {huge,big,large,standard,small}`, `link/*`, `caption standard`), então não houve necessidade de heurística extra. (2) `'link'` foi incluído no Set em vez de deixado de fora com nota — julgamento de que "incluir sem risco" é preferível a "documentar por que não", já que o próprio enunciado da correção 3 apresentava as duas opções como igualmente válidas.

**Dependências que a main não tem hoje.** As mesmas do bloco de a11y como um todo — depende de `a11y-deteccao-automatica` (item 4) e `a11y-mapeamento-interativo` estarem migrados primeiro (esta sub-feature só corrige comportamento já existente neles, não introduz caminho novo).

**Risco de migração:** baixo. (a) e (c) são mudanças de filtro/indexação interna sem novo contrato de mensagem; (b) adiciona um campo (`suggestedLevel`) que é opcional em todos os consumidores (fallback preserva o comportamento anterior quando ausente/`null`). Nenhuma mudança de schema salvo em `handoffData`.

---

## Ordem de migração recomendada

1. **Dados/refs primeiro:** `refs/design-acessivel-component-properties.json`, `refs/dsc-component-a11y-mapping.json` — sem eles nada do bloco de a11y funciona.
2. **`a11y-marcar-area`** — pré-requisito de keys de componente para `a11y-ordem-tabulacao-por-area` (reaproveita as mesmas 5 keys).
3. **`bugfixes-a11y-diversos`** — depende de a11y-marcar-area/conectores reais já existirem; corrige comportamento, não adiciona UI nova.
4. **`a11y-layout-colunas`** — lógica pura de posicionamento, sem UI própria; pré-requisito de `a11y-deteccao-automatica` (lote).
5. **`a11y-formulario-dinamico`** — depende só do catálogo de dados (passo 1); pré-requisito indireto de `a11y-deteccao-automatica` (reaproveita `_buildA11yElementoPayload` que usa os mesmos toggles).
6. **`a11y-deteccao-automatica`** — o bloco mais arriscado; migrar por último dentro do grupo de a11y, com todos os pré-requisitos (2, 3, 4, 5) já no lugar. Testar manualmente no Figma antes de dar como concluído.
7. **`a11y-ordem-tabulacao-por-area`** — depende de 2 (keys de componente) e de 8 (`a11y-subaccordions` — a UI de tab order agora nasce dentro do mesmo accordion de área usado pelos subaccordions de categoria); migrar os dois juntos.
8. **`a11y-subaccordions`** — puramente visual, pode entrar a qualquer momento depois que a11ySpecs/a11yAreas com `a11yAreaId` já funcionam; migrar antes ou junto do item 7.
9. **`label-automatico`** — independente, baixo risco, qualquer momento.
10. **`specs-busca-filtro`** — independente, mas confirmar ordem de bundle (`_normalizeSearchText`).
11. **`finalizar-registros-condicional`** + **`apagar-tudo`** — confirmar primeiro se `main` já tem parte disso via commit `931febe` (paridade main→beta anterior) antes de migrar às cegas.
12. **`flows-mini-mapa-conector-criacao`** — migrar a mudança de contrato de `_buildFlowConnection` e os 4 chamadores como unidade atômica (função + 3 pontos de chamada pré-existentes + `resync-all-flows` novo).
13. **`ficha-atualiza-sem-duplicar`** + **`ficha-specs-avulsas-sem-frame`** + **`ficha-a11y-agrupada-por-area`** — migrar juntas por último, já que vivem no mesmo handler grande de geração de ficha e a arquitetura `_hd*` de `main` diverge da beta aqui. Validar a Ficha gerada manualmente no Figma depois.

Depois de cada bloco migrado, rodar `npm run bundle:ui && npm run bundle:code` em `main` e testar no Figma antes de prosseguir pro próximo — não empilhar múltiplas features sem validação intermediária, dado o volume de interdependências mapeadas acima.
