# Design System do Handex

**Versão do DS:** 1.6
**Data de fechamento:** 2026-08-25 · última revisão: 2026-09-24 (catálogo completo de 97 ícones com referência de import `lucide-react`, espelhado 1:1 com a página navegável)
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

### Restrição de paleta — só cores da lib "DSC | Fundamentos Visuais"; exceção: categorias de spec (2026-10-01)

Decisão do Augusto: **toda cor da UI do plugin e do que ele desenha no canvas (Ficha, medidas, fluxos, anotações) vem da lib "DSC | Fundamentos Visuais"** (`refs/fundamentos-visuais.json`, variáveis `color/*`, coleção "DSC"). **Única exceção: as cores das categorias de spec**, que seguem a paleta própria já documentada (ver "Categorias de spec — canônico" abaixo) e **não** são restringidas à lib. Cor nova só se existir na lib. O **roxo/violeta fica fora** da UI (`violet`, `purple`, `indigo`, `fuchsia`, `#3d3dff`, `#7c3aed`, `#6366f1`, `#4f46e5`, `#9333ea`) e a família `uva` da lib (mauve `#93537d`) não é usada fora das categorias de spec. Famílias disponíveis: marca azul `primary` (`#e5f2fc` 10 · `#a0d2fc` 30 · `#6dbafa` 50 · `#2d8ad8` 70 · `#005ca9` 90 · `#00437a` 110 · `#002747` 130), marca laranja `secondary` (`#ffefd6` · `#ffd392` · `#fdb548` · `#f39200` 70 · `#d87b00` 90 · `#a65e00` 110 · `#663a00` 130), neutros `grayscale` (`#f7fafa`, `#ebf1f2`, `#d0e0e3`, `#9eb2b8`, `#64747a`, `#404b52`, `#22292e`), feedback `positive`/`attention`/`negative`/`informative`, decorativas `tertiary` (turquesa), `ceu`, `limao`, `tangerina`, `goiaba`.

**Como foi aplicado (`tailwind.config.cjs`):** mesmo método de `blue`/`orange` — as escalas padrão do Tailwind foram **redefinidas** com degraus ancorados nos valores reais da lib e intermediários interpolados, para que as classes já usadas nas views continuem valendo sem reescrever as telas.

| Escala | Ancoragem na lib | Degraus-chave |
|---|---|---|
| `slate` e `gray` (idênticas) | grayscale | 50 `#f7fafa` · 100 `#ebf1f2` · 300 `#d0e0e3` · 500 `#64747a` (4,9:1 sobre branco) · 700 `#404b52` · 800 `#22292e` · 900 `#1a1f23` (interpolado) |
| `red` | negative | 50 `#fbebeb` · 400 `#e47272` (texto no tema escuro, 4,9:1) · 500 `#b22c2c` (6,4:1) · 700 `#8c2424` |
| `green` | positive | 50 `#e7f4ea` · 400 `#5cb26e` · 500 `#127527` (5,8:1) · 700 `#0d581d` |
| `amber` | attention | 50 `#fff9e6` · 400 `#fcbe05` · 500 `#977203` (4,45:1) · 700 `#654c02` |
| `ceu` (card Tokens) | ceu | 50 `#e8faff` · 400 `#00b4e6` · 600 `#007899` (5,1:1) · 700 `#006480` |
| `turquesa` (card Specs Rápidas) | tertiary | 400 `#54bbab` · 600 `#2b8174` (4,7:1) · 700 `#216e62` |
| `info` (card Medidas) | informative | 400 `#04a2bf` · 600 `#037286` (5,6:1) · 700 `#026273` |
| `blue`, `orange` | primary, secondary | já ancoradas (ver "Paleta de marca") |

`sky`/`cyan`/`teal`/`emerald`/`pink` deixaram de ser usadas: `sky`→`ceu`, `cyan`→`info`, `teal`→`turquesa`, `emerald`→`green`/`st-ok`, `pink` (Motion na Ficha HTML)→`turquesa`; `indigo`→`blue`, `purple`→`orange`, `violet` (Novo Componente)→`st-info`. No canvas (`code.js`), cada `{ r, g, b }` fora da lib foi mapeado para o token de lib semanticamente mais próximo (cinza de texto/borda/fill → grayscale; erro → negative 90; sucesso → positive 90; alerta/exceção → secondary 110; informação/confirmação → primary 90; fundos claros → degrau 10). A **Ficha HTML exportada** (`handoff.js`) carrega a mesma configuração de cores no `tailwind.config` do template (cópia literal: manter sincronizada com `tailwind.config.cjs`).

