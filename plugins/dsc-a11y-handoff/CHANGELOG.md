# Changelog — DSC A11Y Handoff

## v2.3.0 — 2026-07-08

### Novidades

**Nome do template de handoff configurável**

O template de handoff foi renomeado (`[dsc-h] Template Handoff` → `[dsc-hub] Handoff Acessibility`) e migrado para uma biblioteca interna nova. Para essa mudança não quebrar handoffs antigos nem exigir alteração de código na próxima vez que o nome mudar, a detecção de seleção (`tentarTravarContexto`) agora usa uma lista de nomes aceitos (`templateHandoffNames`), com nome antigo e novo por padrão. A lista é editável em Configurações > "Nome do template" (textarea, um nome por linha), persistida em `figma.clientStorage`. Adicionar um nome novo não remove o reconhecimento dos antigos — handoffs já existentes continuam funcionando.

O template novo é um componente individual, sem propriedade de variante — a validação de variante em `tentarTravarContexto` já lida com isso automaticamente (só dispara quando existe uma prop `VARIANT`, exclusiva dos handoffs antigos).

A key usada no swap de migração (`run-handoff` → substituição de handoff antigo pelo novo template) foi atualizada para apontar para o `[dsc-hub] Handoff Acessibility` na biblioteca nova.

### Bugfixes

**Setting de sincronização de template nunca era persistido**

A checkbox "Atualizar template ao gerar handoff" enviava `save-setting` para o `code.ts`, mas não havia handler para essa mensagem — o valor nunca era salvo nem restaurado ao reabrir o plugin. Adicionado handler genérico de `save-setting` que persiste em `figma.clientStorage` e restaura o valor via `setup-ui`.

---

## v2.2.0 — 2026-06-12

### Novidades

**Preview baseado em instâncias permanentes — Área de Toque**

O preview de áreas de toque deixou de usar frames temporários no canvas e passou a ser gerenciado dentro do próprio frame `image` do template (já gerado no handoff). Overlays (`[dsc-h] Handoff areas`) e badges (`[dsc-h] Item Number`) são criados, posicionados e confirmados diretamente no imageFrame de forma idempotente por `variationId`. Ao gerar o handoff, o `run-handoff` reposiciona e redimensiona todos os overlays usando as coordenadas relativas salvas (`relX`, `relY`) e reutiliza `badgeOffsetX/Y` + `badgeProps` confirmados pelo usuário (inclui direção do conector), sem cálculos geométricos automáticos. O frame se redimensiona dinamicamente para englobar todos os elementos (`variation-component`, `touch-overlay`, `touch-badge`) com `clipsContent = false`.

**Preview baseado em instâncias permanentes — Tabulação**

Idêntico ao toque: instâncias por variação vivem no `tabImageFrame`; `activate-tab-variation` encontra ou recria a instância e redesenha markers de ordem de foco com offset correto.

**Preview baseado em instâncias permanentes — Leitor de Tela**

Conectores (`[a11y] Conectores`) e agrupamentos (`[a11y] Agrupamento`) são posicionados no `srImageFrame` e persistidos como `relX/relY` relativos à instância ativa. No `run-handoff` e `activate-sr-variation`, os conectores são recriados usando `setProperties(overlayProps)` para preservar exatamente as propriedades confirmadas pelo usuário (tipo de role, conector, orientação). O mesmo se aplica ao `append-sr-marker` ao adicionar um novo conector sem recriar os existentes.

**Numeração X.Y nos badges de toque**

Badges de área de toque passaram a exibir `variationPrefix.localIndex` (ex: `1.1`, `1.2`, `2.1`) em vez de índice global sequencial. O prefixo é enviado pela UI com base na ordem da variação.

**Suite de testes com Vitest**

40 testes cobrindo funções puras e todos os parsers de migração (`parseOldGeralData`, `parseOldTouchAreas`, `parseOldTabOrder`, `parseOldSRData`). Mocks mínimos da API Figma em `__tests__/figma-mock.ts`.

---

### Bugfixes

**Orientação de agrupamentos SR ignorada ao confirmar**

Quando o usuário posicionava um agrupamento com orientação específica (ex: "inferior"), a orientação era sobrescrita por um cálculo geométrico automático baseado em centro. A causa: as chaves de `componentProperties` têm sufixo `#id` (ex: `"orientação#12345"`), então um lookup direto `overlayProps['orientação']` sempre retornava `undefined`. **Fix:** todas as `componentProperties` são agora salvas como `overlayProps` em `confirm-sr-area` e aplicadas via `setProperties(overlayProps)` — o Figma resolve os sufixos `#id` internamente. O fallback geométrico só é usado para dados antigos sem `overlayProps`.

**Fundo do preview com contraste errado (card background)**

`applyWcagBackground` buscava `card background 1` (não existe — a variável clara se chama apenas `card background`) e usava sempre `card background 2` (escura) independentemente do componente. **Fix:** busca `card background` (sem número) e `card background 2`, resolve a cor de cada uma, calcula a razão de contraste WCAG contra a cor efetiva do componente e escolhe a variável de maior contraste. Quando o frame não tem fill, assume branco (fundo padrão do canvas) para o cálculo.

**Spec rows do zoom com numeração errada quando 200% Componente não está selecionado**

Quando "200% Componente (scaling)" não estava selecionado, a row correspondente continuava visível e "400% Componente" ficava numerado como 3 em vez de 2. **Fix:** ao final do bloco de zoom no `run-handoff`, o código percorre os `element` dentro de `specs` (FRAME filho de `zoom`), oculta os não selecionados e renumera os visíveis sequencialmente. A abordagem usa `findAll(n => n.parent?.id === specsId)` para evitar as restrições de iteração do JSVM do Figma.

