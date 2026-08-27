# Design System do Handex

**Versão do DS:** 1.5
**Data de fechamento:** 2026-08-25 · última revisão: 2026-08-26 (auditoria de contraste WCAG + padronização de botões brancos + peso visual de ícones + tamanho de ícones-irmãos)
**Escopo:** a linguagem visual da própria interface do plugin Handex (tokens, componentes, padrões de interação). **Não é o DSC** (Design System CAIXA) — esse é o design system externo que o Handex audita/referencia via `refs/_manifest.json` e os scans de conformidade. Os dois domínios não devem ser confundidos: o DSC é fonte de verdade de conformidade de produto CAIXA; este documento é sobre a ferramenta interna que a Fóton usa para produzir handoff.

**Este é o arquivo de referência normativo.** Toda nova tela, componente ou variante visual do Handex deve seguir o que está definido aqui. Quando o código atual diverge do que está documentado, isso é dívida técnica a ser corrigida — não uma segunda opção válida. A seção 9 lista essa dívida.

---

## 1. Tokens de cor

### Paleta de marca (`tailwind.config.cjs:12-45`)

**Marca institucional CAIXA vigente** — revertido em 2026-08-26. A paleta "Uau CAIXA" (azul-roxo `#3d3dff`, usada entre 2026-08-24 e 2026-08-26) era uma antecipação de rebranding que a CAIXA ainda não publicou oficialmente; até a publicação, o Handex usa a marca institucional vigente, extraída de `refs/fundamentos-visuais.json` (tokens `color/bg/highlight`/`color/bg/accent`, escalas `primary`/`secondary` do DSC).

| Token | Hex | Uso |
|---|---|---|
| `blue-500` | `#005ca9` | Cor de ação primária/brand — botões primários, header das views, elementos de destaque ("azul cx", `primary 90` no DSC) |
| `blue-600` | `#004d8d` | Hover/estado ativo de `blue-500` |
| `blue-700` | `#004075` | Uso pontual, texto sobre fundo claro que precisa de mais contraste (próximo de `primary 110`, `#00437a`) |
| `orange-500` | `#f39200` | Acento secundário, alertas não-críticos ("laranja cx", `secondary 70` no DSC) |

**Regra de uso:** sempre a classe nomeada (`bg-blue-500`, `hover:bg-blue-600`), nunca hex arbitrário (`bg-[#005ca9]`) em código novo. O hex arbitrário é tolerado apenas no código legado listado na seção 9.

Não usar `#3d3dff`, `#2e2ee0`, `#f5b400` ou qualquer variação da paleta "Uau CAIXA" — fica reservada para se e quando a CAIXA publicar oficialmente o rebranding, quando este documento será atualizado novamente.

### Superfícies light/dark (`tailwind.config.cjs:46-58`)

| Token | Light | Dark |
|---|---|---|
| `light.bg` / `dark.bg` | `#eef2f7` | `#0f172a` |
| `light.surface` / `dark.surface` | `#ffffff` | `#1e293b` |
| `light.line` / `dark.line` | `#dde3ec` | `#334155` |
| `light.muted` / `dark.muted` | `#8394a8` | `#b4c6d8` |
| `dark.text` | — (usar `slate-800`) | `#f1f5f9` |

Uso: `bg-light-surface dark:bg-dark-surface`, `border-light-line dark:border-dark-line`, `text-slate-800 dark:text-dark-text`. Este é o par de tokens com maior disciplina de uso hoje — manter esse padrão como referência de "como todo token deveria ser aplicado".

### Paleta de categoria de scan (`tailwind.config.cjs:62-87`, em `safelist`)

11 cores com par light/dark, atribuídas **rotativamente por índice** (não semântica fixa) via `_getCatColor` sobre a lista de categorias de token do DSC: `slate, pink, blue, lime, indigo, rose, emerald, yellow, teal, purple, cyan`.

Uso: `bg-{cor}-50 text-{cor}-600 border-{cor}-200` no light, `dark:bg-{cor}-900/20 dark:text-{cor}-400 dark:border-{cor}-800/40` no dark (opacidade `/30` para `pink`/`blue`). Qualquer cor nova de categoria de scan precisa entrar em `safelist` (Tailwind não gera classe dinâmica não-safelisted).