**O que conta como "cor de categoria de spec" (exceção, não restringir nem alterar):** as 4 categorias (`info` Informação Extra, `comportamento`, `regra` Regra de Negócio, `api` Dados da API) e toda paleta que identifique **categoria/letra de spec** — selo (A, B, C), contorno e card de spec no canvas, chip de categoria na lista, legenda "Tipo de especificação" (`modals.html`) e legenda "Legendas de Especificação" do canvas, chip na Ficha HTML e no Markdown, e a paleta de fallback para categorias personalizadas (`_CAT_FALLBACK_PALETTE`, `specifications.js`). **Não contam como categoria** (seguem a lib): tipos de exceção (Erro/Alerta/Sucesso/Confirmação), status de conformidade, badge COMPLETO, tipos de conexão de fluxo, medidas, eixos do Briefing.

**Aceitos como degraus do Handex, mesmo fora da lib exata:** `#004d8d` (`blue-600`, hover/fundo da Ficha), `#935300`/`#bf6c00` (`orange-800`/`700`) e demais degraus interpolados de `blue`/`orange`, e os degraus interpolados das escalas acima (200/400/600 neutros, 900/950). São intermediários entre dois valores reais da lib, não cores novas.

### Superfícies light/dark (`tailwind.config.cjs`)

| Token | Light | Dark |
|---|---|---|
| `light.bg` / `dark.bg` | `#ebf1f2` (grayscale 30) | `#1a1f23` (`slate-900`) |
| `light.surface` / `dark.surface` | `#ffffff` | `#22292e` (grayscale 130) |
| `light.line` / `dark.line` | `#d0e0e3` (grayscale 50) | `#404b52` (grayscale 110) |
| `light.muted` / `dark.muted` | `#64747a` (grayscale 90) | `#9eb2b8` (grayscale 70, 6,7:1 sobre `dark.surface`) |
| `dark.text` | — (usar `slate-800`) | `#f7fafa` |

Uso: `bg-light-surface dark:bg-dark-surface`, `border-light-line dark:border-dark-line`, `text-slate-800 dark:text-dark-text`. Este é o par de tokens com maior disciplina de uso hoje — manter esse padrão como referência de "como todo token deveria ser aplicado".

### Paleta de categoria de scan (`safelist`) — órfã

A lista de 11 cores rotativas (`slate, pink, blue, lime, indigo, rose, emerald, yellow, teal, purple, cyan`) descrita nas versões anteriores não é construída por nenhum arquivo (dívida 18). Em 2026-10-01 o `safelist` foi reduzido às escalas que existem na lib (`slate`, `blue`); as demais saíram. Não confundir com a cor de **categoria de spec** abaixo.

### Categorias de spec — canônico

As 4 categorias de spec (`info`, `comportamento`, `regra`, `api`) usam **a paleta da Ficha exportada** como fonte única — é o que o desenvolvedor final vê na entrega, e é o ponto de maior peso de decisão. **Fora da restrição de paleta da lib** (ver "Restrição de paleta").

| Categoria | Fill | Texto/borda |
|---|---|---|
| `info` | `#f1f5f9` | `#475569` |
| `comportamento` | `#fdf2f8` | `#be185d` |
| `regra` | `#eff6ff` | `#1d4ed8` |
| `api` | mesmo padrão de `handoff.js:726-729` — usar o par já definido lá para a 4ª categoria |

Card no canvas (`specifications.js:449-454`) e modal de ajuda (`modals.html:396-418`) devem passar a consumir este mesmo par de valores — ver dívida técnica (seção 9, item 1). Hoje o código tem dois conjuntos documentados: o da Ficha HTML (`_getCatStyleHTML`, `handoff.js`, valores da tabela acima) e o da UI/canvas (`_CAT_COLORS`/`CATEGORY_COLORS`, `specifications.js`, e a legenda do modal de ajuda: `info` `#EBF1F2`/`#64747A`, `comportamento` `#F8EAF3`/`#93537D`, `regra` `#E5F5F8`/`#008CB2`, `api` `#F5FEC1`/`#6D8000`) — a divergência entre os dois é a dívida 1, anterior a esta decisão.

### Cores de status em TEXTO (tokens `st-*`, 2026-10-01)

Para **texto e ícones** que comunicam status (status do frame, marcadores dos itens escaneados, painel de conformidade) use os tokens `st-*` do `tailwind.config.cjs`, não as escalas padrão do Tailwind: `green-500`, `red-500`, `amber-500` e `violet-500` não passam 4,5:1 em texto de 11px (2,2 a 4,2:1). Os valores são da lib "DSC | Fundamentos Visuais" (`color/content/*`). `green-500` continua sendo o verde de **preenchimento** de sucesso (toggles, botões) descrito abaixo.