**Model nodes deletados após run-handoff**

`modelConector`, `modelAgrupamento` e `modelItemNumber` eram removidos com `.remove()` após o primeiro uso, tornando impossível criar novas anotações sem regerar o handoff. **Fix:** `visible = false` em vez de `.remove()`, mantendo-os disponíveis como modelos de clonagem em chamadas subsequentes.

**Frame de toque cortando badges externos**

Badges posicionados acima do overlay (com `badgeOffsetY` negativo) extrapolavam os limites do imageFrame quando ele era redimensionado apenas pela bounding-box das instâncias. **Fix:** bounding-box calculada sobre todos os filhos relevantes (variation-component, touch-overlay, touch-badge); frame deslocado e redimensionado para incluir tudo com padding mínimo; `clipsContent = false`.

**`contextoTravado` nunca resetado quando nó é deletado**

Se o handoff era deletado pelo usuário enquanto o plugin estava ativo, `getTouchImageFrame`, `getTabImageFrame` e `getSRImageFrame` retornavam `null` mas não resetavam o contexto. O plugin ficava preso mostrando dados do handoff deletado. **Fix:** as três funções agora resetam `contextoTravado = false`, `componentePrincipalAtivo = null` e enviam `waiting-selection` quando o nó não existe mais.

**WCAG contrast não disparando sem bgFill**

O cálculo de contraste era ignorado quando o frame não tinha fill sólido. **Fix:** assume branco `{r:1, g:1, b:1}` como fundo padrão (comportamento do canvas Figma). Quando o componente não tem fill próprio, usa a cor de conteúdo (texto/ícone) como `effectiveCompColor`.

---

## v2.1.2 — 2026-05-29

### Bugfixes

**Badge de heading mostra h1/h2/h3 em vez de letra alfabética**

No preview e nas specs do leitor de tela, conectores do tipo `'nível de título'` exibiam a letra alfabética do grupo (A, B…) em vez do nível semântico correto. Agora o texto do badge usa `c.especificacao` (ex: `h1`, `h2`, `h3`) quando o conector é do tipo heading, tanto no frame `image` quanto nos boxes `[a11y] Box specs LT`.

**COMPONENT_SET não gera cópia do set inteiro no canvas/handoff**

Quando o componente selecionado era um `COMPONENT_SET` de biblioteca remota, `createComponentInstance` não conseguia acessar os filhos (`children` vazio no contexto do plugin) e caía no fallback `comp.clone()`, que cloana o set inteiro — todas as variantes apareciam soltas no canvas e dentro do handoff. Três correções:
- `createComponentInstance` agora usa `defaultVariant` como primeira tentativa, depois `children.find(COMPONENT)`, e como último recurso cria um frame placeholder vazio (nunca clona o set).
- Guardar defensiva em `srcNode.clone()` nos três blocos de variação (toque, tabulação, leitor): se o `instanceNodeId` salvo apontar para um `COMPONENT_SET` (dado corrompido de execuções anteriores), redireciona para `createComponentInstance` em vez de clonar.

**Lixo no canvas após geração do handoff**

Dois tipos de nó podiam ficar soltos na página após "Atualizar Handoff":
- Overlays `[A11Y Leitor]` pendentes (frame de anotação SR aberto pelo usuário e não confirmado/cancelado antes de gerar): agora removidos no início do `run-handoff`, junto com os overlays `[A11Y Toque]`.
- Nós de migração SR (`oldSRVarCapture`) que não foram reinseridos no handoff — ocorria quando a seção de leitor estava desmarcada (`runLeitor=false`) ou havia mismatch de variações de migração: agora removidos na limpeza final se ainda estiverem parentes da página.

---

## v2.1.1 — 2026-05-28

### Bugfix

**Painel errado ao clicar "Editar" em Tabulação ou Leitor de Tela**

Ao editar o default de Área de Toque e depois navegar para Tabulação (ou Leitor de Tela) e clicar "Editar", a aba "Área de Toque" ficava ativa no lugar do painel correto, forçando o usuário a clicar na aba de destino novamente.

**Correções aplicadas:**

- `editTabVariation` — guarda defensiva no final: se `panel-tabulacao` não estiver ativo ao término da função, ele é reativado.
- `editVariation` — guarda simétrica para `panel-toque`.
- `selectSRVariation` — guarda simétrica para `panel-leitor`.
- `summaryEditToque`, `summaryEditTab`, `summaryEditLeitor` — alinhados com o handler de tab click: agora também resetam as views (`showView('list')`, `showTabView('list')`, `showSRView('list')`) e enviam `deactivate-variation` antes de trocar o painel, prevenindo estados de view obsoletos ao navegar pelo resumo do Handoff.

---

## v2.1.0 — 2026-05-27

### Novidades

- Badge de número no preview de toque e tabulação posicionado **acima** do componente (sem linha de conector), com `connector: 'Off'`
- Padding do plugin corrigido nos painéis de Área de Toque e Tabulação
- Limpeza pós-geração em **varredura única** (frames `[A11Y Variação*]` e `[A11Y Variações]`) — elimina 4 passagens separadas anteriores
- Painel "Como usar": card de configurações integrado ao passo a passo

---

## v2.0.x — histórico anterior

Versões de consolidação da migração do formato antigo de handoff para o novo template, incluindo swap automático de template, parsers de migração e persistência em cascata via `a11y-component-data`.
