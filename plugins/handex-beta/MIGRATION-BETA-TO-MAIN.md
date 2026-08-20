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