| Token | Hex | Contraste sobre branco | Tema escuro | Uso |
|---|---|---|---|---|
| `st-ok` | `#127527` (positive 90) | 5,8:1 | `st-ok-dark` `#a2d3ad` | Conforme, Em conformidade |
| `st-warn` | `#654c02` (attention 130) | 8,1:1 | `st-warn-dark` `#fee59b` | Desvio justificado, Necessita revisão |
| `st-err` | `#b22c2c` (negative 90) | 6,4:1 | `st-err-dark` `#f0afaf` | Não Conforme, Fora do padrão |
| `st-neutral` | `#64747a` (grayscale 90) | 4,9:1 | `dark-muted` | Pendente |
| `st-info` | `#005ca9` (primary 90) | 6,8:1 | `st-info-dark` `#6dbafa` | Novo Componente, badge COMPLETO |

O degrau `attention 110` (`#977203`) dá 4,45:1 e por isso não é usado em texto. Fundos de painel: `#fbebeb` (perigo), `#fff9e6` (atenção) e o `blue-50` da escala do Handex (destaque). Declarações do designer (toggle "Vai para a Ficha") **não** são status e usam o azul de toggle `#005ca9`.

### Cor de sucesso/confirmação

`green-500` (`#127527`, positive 90 da lib, escala `green` redefinida em 2026-10-01; antes `#22c55e` padrão Tailwind) é o verde oficial de sucesso/confirmação — consistente com o uso já orgânico em status "Finalizado" (`dados-projeto.html:86`) e estado confirmado (`modals.html:770`).

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

### Modal de lista com checkboxes + badge `COMPLETO` (2026-10-01)

Padrão usado por `detail-level-modal` ("Quanto detalhe cada item terá na Ficha?"): shell de modal com `max-w-sm max-h-[85vh]`, cabeçalho e rodapé fixos e miolo rolável (`overflow-y-auto`). Cada linha é um `<label>` clicável com altura mínima de 40px (checkbox + nome 11px bold + `Frame · Tipo` 10px `text-slate-600`/`dark:text-dark-muted`), agrupadas por frame quando há mais de um. Ação em lote em link azul (`text-blue-500`, alterna "Marcar todos como completo" / "Voltar todos ao essencial") e contador `aria-live="polite"`. Rodapé: primário `Salvar escolhas` (`bg-blue-500`) + outline `Cancelar`; edição só grava ao salvar, Cancelar/Escape/overlay descartam. Badge `COMPLETO` no card do item: ícone `layers` 10px + texto 9px bold, `text-st-info dark:text-st-info-dark` (azul da marca, token `st-info`; o toggle "Vai para a Ficha" usa `peer-checked:bg-[#005ca9]`, como os demais toggles — roxo/violet foi removido em 2026-10-01 por ser cor da marca antiga); itens no nível padrão (Essencial) não têm selo.

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

Biblioteca exclusiva: **Lucide** (`data-lucide="nome"` no plugin, equivalente a `lucide-react` em código) — versão fixada em **1.47.0** (`unpkg.com/lucide@1.47.0`, ver `build.cjs`) desde a correção de boot da v6.30.1. Ícone decorativo (ao lado de label, dentro de badge) segue o tamanho visual do contexto (`w-3.5`–`w-5`), sem regra de área de toque. Ícone interativo segue a regra de botão-ícone da seção "Botões" acima (40×40px de área de toque, glifo proporcionalmente visível).

**Divergência de versão conhecida:** a Ficha HTML interativa exportada (`modules/handoff.js`, template `fullHTML`) ainda carrega `lucide@latest` sem versão fixada — só a UI do plugin em si foi corrigida na v6.30.1. Não é o mesmo bug (a Ficha exportada roda fora do iframe do plugin, sem o gargalo de handshake `ui-ready`), mas é uma inconsistência de versão a alinhar.

**Catálogo completo — 97 ícones únicos** confirmados por varredura de `data-lucide="..."` em todo o código-fonte (`views/*.html`, `modules/*.js`), incluindo os resolvidos só via variável dinâmica (eixos do Briefing, categorias de spec, tipo de conexão de fluxo). Espelhado 1:1 com a tabela navegável de `docs/site/design-system.html` §4 — qualquer ícone novo precisa entrar nos dois lugares.