### Categorias de spec — canônico

As 4 categorias de spec (`info`, `comportamento`, `regra`, `api`) usam **a paleta da Ficha exportada** como fonte única — é o que o desenvolvedor final vê na entrega, e é o ponto de maior peso de decisão.

| Categoria | Fill | Texto/borda |
|---|---|---|
| `info` | `#f1f5f9` | `#475569` |
| `comportamento` | `#fdf2f8` | `#be185d` |
| `regra` | `#eff6ff` | `#1d4ed8` |
| `api` | mesmo padrão de `handoff.js:726-729` — usar o par já definido lá para a 4ª categoria |

Card no canvas (`specifications.js:449-454`) e modal de ajuda (`modals.html:396-418`) devem passar a consumir este mesmo par de valores — ver dívida técnica (seção 9, item 1).

### Cor de sucesso/confirmação

`green-500` (`#22c55e`, escala padrão Tailwind) é o verde oficial de sucesso/confirmação — consistente com o uso já orgânico em status "Finalizado" (`dados-projeto.html:86`) e estado confirmado (`modals.html:770`).

| Uso | Classe |
|---|---|
| Fundo de estado de sucesso | `bg-green-50 dark:bg-green-900/20` |
| Borda | `border-green-100 dark:border-green-800/30` |
| Botão de confirmação positiva | `bg-green-500 hover:bg-green-600` |

`plugin.css:114-134` hoje faz `button.bg-green-600`/`.bg-green-500` herdar a cor do laranja de alerta (`#7a5800`) — é um bug adormecido que precisa ser corrigido antes que qualquer botão verde real seja criado (dívida técnica, seção 9, item 2).

---

## 2. Tipografia

Fonte única: `Inter, sans-serif` (`plugin.css:3`), forçada com `!important` em headings/labels.

### Escala nomeada (canônica)

| Token | Valor | Uso |
|---|---|---|
| `text-3xs` | `9px` | Contador de caractere |
| `text-2xs` | `10px` | Hints, descrição de card, badge de categoria |
| `text-xs-plus` | `11px` | Subtítulo de header, label de modal |
| `text-sm` (nativo Tailwind, `13px` já é próximo) | `12–13px` | Corpo de botão, texto de card padrão |
| `text-md` | `14px` | Título de modal pequeno |
| `text-lg` | `15–16px` | Título de modal médio |
| `text-xl` | `18px` | Título de modal grande |

Estes tokens (`3xs`, `2xs`, `xs-plus`, `md`) ainda não existem em `tailwind.config.cjs` — precisam ser adicionados como `fontSize` extend antes que o código passe a usá-los por nome em vez de px arbitrário (dívida técnica, seção 9, item 3). Até lá, os valores px arbitrários listados acima são os valores corretos a usar.

**Pesos:** `font-bold` é o padrão de botão/label. `font-extrabold` reservado a títulos de destaque e CTAs primários. `font-semibold`/`font-medium` para ênfase secundária.

---

## 3. Espaçamento e grid

- **Grid da home:** `grid grid-cols-2 grid-rows-3 gap-2 w-full flex-1`, 6 cards fixos, `p-3` + `gap-1.5` interno. Não adicionar um 7º card sem redesenhar o grid — 2×3 é o limite do padrão atual.
- **Container padrão de view:** `<main class="view ... px-4 py-3 flex flex-col h-full overflow-y-auto">` — todo container de tela nova segue este shell.
- **Passo de espaçamento:** `gap-2`/`space-y-2` como base; meios-passos (`gap-1.5`, `gap-2.5`, `py-2.5`, `p-3.5`) são aceitos para ajuste fino, não é preciso forçar múltiplos exatos do Tailwind.
- **Área de toque mínima de botão-ícone interativo:** 40×40px (ver seção 5, Botões).

---

## 4. Radius

| Token | Valor | Uso |
|---|---|---|
| `radius-xl` | `16px` (`rounded-2xl` no Tailwind) | Padrão universal — todo botão, card, modal, input |
| `radius-full` | `999px` (`rounded-full`) | Pills/badges de categoria |

**`rounded-xl` (12px) é eliminado como variante intencional.** Onde hoje aparece — botões-ícone de utilidade com fundo, versão "editar" do `flow-type-card-modal` — é inconsistência a corrigir para `rounded-2xl`, não uma segunda variante legítima (dívida técnica, seção 9, item 4).