| Ícone (`data-lucide`) | Import React (`lucide-react`) | Uso no plugin |
|---|---|---|
| `x` | `import { X } from 'lucide-react'` | Fechar modal / dispensar banner / snackbar. |
| `chevron-down` | `import { ChevronDown } from 'lucide-react'` | Accordion (toggleAccordion) — expandir/recolher. |
| `trash-2` | `import { Trash2 } from 'lucide-react'` | Ação destrutiva — excluir spec/medida/frame, limpar dados. |
| `alert-triangle` | `import { AlertTriangle } from 'lucide-react'` | Alerta/aviso — card "Importante", desvio de conformidade. |
| `check` | `import { Check } from 'lucide-react'` | Confirmação — propriedade conforme ao DSC, checkbox marcado. |
| `sparkles` | `import { Sparkles } from 'lucide-react'` | Gerar Ficha de Handoff (CTA primário), contexto pra IA. |
| `eye-off` | `import { EyeOff } from 'lucide-react'` | Ocultar spec/medida/grupo — metade dinâmica do par eye/eye-off. |
| `eye` | `import { Eye } from 'lucide-react'` | Exibir spec/medida/grupo — metade dinâmica do par eye/eye-off. |
| `download` | `import { Download } from 'lucide-react'` | Baixar backup JSON, exportações da Ficha. |
| `book-open` | `import { BookOpen } from 'lucide-react'` | Ver documentação completa — link pro Figma de metodologia. |
| `help-circle` | `import { HelpCircle } from 'lucide-react'` | Ajuda contextual em campos e popovers. |
| `arrow-left` | `import { ArrowLeft } from 'lucide-react'` | Botão voltar do header — sempre w-5, exceção deliberada de tamanho maior. |
| `plus` | `import { Plus } from 'lucide-react'` | Adicionar item — nova spec, nova medida, novo membro de equipe. |
| `git-branch` | `import { GitBranch } from 'lucide-react'` | Card Fluxos de Tela na home. |
| `circle-help` | `import { CircleHelp } from 'lucide-react'` | Ícone de ajuda/onboarding no header secundário — w-4.5. |
| `pencil` | `import { Pencil } from 'lucide-react'` | Editar — renomear grupo, editar campo. |
| `grip-vertical` | `import { GripVertical } from 'lucide-react'` | Alça de arrastar — reordenar cards da home. |
| `clipboard-list` | `import { ClipboardList } from 'lucide-react'` | Card Informações do Projeto na home. |
| `spline` | `import { Spline } from 'lucide-react'` | Estilo de linha Angular em conexões de fluxo. |
| `scan-line` | `import { ScanLine } from 'lucide-react'` | Card Escanear Tokens na home. |
| `loader-2` | `import { Loader2 } from 'lucide-react'` | Spinner de carregamento (animação de rotação via CSS). |
| `file-plus-2` | `import { FilePlus2 } from 'lucide-react'` | Criar novo documento/anexo. |
| `check-circle` | `import { CheckCircle } from 'lucide-react'` | EM CONFORMIDADE — selo de auditoria DSC. |
| `tag` | `import { Tag } from 'lucide-react'` | Card Anotar Specs Detalhadas na home; badge de tag de spec. |
| `send` | `import { Send } from 'lucide-react'` | Gerar Ficha de Handoff — ícone alternativo em onboarding. |
| `search` | `import { Search } from 'lucide-react'` | Campo de busca — filtro de specs/frames. |
| `ruler` | `import { Ruler } from 'lucide-react'` | Card Anotar Medidas na home. |
| `refresh-cw` | `import { RefreshCw } from 'lucide-react'` | Re-escanear frame / atualizar seção já inserida na Ficha. |
| `move` | `import { Move } from 'lucide-react'` | Reordenar — junto de grip-vertical no drag-and-drop da home. |
| `minus` | `import { Minus } from 'lucide-react'` | Remover item de lista / decrementar contador. |
| `link-2` | `import { Link2 } from 'lucide-react'` | Vínculo entre elementos — referência cruzada. |
| `link` | `import { Link } from 'lucide-react'` | Link de referência — Protótipo, Handoff de Acessibilidade, Pesquisa UX. |
| `layers` | `import { Layers } from 'lucide-react'` | Toolkit DSC — link de documentação de apoio. |
| `graduation-cap` | `import { GraduationCap } from 'lucide-react'` | Onboarding contextual por ferramenta. |
| `file-text` | `import { FileText } from 'lucide-react'` | Exportação em Markdown / documento de leitura. |
| `external-link` | `import { ExternalLink } from 'lucide-react'` | Abrir no Figma — deep link pro elemento no canvas. |
| `corner-down-right` | `import { CornerDownRight } from 'lucide-react'` | Indicador de sub-item / resposta aninhada. |
| `arrow-right` | `import { ArrowRight } from 'lucide-react'` | Avançar — navegação entre etapas, seta de fluxo. |
| `zoom-in` | `import { ZoomIn } from 'lucide-react'` | Aumentar escala da interface do plugin. |
| `upload` | `import { Upload } from 'lucide-react'` | Importar JSON — rodapé da home. |
| `sticky-note` | `import { StickyNote } from 'lucide-react'` | Nota personalizada em spec. |
| `search-x` | `import { SearchX } from 'lucide-react'` | Estado vazio de busca — nenhum resultado encontrado. |
| `plus-circle` | `import { PlusCircle } from 'lucide-react'` | Adicionar (variante circular) — cenário de exceção, também usado dinamicamente em diffs de versão. |
| `minimize-2` | `import { Minimize2 } from 'lucide-react'` | Minimizar o plugin. |
| `info` | `import { Info } from 'lucide-react'` | Hint informativo — bullets de contexto dispensáveis. |
| `component` | `import { Component } from 'lucide-react'` | Referência de componente DSC vinculado a uma spec. |
| `check-circle-2` | `import { CheckCircle2 } from 'lucide-react'` | Confirmação de sucesso — variante preenchida. |
| `alert-circle` | `import { AlertCircle } from 'lucide-react'` | FORA DO PADRÃO — selo de auditoria DSC (desvio). |
| `zap` | `import { Zap } from 'lucide-react'` | Comportamento — categoria de spec (reação do sistema); ícone do card Anotar Specs Rápidas na home. |
| `x-circle` | `import { XCircle } from 'lucide-react'` | Erro/falha — cenário de exceção tipo Erro. |
| `shield-check` | `import { ShieldCheck } from 'lucide-react'` | Conformidade validada / selo de segurança. |
| `scaling` | `import { Scaling } from 'lucide-react'` | Altura e Largura — tipo de medida (W×H). |
| `pencil-ruler` | `import { PencilRuler } from 'lucide-react'` | Refinamento de componentes — edição técnica. |
| `move-right` | `import { MoveRight } from 'lucide-react'` | Transição/sequência — conexão de fluxo tipo Sequência. |
| `more-horizontal` | `import { MoreHorizontal } from 'lucide-react'` | Menu de mais ações — horizontal. |
| `message-square-plus` | `import { MessageSquarePlus } from 'lucide-react'` | Exportar Briefing Estratégico. |
| `lock` | `import { Lock } from 'lucide-react'` | Bloquear spec/grupo — travar posição no canvas. |
| `locate` | `import { Locate } from 'lucide-react'` | Focar elemento no canvas. |
| `library` | `import { Library } from 'lucide-react'` | Referência de biblioteca DSC; também o indicador "LIB LEGADA — PRECISA MIGRAR" (Fase 4, 2026-09-30): texto 9px bold `slate-600` (dark `slate-300`), neutro de propósito — conforme, só um aviso, nem verde nem âmbar nem vermelho —, aparece sob o selo de conformidade no card do scan quando `item.legacyLib` e a auditoria do frame está ativa. **Desligado por flag (`LEGACY_LIB_MIGRATION_HINT_ENABLED = false`, 2026-10-01)** — badge não é renderizado; religar trocando a flag para `true`. |
| `crosshair` | `import { Crosshair } from 'lucide-react'` | Ancoragem/mira — mini-mapa de conexão de fluxo. |
| `chevron-right` | `import { ChevronRight } from 'lucide-react'` | Navegação — trilha de token (cor, primária, 500). |
| `zoom-out` | `import { ZoomOut } from 'lucide-react'` | Diminuir escala da interface do plugin. |
| `sun` | `import { Sun } from 'lucide-react'` | Tema claro — metade do par sun/moon. |
| `sliders-horizontal` | `import { SlidersHorizontal } from 'lucide-react'` | Controles do grupo de specs — ocultar linhas/grupo, cadeado. |
| `package` | `import { Package } from 'lucide-react'` | Sobre o Handex — modal de informações do plugin. |
| `more-vertical` | `import { MoreVertical } from 'lucide-react'` | Menu de mais ações — vertical. |
| `moon` | `import { Moon } from 'lucide-react'` | Tema escuro — metade do par sun/moon. |
| `minus-circle` | `import { MinusCircle } from 'lucide-react'` | Remover (variante circular) — propriedade não aplicada/inativa, também em diffs de versão. |
| `maximize-2` | `import { Maximize2 } from 'lucide-react'` | Expandir/restaurar tamanho do plugin. |
| `lock-open` | `import { LockOpen } from 'lucide-react'` | Destravar spec/grupo — metade do par lock/lock-open. |
| `line-chart` | `import { LineChart } from 'lucide-react'` | Indicador de progresso/estatística. |
| `lightbulb` | `import { Lightbulb } from 'lucide-react'` | Dica/sugestão contextual. |
| `layout-dashboard` | `import { LayoutDashboard } from 'lucide-react'` | Loading overlay de geração da Ficha. |
| `layout` | `import { Layout } from 'lucide-react'` | Categoria frames no scan de tokens. |
| `image` | `import { Image } from 'lucide-react'` | Categoria ícones / preview de imagem. |
| `focus` | `import { Focus } from 'lucide-react'` | Padding Interno — tipo de medida. |
| `file-down` | `import { FileDown } from 'lucide-react'` | Baixar arquivo — variante de export. |
| `file-check` | `import { FileCheck } from 'lucide-react'` | Documento validado/completo. |
| `file` | `import { File } from 'lucide-react'` | Documento genérico — anexo. |
| `code-2` | `import { Code2 } from 'lucide-react'` | Referência técnica/código — Code Connect. |
| `clock` | `import { Clock } from 'lucide-react'` | Histórico/tempo — changelog, versão. |
| `circle` | `import { Circle } from 'lucide-react'` | Marcador neutro — bullet genérico de propriedade. |
| `chevron-up` | `import { ChevronUp } from 'lucide-react'` | Voltar ao topo — botão flutuante (btn-top). |
| `braces` | `import { Braces } from 'lucide-react'` | Exportação em JSON — dado bruto. |
| `box-select` | `import { BoxSelect } from 'lucide-react'` | Espaçamento Externo — tipo de medida (margin). |
| `align-horizontal-space-between` | `import { AlignHorizontalSpaceBetween } from 'lucide-react'` | Padding e Gaps — tipo de medida (Auto Layout). |
| `alert-octagon` | `import { AlertOctagon } from 'lucide-react'` | Erro crítico — variante de alerta mais severa. |
| `git-fork` | `import { GitFork } from 'lucide-react'` | Conexão de fluxo tipo Decisão paralela/gateway — só via variável dinâmica. |
| `layout-grid` | `import { LayoutGrid } from 'lucide-react'` | Onboarding da Página Inicial — só via ONBOARDING_TOOLS.home.icon. |
| `database` | `import { Database } from 'lucide-react'` | Dados da API — categoria de spec, só via reference.items. |
| `scale` | `import { Scale } from 'lucide-react'` | Regra de Negócio — categoria de spec, só via reference.items. |
| `edit-3` | `import { Edit3 } from 'lucide-react'` | Campo modificado — diff de versão da Ficha, só via mapa de cor dinâmico. |
| `briefcase` | `import { Briefcase } from 'lucide-react'` | Eixo Contexto do Projeto — Briefing Estratégico, só via config de eixo. |
| `git-merge` | `import { GitMerge } from 'lucide-react'` | Eixo Escopo e Riscos — Briefing Estratégico, só via config de eixo. |
| `users` | `import { Users } from 'lucide-react'` | Eixo Usuários e Stakeholders — Briefing Estratégico, só via config de eixo. |
| `compass` | `import { Compass } from 'lucide-react'` | Eixo UX e Design — Briefing Estratégico, só via config de eixo. |
| `flask-conical` | `import { FlaskConical } from 'lucide-react'` | Eixo Pesquisa e Evidências — Briefing Estratégico, só via config de eixo. |

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

## 7.5 Glossário de vocabulário

Regra: **português para comunicação** (títulos, frases, avisos, botões); **nomenclatura técnica do Figma e do dev** (como no Dev Mode e em CSS) em inglês, sem traduzir — Auto layout, Gap, Padding, Width/Height (Fixed, Hug contents, Fill container), Fill, Border, Radius, Drop shadow, Text style, Component/Variant/Boolean/Instance swap etc. O espelho do glossário vive em `HX_GLOSSARY` (`modules/core.js`) e `HD_GLOSSARY` (`code.js`) — os dois precisam ficar sincronizados.

| Termo antigo | Termo atual |
|---|---|
| Cor (Fill) | Fill |
| Contorno / Cor (Stroke) / Border Color | Border color |
| Border Width / Espessura de borda | Border width |
| Raio de borda | Radius |
| Espaçamento (Gap) | Gap |
| Gap (eixo cruzado) | Row gap |
| Padding Interno | Padding |
| Tipografia / Text Style | Text style |
| Família | Font family |
| Peso | Font style |
| Tamanho da fonte | Font size |
| Direção | Auto layout (Horizontal/Vertical) |
| Alinhamento (MIN / MIN) | Primary / Counter axis (Min / Min) |
| Altura / Largura | Height / Width |
| W Sizing / H Sizing (Sizing Largura/Altura) | Width (sizing) / Height (sizing) |
| Dimensões | Width × Height |
| Componente | Component |
| Subcomponente trocado | Instance swap |
| Effect (Sombra) / Effect (Blur) | Effect (valor: Drop shadow, Inner shadow, Layer blur, Background blur) |
| Prop: X | Component properties: X |
| Hug Contents / Fill Container | Hug contents / Fill container |