Radius de card deve ser declarado por classe Tailwind (`rounded-2xl`) diretamente no elemento — não por seletor de atributo de id em CSS global (dívida técnica, seção 9, item 5).

---

## 5. Inventário de componentes

### Botões — catálogo de variantes

Todo botão do Handex é uma das 6 variantes abaixo. Não criar uma 7ª variante sem atualizar este catálogo primeiro.

| Variante | Uso | Classes |
|---|---|---|
| **Primária** | Ação de fluxo/confirmação (confirmar, avançar, criar, gerar ficha) | `bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-bold` |
| **Secundária/ghost (sobre header)** | Ação alternativa dentro do header azul de uma view | Fundo transparente ou `bg-white/10`, `hover:bg-white/20`, `rounded-2xl` |
| **Branco/outline neutro** | Ação secundária com texto fora do header — "Finalizar Registros", "Importar JSON" | `bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-2xl py-3 text-[12px] font-bold text-slate-600 dark:text-dark-muted hover:bg-gray-50 dark:hover:bg-slate-800`. Sub-variante **link externo**: mesma dimensão/tipografia, mas borda e texto na cor de marca (`border-blue-500 text-blue-500`) quando a ação leva a um destino fora do plugin (ex: site do DSC) — sinaliza visualmente "isto não é uma ação do produto". |
| **Destrutiva** | Ação irreversível (excluir, limpar dados, apagar projeto) | `bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold` |
| **Ícone interativo** | Ação isolada representada só por ícone (fechar modal, voltar, ajuda, dispensar) | Container `w-10 h-10 flex items-center justify-center rounded-2xl`, ver regras de área de toque abaixo |
| **Ícone utilitário com fundo** | Ação secundária de rodapé/lista, só ícone sem texto (download, lixeira) | `bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-2xl`, cor de hover semântica (ex: vermelho para ação destrutiva de descarte) |

**Todo botão branco/outline com texto usa as mesmas dimensões: `py-3` + `text-[12px] font-bold`.** Antes de 2026-08-26 havia 2 variações de tamanho coexistindo sem padrão declarado (`py-2.5`/`text-[11px]` no rodapé da home, `py-3`/`text-[11px]` nos links do guia) — convergidas para o padrão acima, que já era o mais repetido no código ("Finalizar Registros", 5 instâncias idênticas).

**Fora deste catálogo, por serem estruturalmente diferentes de um botão de texto linear:** os cards seletores de opção em grid (ex: modal de medidas, `modals.html:880-899` — ícone grande + label embaixo, `border-2`) não seguem esta padronização; são um componente de seleção visual, não uma ação. Candidato a virar uma variante própria formalizada no futuro, se o padrão se repetir em mais lugares.

**Estado disabled — regra única para todas as variantes:** `disabled:opacity-40 disabled:cursor-not-allowed`, sem trocar a cor de fundo por um cinza sólido. Mantém o botão reconhecível (só esmaecido) em vez de virar cinza genérico, e não exige definir uma cor disabled própria por variante.

**Botão-ícone interativo isolado:** área de toque real 40×40px. Glifo interno visível — não reduzir a hit-area a uma margem invisível ao redor de um ícone minúsculo; o glifo cresce proporcionalmente (glifo `16px` → botão de 40px = folga confortável, ~`20px` de glifo). Quando dois botões-ícone ficam lado a lado no mesmo grupo, o espaçamento entre eles vem do `gap` do container flex — nunca usar margem negativa nos dois lados de botões adjacentes (isso cola as áreas de toque uma na outra).

**Botão de fechar (ícone `x`)**: mesma regra do botão-ícone interativo — `rounded-2xl` quando tem fundo próprio (ver dívida técnica para o `rounded-xl` residual).

### Modais (`views/modals.html`)

Todos compartilham o mesmo shell: `role="dialog" aria-modal="true"` + overlay + `.modal-content bg-white dark:bg-dark-surface rounded-2xl shadow-2xl`. Focus trap global via `core.js:2365-2408`.