**Dados antigos:** scans, specs e Spec Rápida salvos antes dessa uniformização guardam o rótulo antigo. A exibição passa por `_vocabLabel(label, key)` / `_vocabValue(value)` (`core.js`): usa a `key` estável quando existe (specs detalhadas), senão uma tabela de aliases do rótulo antigo. O dado persistido não é reescrito.

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
16. **Badge "Comportamento" da legenda de tipos de spec passa no piso, mas com pouca folga** — `modals.html` (`text-[#93537D]` sobre `bg-[#F8EAF3]`) mede 4.53:1, acima do piso de 4.5:1 mas por pouco. Cor de categoria de spec (exceção da restrição de paleta, 2026-10-01): não alterar; qualquer ajuste futuro de fill/tom deste badge específico deve reverificar o contraste antes de publicar.
17. **Assimetria de contraste do botão "dispensar" do banner de onboarding entre temas** — no light mode o ícone precisou subir de `/60` para `/80` de opacidade para passar do piso de 3:1 (ver seção 7, item 2). O par dark (`dark:text-blue-300/60`) já passava a 3.93:1 e não foi tocado — os dois temas usam frações de opacidade diferentes hoje (`/80` light, `/60` dark) para o mesmo elemento visual. Funciona, mas não é simétrico; um ajuste futuro que tente "unificar" a opacidade entre temas precisa recalcular, não presumir que o mesmo valor serve para os dois.
18. **Paleta de categoria de scan (11 cores, `tailwind.config.cjs:69-93` safelist) parece órfã** — nenhum arquivo em `modules/*.js` ou `views/*.html` foi encontrado construindo dinamicamente as classes `bg-{cor}-50 text-{cor}-600 border-{cor}-200` descritas no comentário do safelist ("built dynamically via `_getCatColor`"). A função `_getCatColor` que existe hoje em `specifications.js:458` é sobre categoria de **spec** (info/comportamento/regra/api), não sobre esse ciclo de 11 cores. Se a feature que consumia essa paleta foi removida, o safelist deveria ser removido junto (reduz o CSS compilado); se ainda existe em algum lugar não encontrado nesta auditoria, precisa de investigação antes de confiar nos tons — 4 das 11 cores (`lime-700`, `rose-600`, `pink-600`, `teal-600`, todas sobre seu par `-50`) reprovariam o piso de 4.5:1 se algum dia voltarem a ser renderizadas (ver seção 7).
19. **Contadores de caractere (`text-[9px] text-slate-400 dark:text-dark-muted`, ex: `dados-projeto.html:45,96,115,134,146`, `modals.html:127` e ~15 outras ocorrências) reprovam o piso de 4.5:1 sobre card branco** (`#9ca3af`≈slate-400 sobre `#ffffff` mede ~2.6:1). Não corrigido nesta auditoria — é um padrão muito replicado (~20 ocorrências) que hoje funciona como anotação secundária de apoio (contagem "0/100" ao lado do label do campo, nunca a única fonte da informação), não conteúdo primário. Fica registrado como dívida em vez de corrigido em massa porque mudar a cor de 20 pontos do produto de uma vez foge do "ajuste pontual" desta rodada — mas qualquer revisão de formulário/input deve tratar isso como pendência de contraste real, não estética (seção 7).