| Propriedade | Padrão |
|---|---|
| z-index padrão | `z-[1000]` |
| z-index de modal empilhado sobre outro modal | `z-[1200]` |
| z-index de modal de confirmação leve (ex: limpar dados) | `z-[200]` |
| Título — modal pequeno | `text-[14px] font-bold` |
| Título — modal médio | `text-[15px]/[16px] font-extrabold` |
| Título — modal grande | `text-[18px] font-bold` |

Os 3 z-index acima ainda são valores mágicos sem constante nomeada no código — a tabela é a referência até a extração de token (dívida técnica, seção 9, item 6).

### Cards

- **Card de ferramenta (home)**: markup único reutilizado nas 6 instâncias, variando cor de hover e ícone. Este é o padrão de reuso a seguir para qualquer card novo.
- **Card de conteúdo genérico**: `rounded-2xl` declarado por classe Tailwind diretamente no elemento (não por sufixo de id em CSS global — ver seção 4).

### Accordion — padrão único

`toggleAccordion(btn, nodeId)` (`core.js:2696`) é o **único** padrão oficial de accordion do Handex. Sempre seta `aria-expanded` no container; `nodeId` habilita exclusividade entre irmãos (abrir um fecha os outros) quando aplicável.

Todo accordion novo usa esta função. Os 3 outros dialetos hoje coexistentes (`onclick` inline sem `aria-expanded` em `guide.html`, `div role="button"` do Briefing Estratégico, chevrons próprios como `.journey-chevron`/`.group-chevron`) são dívida técnica a migrar (seção 9, item 7) — não são variantes válidas para reuso em telas novas.

Estado padrão: um accordion nasce **fechado**, salvo decisão explícita de UX para uma tela específica (ex: Briefing Estratégico nasce aberto — decisão de produto tomada em 2026-08-25).

### Toggle/Switch

O **switch estilizado** (usado em Dados do Projeto) é o padrão oficial para escolha binária habilitado/desabilitado. Checkbox nativo (`accent-*`) continua sendo o padrão correto para seleção múltipla em listas (import/limpeza de dados), não para toggle liga/desliga — os dois componentes têm papéis diferentes, não é uma substituição 1:1.

### Inputs

O componente mais consistente do plugin — tokenizado via regra global `plugin.css:507-576` (`input[type=text|search], select, textarea`). Todo input novo herda esse estilo automaticamente por seletor de tag/atributo; não redeclarar estilo de input por classe local.

### Toasts

Sistema único (`#toast-container`, `plugin.css:284-309`), sem variação de markup entre severidades — a diferença é comunicada por texto e ícone, nunca por cor de fundo do toast.

### Ícones

Biblioteca exclusiva: **Lucide** (`data-lucide="nome"`). Ícone decorativo (ao lado de label, dentro de badge) segue o tamanho visual do contexto (`w-3.5`–`w-5`), sem regra de área de toque. Ícone interativo segue a regra de botão-ícone da seção "Botões" acima (40×40px de área de toque, glifo proporcionalmente visível).

**Peso visual uniforme (`plugin.css`):** todo ícone Lucide nasce com `stroke-width: 2` (padrão da lib, calibrado para o viewBox nativo de 24px). Como o plugin usa ~7 tamanhos diferentes de ícone (`w-2.5` a `w-6`) no mesmo viewBox, o mesmo traço de 2px parece mais grosso nos ícones pequenos e mais fino nos grandes — regra CSS global compensa por faixa de tamanho:

| Classe | `stroke-width` |
|---|---|
| `w-2.5`, `w-3` | `2.5` |
| `w-3.5`, `w-4` | `2.25` |
| `w-4.5` e acima | `2` (padrão nativo, sem compensação) |

Ícone novo herda essa regra automaticamente por classe de tamanho — não é preciso declarar `stroke-width` manualmente em nenhuma tag `<i data-lucide>`.

**Ícones-irmãos (mesma linha/grupo, mesma hierarquia de ação) usam sempre o mesmo tamanho.** A compensação de `stroke-width` acima resolve peso percebido *entre* categorias de tamanho distantes (ex: um ícone de 10px comparado a um de 24px em telas diferentes) — não resolve, e não deveria precisar resolver, dois ícones lado a lado com tamanhos ligeiramente diferentes sem motivo (ex: `w-5` ao lado de `w-4.5`, ou `w-3.5` ao lado de `w-3` na mesma linha de ações). Isso é bug de inconsistência, não peso visual, e a correção certa é igualar o tamanho, não ajustar stroke. Regra prática: antes de declarar o tamanho de um ícone novo, olhar o que os ícones vizinhos no mesmo componente já usam e copiar — não escolher um tamanho novo "que parece certo" isoladamente.

Exceção deliberada: o botão "voltar" do header (`arrow-left`, sempre `w-5`) é maior que os botões de ajuda/onboarding ao lado (`graduation-cap`/`circle-help`, sempre `w-4.5`) — hierarquia intencional (ação de navegação primária > ação secundária de suporte), não inconsistência.

### Empty states

Estrutura única: ícone a 25% de opacidade + título + CTA inline sublinhado, gerada via função JS compartilhada — não HTML estático duplicado por tela (exceção hoje: hub de Frames, ver dívida técnica item 8).

---

## 6. Nomenclatura de tela

A tela hoje referenciada por 3 nomes diferentes (card na home: "Escanear Tokens"; id: `view-frames`; arquivo: `handoff.html`) tem como **nome canônico "Handoff"** — reflete o papel real da tela como hub central do frame (scan + medidas + specs + conformidade), não só a ação de escanear. Card na home, título interno da view e qualquer documentação nova devem convergir para esse nome (dívida técnica, seção 9, item 9).

---

## 7. Acessibilidade

- **Área de toque mínima de elemento interativo:** 40×40px (botões-ícone, ver seção 5).
- **Accordion:** sempre `aria-expanded` no elemento que controla a expansão (ver seção 5).
- **Foco:** todo modal precisa de focus trap (padrão já implementado globalmente em `core.js:2365-2408` — reaproveitar, não reimplementar por modal).
- **`aria-label`** obrigatório em todo botão-ícone sem texto visível.

### Contraste de cor (WCAG 2.1 AA) — auditoria 2026-08-26

Piso adotado para toda a UI do plugin (não confundir com o DSC, que tem sua própria auditoria de acessibilidade sobre o produto CAIXA — este piso é sobre a própria interface do Handex):

- **Texto normal** (<18px, ou <14px bold): mínimo **4.5:1**.
- **Texto grande** (≥18px, ou ≥14px bold) e **ícones/componentes gráficos não-decorativos** (glifo de botão-ícone, borda de card informativo): mínimo **3:1**.
- Cálculo pela fórmula de luminância relativa padrão WCAG 2.1 (não por inspeção visual). Cores com opacidade (`text-white/70`, `text-[#005ca9]/60`, `dark:bg-blue-900/10` etc.) são compostas (alpha-blend) sobre o fundo real antes do cálculo — a opacidade nominal da classe não é o contraste real.

Regras específicas descobertas nesta auditoria (motivadas pela reversão de marca de 2026-08-26, `#3d3dff`→`#005ca9`, que reduziu a luminância da cor de ação primária):

1. **Opacidade mínima de texto/ícone branco sobre o header azul (`bg-blue-500`/`#005ca9`):** `text-white/70` cai para ~4.15:1 — só passa porque hoje é usado exclusivamente em ícones puros (piso 3:1), nunca em rótulo de texto corrido. **Não usar `text-white` com opacidade abaixo de `/70` sobre `bg-blue-500` em nenhum contexto novo**, e se o elemento for texto legível (não só glifo decorativo), usar opacidade cheia (`text-white`, sem `/opacity`) ou `text-blue-100`.
2. **Banner de onboarding (`bg-blue-500/5` light):** o botão de dispensar (ícone `x`) precisa de pelo menos `text-[#005ca9]/80` sobre esse fundo claro — `/60` reprova o piso de ícone (3:1). Título/corpo do banner (`text-[#004d8d]`/`/80`) já passam, mas com pouca folga; não reduzir further.
3. **Nenhum texto/borda azul (`text-[#005ca9]`) pode ficar sem par `dark:` explícito.** Um elemento que herda a cor light (`#005ca9`) sobre um fundo escuro (`dark:bg-dark-bg`, `#0f172a`) cai para ~2.64:1, reprovando os dois pisos. Todo uso de `text-[#005ca9]`/`border-[#005ca9]` em bloco que também tem uma variante `dark:bg-*` precisa do par `dark:text-blue-400` (ou mais claro)/`dark:border-blue-400`.
4. **Texto secundário (`text-slate-400`/`text-slate-500`) só é seguro sobre card branco (`bg-white`/`bg-light-surface`), não sobre o fundo geral da view (`bg-light-bg`, `#eef2f7`).** A diferença de luminância entre os dois é pequena, mas suficiente para empurrar combinações já marginais para reprovação. Qualquer texto `slate-400`/`slate-500` que fique diretamente sobre o fundo da view (sem um card branco por baixo — ex: empty states, títulos de seção soltos) precisa subir para `text-slate-600` no light mode.
5. **Badge de categoria (fill claro + texto colorido) precisa reavaliar o par a cada vez que o fill for reaproveitado de outro contexto.** As cores de categoria de spec (`#64747A`/`#93537D`/`#008CB2`/`#6D8000`) foram herdadas do canvas do Figma (onde o piso de contraste não se aplica da mesma forma — ver seção 8) e reprovaram quando usadas como texto de UI sobre os mesmos fills claros. Um tom que funciona bem como stroke de card no canvas não necessariamente funciona como texto de badge na UI.