20. **Resolvido em 2026-10-01** — escalas padrão do Tailwind fora da lib. `slate`/`gray`/`red`/`green`/`amber` foram redefinidas em `tailwind.config.cjs` ancoradas na lib; `sky`/`cyan`/`teal`/`emerald`/`pink` foram substituídas por `ceu`/`info`/`turquesa`/`green`. Restam, de propósito, `fuchsia`/`cyan`/`lime` apenas nas variantes escuras da legenda de categorias de spec em `modals.html` (exceção das categorias). Pendências conhecidas: fallbacks de categoria (`_getCatStyleHTML` `#f9fafb`/`#e5e7eb`/`#64748b` e `_getCatColor` `#F1F5F9`/`#94A3B8`) e cor de texto `tool.color` do onboarding sobre tema escuro (contraste baixo, anterior a esta decisão).

---

## Histórico de decisões deste documento

- **2026-08-24** — levantamento inicial de fundamentos, 100% a partir do código-fonte real, publicado como auditoria (não normativo).
- **2026-08-25** — transformado em referência normativa. Decisões fechadas nesta data: cor de categoria de spec (Ficha exportada é canônica), radius único (`rounded-2xl`, `rounded-xl` eliminado), accordion único (`toggleAccordion`), verde de sucesso (`green-500`), nome canônico de tela ("Handoff"), toggle oficial (switch estilizado). Catálogo de variantes de botão formalizado (primária/secundária/destrutiva/ícone interativo/ícone utilitário) e estado disabled padronizado (`disabled:opacity-40`, `disabled:bg-gray-300` eliminado).
- **2026-08-26** — paleta de marca revertida de "Uau CAIXA" (`#3d3dff`/`#f5b400`) para a marca institucional CAIXA vigente (`#005ca9`/`#f39200`, extraída de `refs/fundamentos-visuais.json`). Motivo: a paleta "Uau CAIXA" antecipava um rebranding que a CAIXA ainda não publicou oficialmente — o Handex volta a usar a marca vigente até a publicação oficial. Escopo da reversão: só `blue`/`orange` (marca); superfícies neutras e semânticos (sucesso/erro) definidos em 2026-08-25 não foram alterados. ~460 ocorrências de hex arbitrário migradas em `views/`, `modules/`, `code.js` e `plugin.css`, além da escala completa no `tailwind.config.cjs`.
- **2026-08-26** — auditoria de contraste WCAG 2.1 AA em toda a UI do plugin, motivada pela reversão de marca acima (cor mais escura/saturada altera o equilíbrio de contraste em ambos os sentidos). ~55 combinações texto/fundo e ícone/fundo calculadas por luminância relativa (não estimadas visualmente). 14 reprovações confirmadas e corrigidas com o ajuste mínimo necessário em cada caso (opacidade de texto sobre header azul, `dark:` ausente em botões de link, badges de categoria de spec, texto secundário direto sobre o fundo da view sem card branco por baixo, disabled residual). Nova subseção de contraste adicionada à seção 7; 4 novos itens de dívida técnica (16–18) documentam o que passou raspando ou ficou fora do escopo desta rodada.
- **2026-08-26** — botão branco/outline neutro formalizado como variante própria no catálogo (antes confundido com "secundária/ghost", que hoje é só o caso sobre header azul). Dimensão única fechada: `py-3` + `text-[12px] font-bold` — 2 variações de tamanho coexistentes (rodapé da home em `py-2.5`/`text-[11px]`, links do guia DSC em `py-3`/`text-[11px]`) convergidas para o padrão. Sub-variante "link externo" (borda/texto azul) mantida intencionalmente nos 3 links do guia DSC — sinaliza navegação pra fora do plugin. Cards seletores de opção em grid (modal de medidas) ficam fora do catálogo por serem um componente estruturalmente diferente.
- **2026-08-26** — peso visual dos ícones Lucide uniformizado. Todos já usavam o mesmo `stroke-width` nativo (2), mas o plugin usa ~7 tamanhos diferentes (`w-2.5` a `w-6`) no mesmo viewBox de 24px — o traço fixo de 2px parecia mais grosso nos ícones pequenos e mais fino nos grandes. Regra CSS global (`plugin.css`) compensa por faixa de tamanho (`stroke-width: 2.5` em `w-2.5`/`w-3`, `2.25` em `w-3.5`/`w-4`), herdada automaticamente por qualquer ícone novo sem precisar de atributo manual por instância.
- **2026-08-26** — tamanho de ícones-irmãos revisado em todo o app, depois de a compensação de stroke-width acima não resolver um caso real (download `w-5` ao lado de lixeira `w-4.5` no rodapé da home, mesmo par de botões, mesma hierarquia). Convergido para `w-4.5`. Varredura sistemática encontrou e corrigiu mais 4 casos: botão de ajuda do header em 3 views (`w-5` → `w-4.5`, alinhando com as outras 4 views que já usavam `w-4.5`) e o chevron de expandir dentro da linha de ações de spec no hub de Frames (`w-3.5` → `w-3`, igualando aos 4 ícones de ação vizinhos). Regra nova documentada: ícones-irmãos (mesma linha, mesma hierarquia de ação) sempre usam o mesmo tamanho — exceção deliberada preservada para "voltar" (`w-5`) vs. botões de ajuda (`w-4.5`), que é hierarquia intencional, não inconsistência.
- **2026-09-24** — catálogo de ícones passou de menção genérica ("biblioteca Lucide via `data-lucide`") para tabela nomeada de **97 ícones únicos**, cada um com a importação equivalente em `lucide-react` (conversão kebab-case → PascalCase, ex: `circle-help` → `CircleHelp`, dígito colado ao segmento anterior em `edit-3` → `Edit3`). Motivado por pedido do usuário de cobrir todos os ícones do plugin com referência de código React na documentação. Levantamento por grep real em todo `views/*.html`/`modules/*.js`, incluindo ícones resolvidos só via variável dinâmica (eixos do Briefing, categorias de spec, tipo de conexão de fluxo) — a estimativa anterior de "~70 ícones" (só existia na página navegável, nunca neste `.md`) estava desatualizada. Tabela espelhada 1:1 em `docs/site/design-system.html` §4, cujos SVGs também deixaram de ser desenhados à mão e passaram a usar o traço real de `lucide-static@1.47.0` (mesma versão fixada em `build.cjs`). Achado incidental: a Ficha HTML interativa exportada (`modules/handoff.js`) ainda usa `lucide@latest` sem versão fixada — divergência sinalizada, não corrigida nesta rodada de documentação.

**Arquivos-fonte:** `src/plugin/styles/{tailwind.config.cjs,plugin.css}`, `src/plugin/modules/{core,messages,home-cards,onboarding,specifications,measurement,handoff}.js`, `src/plugin/views/*.html`, `src/plugin/ui.html`, `CLAUDE.md`.
- **2026-10-01** — paleta restrita à lib "DSC | Fundamentos Visuais" em toda a UI e no canvas (seção 1, "Restrição de paleta"): escalas `slate`/`gray`/`red`/`green`/`amber` redefinidas, `ceu`/`turquesa`/`info` criadas, superfícies `light`/`dark` migradas, `code.js` e Ficha HTML alinhados. **Exceção explícita do Augusto: as cores das categorias de spec seguem a paleta já documentada e não foram alteradas** (a primeira rodada do dia as havia alterado para goiaba/lib; revertido). Contraste verificado por luminância relativa (texto >= 4,5:1, componentes >= 3:1).