---

## 8. Componentes propositalmente fora de escopo deste DS

Este documento cobre a UI do próprio plugin. **Não cobre:**
- Componentes da lib de acessibilidade do DSC (`refs/design-acessivel*.json`) — são conteúdo do design system da CAIXA, não do Handex.
- Qualquer elemento gerado no canvas do Figma (specCard, conectores, marcadores) — esses têm suas próprias regras de layout ditadas pela Plugin API do Figma, documentadas inline em `code.js`, não neste arquivo.

---

## 9. Dívida técnica (código a migrar para bater com este DS)

Lista de prioridade — cada item é uma correção pontual, não um redesenho:

1. **Paleta de categoria de spec** — unificar `specifications.js:449-454` e `modals.html:396-418` para usar o par de valores da Ficha (seção 1).
2. **Bug adormecido de verde/laranja** — `plugin.css:114-134` faz botão verde herdar cor de alerta laranja; corrigir antes que um botão verde real seja criado (seção 1).
3. **Escala tipográfica sem token nomeado** — adicionar `3xs`/`2xs`/`xs-plus`/`md` ao `fontSize` do `tailwind.config.cjs` (seção 2).
4. **`rounded-xl` residual** — migrar para `rounded-2xl` nos botões-ícone de utilidade e na versão "editar" do `flow-type-card-modal` (seção 4).
5. **Radius de card via seletor de id** — mover `plugin.css:451-465` para classe Tailwind direta no HTML (seção 4).
6. **z-index de modal sem constante nomeada** — extrair `Z_MODAL_BASE`/`Z_MODAL_STACKED`/`Z_MODAL_LIGHT` (ou equivalente) em vez dos 3 valores mágicos hoje espalhados (seção 5).
7. **4 dialetos de accordion → 1** — migrar `guide.html`, Briefing Estratégico e os chevrons próprios (`.journey-chevron`, `.group-chevron`) para `toggleAccordion` (seção 5).
8. **Empty state do hub de Frames** — hoje é HTML estático (`handoff.html:66-72`) em vez de usar a função JS compartilhada das outras 3 ferramentas (seção 5).
9. **Nomenclatura "Escanear Tokens/Frames/Handoff"** — convergir card, título interno e referências de doc para "Handoff" (seção 6).
10. **Hex de brand direto no HTML** — migrar `bg-[#005ca9]`/`hover:bg-[#004d8d]` para as classes nomeadas `bg-blue-500`/`hover:bg-blue-600` (seção 1). Maior volume de mudança da lista — não precisa ser feito de uma vez, mas todo código novo já nasce usando a classe nomeada.
11. **`#1E293B` hardcoded** — substituir por `text-slate-800 dark:text-white` onde aparece como cor de título (é literalmente o mesmo hex).
12. **Resolvido em 2026-08-26** — os 2 hovers isolados (`home.html:163`, `modals.html:1245`) que usavam `#004d8f`/`#005a8e` (azul institucional pré-Uau CAIXA) já convergiram para `blue-600` (`#004d8d`) como parte da reversão de marca — não é mais dívida.
13. **Código morto de wizard sequencial** — `core.js:2092-2181` e `modals.html:984-1014` (`check-designs-modal`) sem tela viva que os alimente. Não é dívida de *design*, mas deveria ser removido antes de qualquer nova geração de UI se acumular em cima.
14. **Onboarding duplicado** — `guide.html` e `onboarding.js` (`ONBOARDING_TOOLS`) mantêm conteúdo quase idêntico por disciplina manual; já divergiram uma vez. Não é dívida de design system em si, mas afeta a camada de conteúdo que acompanha os componentes.
15. **Resolvido em 2026-08-26** — `disabled:bg-gray-300` (`modals.html:1115`, botão "Salvar Cenário") migrado para `disabled:opacity-40`. Confirmado durante a auditoria de contraste que o padrão antigo reprovava gravemente (branco sobre cinza-300 = 1.49:1) — não é mais dívida.
16. **Badge "Comportamento" da legenda de tipos de spec passa no piso, mas com pouca folga** — `modals.html:403` (`text-[#93537D]` sobre `bg-[#F8EAF3]`) mede 4.53:1, acima do piso de 4.5:1 mas por pouco. Não foi alterado nesta auditoria (só reprovações foram corrigidas), mas qualquer ajuste futuro de fill/tom deste badge específico deve reverificar o contraste antes de publicar (seção 7).
17. **Assimetria de contraste do botão "dispensar" do banner de onboarding entre temas** — no light mode o ícone precisou subir de `/60` para `/80` de opacidade para passar do piso de 3:1 (ver seção 7, item 2). O par dark (`dark:text-blue-300/60`) já passava a 3.93:1 e não foi tocado — os dois temas usam frações de opacidade diferentes hoje (`/80` light, `/60` dark) para o mesmo elemento visual. Funciona, mas não é simétrico; um ajuste futuro que tente "unificar" a opacidade entre temas precisa recalcular, não presumir que o mesmo valor serve para os dois.
18. **Paleta de categoria de scan (11 cores, `tailwind.config.cjs:69-93` safelist) parece órfã** — nenhum arquivo em `modules/*.js` ou `views/*.html` foi encontrado construindo dinamicamente as classes `bg-{cor}-50 text-{cor}-600 border-{cor}-200` descritas no comentário do safelist ("built dynamically via `_getCatColor`"). A função `_getCatColor` que existe hoje em `specifications.js:458` é sobre categoria de **spec** (info/comportamento/regra/api), não sobre esse ciclo de 11 cores. Se a feature que consumia essa paleta foi removida, o safelist deveria ser removido junto (reduz o CSS compilado); se ainda existe em algum lugar não encontrado nesta auditoria, precisa de investigação antes de confiar nos tons — 4 das 11 cores (`lime-700`, `rose-600`, `pink-600`, `teal-600`, todas sobre seu par `-50`) reprovariam o piso de 4.5:1 se algum dia voltarem a ser renderizadas (ver seção 7).
19. **Contadores de caractere (`text-[9px] text-slate-400 dark:text-dark-muted`, ex: `dados-projeto.html:45,96,115,134,146`, `modals.html:127` e ~15 outras ocorrências) reprovam o piso de 4.5:1 sobre card branco** (`#9ca3af`≈slate-400 sobre `#ffffff` mede ~2.6:1). Não corrigido nesta auditoria — é um padrão muito replicado (~20 ocorrências) que hoje funciona como anotação secundária de apoio (contagem "0/100" ao lado do label do campo, nunca a única fonte da informação), não conteúdo primário. Fica registrado como dívida em vez de corrigido em massa porque mudar a cor de 20 pontos do produto de uma vez foge do "ajuste pontual" desta rodada — mas qualquer revisão de formulário/input deve tratar isso como pendência de contraste real, não estética (seção 7).

---

## Histórico de decisões deste documento

- **2026-08-24** — levantamento inicial de fundamentos, 100% a partir do código-fonte real, publicado como auditoria (não normativo).
- **2026-08-25** — transformado em referência normativa. Decisões fechadas nesta data: cor de categoria de spec (Ficha exportada é canônica), radius único (`rounded-2xl`, `rounded-xl` eliminado), accordion único (`toggleAccordion`), verde de sucesso (`green-500`), nome canônico de tela ("Handoff"), toggle oficial (switch estilizado). Catálogo de variantes de botão formalizado (primária/secundária/destrutiva/ícone interativo/ícone utilitário) e estado disabled padronizado (`disabled:opacity-40`, `disabled:bg-gray-300` eliminado).
- **2026-08-26** — paleta de marca revertida de "Uau CAIXA" (`#3d3dff`/`#f5b400`) para a marca institucional CAIXA vigente (`#005ca9`/`#f39200`, extraída de `refs/fundamentos-visuais.json`). Motivo: a paleta "Uau CAIXA" antecipava um rebranding que a CAIXA ainda não publicou oficialmente — o Handex volta a usar a marca vigente até a publicação oficial. Escopo da reversão: só `blue`/`orange` (marca); superfícies neutras e semânticos (sucesso/erro) definidos em 2026-08-25 não foram alterados. ~460 ocorrências de hex arbitrário migradas em `views/`, `modules/`, `code.js` e `plugin.css`, além da escala completa no `tailwind.config.cjs`.
- **2026-08-26** — auditoria de contraste WCAG 2.1 AA em toda a UI do plugin, motivada pela reversão de marca acima (cor mais escura/saturada altera o equilíbrio de contraste em ambos os sentidos). ~55 combinações texto/fundo e ícone/fundo calculadas por luminância relativa (não estimadas visualmente). 14 reprovações confirmadas e corrigidas com o ajuste mínimo necessário em cada caso (opacidade de texto sobre header azul, `dark:` ausente em botões de link, badges de categoria de spec, texto secundário direto sobre o fundo da view sem card branco por baixo, disabled residual). Nova subseção de contraste adicionada à seção 7; 4 novos itens de dívida técnica (16–18) documentam o que passou raspando ou ficou fora do escopo desta rodada.
- **2026-08-26** — botão branco/outline neutro formalizado como variante própria no catálogo (antes confundido com "secundária/ghost", que hoje é só o caso sobre header azul). Dimensão única fechada: `py-3` + `text-[12px] font-bold` — 2 variações de tamanho coexistentes (rodapé da home em `py-2.5`/`text-[11px]`, links do guia DSC em `py-3`/`text-[11px]`) convergidas para o padrão. Sub-variante "link externo" (borda/texto azul) mantida intencionalmente nos 3 links do guia DSC — sinaliza navegação pra fora do plugin. Cards seletores de opção em grid (modal de medidas) ficam fora do catálogo por serem um componente estruturalmente diferente.
- **2026-08-26** — peso visual dos ícones Lucide uniformizado. Todos já usavam o mesmo `stroke-width` nativo (2), mas o plugin usa ~7 tamanhos diferentes (`w-2.5` a `w-6`) no mesmo viewBox de 24px — o traço fixo de 2px parecia mais grosso nos ícones pequenos e mais fino nos grandes. Regra CSS global (`plugin.css`) compensa por faixa de tamanho (`stroke-width: 2.5` em `w-2.5`/`w-3`, `2.25` em `w-3.5`/`w-4`), herdada automaticamente por qualquer ícone novo sem precisar de atributo manual por instância.
- **2026-08-26** — tamanho de ícones-irmãos revisado em todo o app, depois de a compensação de stroke-width acima não resolver um caso real (download `w-5` ao lado de lixeira `w-4.5` no rodapé da home, mesmo par de botões, mesma hierarquia). Convergido para `w-4.5`. Varredura sistemática encontrou e corrigiu mais 4 casos: botão de ajuda do header em 3 views (`w-5` → `w-4.5`, alinhando com as outras 4 views que já usavam `w-4.5`) e o chevron de expandir dentro da linha de ações de spec no hub de Frames (`w-3.5` → `w-3`, igualando aos 4 ícones de ação vizinhos). Regra nova documentada: ícones-irmãos (mesma linha, mesma hierarquia de ação) sempre usam o mesmo tamanho — exceção deliberada preservada para "voltar" (`w-5`) vs. botões de ajuda (`w-4.5`), que é hierarquia intencional, não inconsistência.

**Arquivos-fonte:** `src/plugin/styles/{tailwind.config.cjs,plugin.css}`, `src/plugin/modules/{core,messages,home-cards,onboarding,specifications,measurement,handoff}.js`, `src/plugin/views/*.html`, `src/plugin/ui.html`, `CLAUDE.md`.
