---
layout: page
title: Design System da Interface
nav_order: 5
permalink: /design-system.html
---

<style>
.swatch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: monospace;
  font-size: 12px;
}
.swatch-color {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid rgba(0,0,0,0.15);
  vertical-align: middle;
}
</style>

# Design System da Interface do hac

> Este documento é sobre a **linguagem visual da própria interface** do
> plugin hac (`src/plugin/views/*.html`, `src/plugin/styles/`) — não deve
> ser confundido com o DSC da CAIXA, que o plugin *referencia* como fonte
> de componentes reais (isso está coberto na
> [Documentação Técnica](tecnico.html), seção 6). Aqui o assunto é: como a
> própria UI do hac é construída e por que ela segue os padrões que segue.

Base técnica: Tailwind CSS (com tema customizado em
`src/plugin/styles/tailwind.config.cjs`) + CSS solto em
`src/plugin/styles/plugin.css` para overrides e componentes que o Tailwind
puro não cobre bem (tooltips, FABs, cards uniformes). Tudo compilado para
`src/plugin/styles/tailwind-compiled.css` (não editado à mão).

## Sumário

1. [Paleta de cores](#1-paleta-de-cores)
2. [Cores por categoria de acessibilidade](#2-cores-por-categoria-de-acessibilidade)
3. [Tipografia](#3-tipografia)
4. [Ícones (Lucide)](#4-ícones-lucide)
5. [Padrão de modal](#5-padrão-de-modal)
6. [Cards e containers](#6-cards-e-containers)
7. [Inputs, contadores de caracteres e toggles](#7-inputs-contadores-de-caracteres-e-toggles)
8. [Botões](#8-botões)
9. [Tema claro/escuro](#9-tema-claroescuro)
10. [Escala da UI](#10-escala-da-ui)

---

## 1. Paleta de cores

O hac usa duas famílias de azul/institucional distintas, além de uma cor
de acento própria:

| Uso | Cor | Onde aparece |
|---|---|---|
| Acento primário do hac (ações, links, ícone central de acessibilidade) | <span class="swatch"><span class="swatch-color" style="background:#0891B2"></span>`#0891B2` (cyan)</span> | Botões "Aplicar", ícone `person-standing` do cabeçalho do modal, badges de contagem, foco de input |
| Azul institucional CAIXA (marca, header, botões secundários) | <span class="swatch"><span class="swatch-color" style="background:#005ca9"></span>`#005ca9`</span> / <span class="swatch"><span class="swatch-color" style="background:#0070af"></span>`#0070af`</span> | Logo CAIXA em SVG no header, botões de ação primária global, ícones de "hover" em listas |
| Laranja institucional CAIXA | <span class="swatch"><span class="swatch-color" style="background:#f39200"></span>`#f39200`</span> | Só no logo SVG da CAIXA no header (`ui.html`) — não usado como cor de ação da UI |

A escala `blue` inteira (50 a 950) é redefinida no tema Tailwind
(`tailwind.config.cjs`) para ancorar em `#005ca9` (blue-500) em vez do azul
padrão do Tailwind — ou seja, quando o código usa classes utilitárias como
`bg-blue-600` ou `border-blue-500`, o resultado já é a cor institucional
CAIXA, não um azul genérico:

```js
blue: {
  50: '#f0f7ff', 100: '#e0effe', 200: '#bae0fd', 300: '#7cc7fb',
  400: '#38a9f8', 500: '#005ca9', 600: '#004782', 700: '#00335c',
  800: '#001f38', 900: '#000c17', 950: '#000308',
}
```

Além disso, `plugin.css` tem uma camada de *override global* que
força qualquer botão com classes genéricas do Tailwind
(`bg-blue-600`, `bg-blue-500`, `bg-[#0070af]`) a usar exatamente
`#005ca9`/`#004782` (hover) — isto é, mesmo que uma view use a cor "errada"
por engano, o CSS resolve para a cor institucional certa. O mesmo
mecanismo existe para `bg-orange-500`/`bg-orange-600`/`bg-green-600`/
`bg-green-500`, todos redirecionados para `#d36a00` (laranja mais escuro
que o institucional, usado como cor de destaque/atenção em botões, hover
`#b25a00`). Isso é um comentário explícito no próprio CSS: *"Global
overrides for buttons matching the Design System"*.

### Tokens de superfície (claro/escuro)

```js
light: { bg: '#eef2f7', surface: '#ffffff', line: '#dde3ec', muted: '#8394a8' },
dark:  { bg: '#0f172a', surface: '#1e293b', line: '#334155', text: '#f1f5f9', muted: '#b4c6d8' },
```

Usados via classes `bg-light-bg`/`dark:bg-dark-bg`,
`border-light-line`/`dark:border-dark-line`, etc. — o par claro/escuro é
declarado lado a lado nas classes Tailwind em quase todo elemento
estrutural (headers, cards, inputs).

## 2. Cores por categoria de acessibilidade

As 5 categorias de spec (ver [Documentação Técnica, seção 2](tecnico.html#2-as-5-categorias-de-spec))
têm cada uma sua própria cor de identidade visual, cor de preenchimento
(fundo claro) e ícone Lucide — definidos em `A11Y_CATEGORIES`
(`src/plugin/modules/accessibility.js`):

| Categoria | Cor | Fill (fundo claro) | Ícone Lucide | Badge |
|---|---|---|---|---|
| Elementos e Imagens (`elemento`) | <span class="swatch"><span class="swatch-color" style="background:#FCBE05"></span>`#FCBE05`</span> | `#FFF6DC` | `image` | — |
| Estrutura da Página (`estrutura`) | <span class="swatch"><span class="swatch-color" style="background:#EF765E"></span>`#EF765E`</span> | `#FDEAE6` | `star` | — |
| Nível de Título (`titulo`) | <span class="swatch"><span class="swatch-color" style="background:#AFCA0B"></span>`#AFCA0B`</span> | `#F5F9DA` | `heading` | `H` |
| Elemento Decorativo (`decorativo`) | <span class="swatch"><span class="swatch-color" style="background:#D93636"></span>`#D93636`</span> | `#FBE4E4` | `ban` | `Ø` |
| Informações Adicionais (`informacoes`) | <span class="swatch"><span class="swatch-color" style="background:#F39200"></span>`#F39200`</span> | `#FEF1DE` | `info` | — |

Essas 5 cores são deliberadamente distintas do cyan `#0891B2` (acento
geral do hac) — servem para o designer distinguir visualmente, num
relance no canvas ou na lista de specs, a que categoria cada selo/spec
pertence, sem precisar ler o texto. `color`/`fillColor` de cada spec em
`a11ySpecs[]` são preenchidos a partir dessa tabela no momento da criação.

## 3. Tipografia

Fonte única: **Inter** (`font-family: "Inter", sans-serif`), aplicada
globalmente no `body` e reforçada nas regras de "uniformidade" do design
system (`plugin.css`, seção `DESIGN SYSTEM UNIFORMITY RULES`):

- Títulos (`h1`, `h2`, `h3`, texto de destaque `.text-[#0070af]`,
  `.text-slate-800`): `letter-spacing: -0.01em` (leve aperto, comum em
  títulos de interface densa).
- Labels e pills (`label`, textos em `10px`/`11px`, `.checklist-pill`):
  sempre `font-weight: 700` + `letter-spacing: 0.03em` (leve espaçamento,
  para textos muito pequenos/em caixa alta permanecerem legíveis).
- Corpo de input/textarea: peso médio (`font-weight: 500`), mais leve que
  labels — para diferenciar visualmente "rótulo do campo" de "conteúdo
  digitado".
- Placeholder: sempre `font-weight: 400` + cor `#94a3b8` (claro) /
  `#64748b` (escuro), mais apagado que o texto real digitado.

A UI inteira roda em escala tipográfica muito pequena (a maioria dos
textos de interface está entre `9px` e `14px`, ex.: `text-[9.5px]`,
`text-[10px]`, `text-[11px]`, `text-[14px]` para títulos de modal) — reflexo
do espaço reduzido de um painel lateral do Figma.

## 4. Ícones (Lucide)

O hac usa exclusivamente a biblioteca de ícones **Lucide**
(`<i data-lucide="...">`, renderizados via `lucide.createIcons()`), nunca
ícones customizados em SVG solto (exceto o logo institucional da CAIXA no
header, que é um SVG de marca, não um ícone de interface).

Ícones com significado semântico fixo, reconhecíveis em todo o plugin:

| Ícone | Significado |
|---|---|
| `person-standing` | Acessibilidade em geral — ícone padrão do cabeçalho do modal de spec |
| `map-pin` | Área Marcada |
| `radar` | Detecção Automática |
| `list-ordered` | Ordem de Tabulação |
| `smartphone` / `monitor` | Origem do projeto — Mobile / Web (seletor de plataforma) |
| `locate` | "Focar" — centraliza/destaca o elemento correspondente no canvas |
| `pencil` | Editar (corrigir categoria durante o wizard, editar spec) |
| `trash-2` | Excluir |
| `lock` | Campo travado/read-only (ex.: link do componente pré-selecionado) |
| `sparkles` / `wand-2` | Sugestão/preenchimento assistido |
| `grip-vertical` | Alça de arrastar (reordenar lista, ex. Ordem de Tabulação) |
| `crosshair` / `square-dashed` | Modo de captura/seleção no canvas |
| `library` | Vínculo com biblioteca DSC |
| `component` | Referência a componente DSC |
| `link-2-off` | Link/componente não resolvido |
| `moon` / `sun` | Alternância de tema escuro/claro |
| `zoom-in` / `zoom-out` / `maximize-2` / `minimize-2` | Controles de escala da UI |
| `check-circle-2` | Confirmação/sucesso |
| `alert-circle` / `alert-triangle` | Aviso/erro |
| `search` / `search-x` | Busca / busca sem resultado |
| `graduation-cap` | Onboarding/ajuda |
| `refresh-cw` | Reescanear |

Ícones de tamanho `w-4 h-4` (16px) são o padrão em títulos de modal e
botões de ação; `w-3.5 h-3.5` e menores aparecem em contextos mais densos
(ex. botão de editar categoria inline no wizard).

## 5. Padrão de modal

O hac tem 8 modais (`src/plugin/views/modals.html`), todos seguindo a
mesma estrutura de 3 blocos, sem exceção:

```html
<div id="..." role="dialog" aria-modal="true" aria-labelledby="..."
     class="hidden absolute inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
  <!-- backdrop clicável, fecha o modal -->
  <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="..." aria-hidden="true"></div>

  <!-- card do modal -->
  <div class="relative w-full max-w-sm max-h-full bg-white dark:bg-dark-surface
              rounded-2xl shadow-xl flex flex-col overflow-hidden
              animate-in zoom-in-95 duration-200">

    <!-- header: ícone + título + botão fechar (X) -->
    <div class="border-b border-gray-100 dark:border-dark-line shrink-0"> ... </div>

    <!-- corpo: sempre scrollável, nunca cresce além do card -->
    <div class="p-5 overflow-y-auto min-h-0" onscroll="handleScroll(this)"> ... </div>

    <!-- footer: ações (Cancelar / Confirmar), sempre fixo, nunca rola junto -->
    <div class="p-3 border-t border-gray-100 dark:border-dark-line flex gap-2 shrink-0"> ... </div>
  </div>
</div>
```

Pontos fixos desse padrão, válidos para os 8 modais:
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` sempre
  presentes (acessibilidade da própria interface do plugin — o hac aplica
  a si mesmo os cuidados de a11y que documenta para os produtos CAIXA).
- `position: absolute` (não `fixed`) — decisão técnica documentada na
  [Documentação Técnica, seção 10](tecnico.html#10-escala-da-ui---ui-scale-e-position-dos-modais):
  `fixed` quebra sob o `zoom` usado para a escala da UI.
  `max-h-full` no card (não unidades de viewport `vh`), pelo mesmo motivo.
- `rounded-2xl` (16px) no card do modal — mesmo raio "premium" reforçado
  globalmente para cards (seção 6).
- Botão de ação principal do footer sempre `rounded-2xl` também (não
  `rounded-lg`/`rounded-md` como os demais botões da UI) — padrão visual
  específico de footer de modal, mais arredondado que o resto da
  interface.
- Título do modal sempre com um ícone Lucide de 16px à esquerda, na cor
  cyan `#0891B2` (identidade do hac) — mesmo em modais de categorias
  específicas de acessibilidade, o ícone do título do modal continua
  sendo o cyan geral, não a cor da categoria (a cor da categoria aparece
  em outros elementos do formulário, como o badge do tipo selecionado).

## 6. Cards e containers

`plugin.css` define uma seção explícita de "regras de uniformidade" que
força, via seletor de atributo/classe global (não por componente
individual), que qualquer card/container do plugin siga o mesmo padrão:

```css
.bg-white.dark\:bg-dark-surface,
[id$="-card"],
.view > section > div {
  border-radius: 16px !important;
  border: 1px solid #f1f5f9 !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02) !important;
}
```

Ou seja: **qualquer elemento cujo id termine em `-card`**, ou que use as
classes padrão de fundo claro/escuro, ou que seja um container direto
dentro de uma `<section>` de view, automaticamente ganha o cantos
arredondados de 16px, borda sutil e sombra leve — sem que cada view
precise declarar isso manualmente. Ganha também um efeito de hover
(sombra mais forte + borda um tom mais escura) em qualquer elemento com
esse padrão.

Esse mecanismo existe para evitar deriva visual entre as várias telas do
plugin (`specifications.html` e as demais views) — um card criado numa
tela nova "herda" a aparência padrão automaticamente, mesmo que o
desenvolvedor esqueça de aplicar as classes de estilo completas.

## 7. Inputs, contadores de caracteres e toggles

Todo `input[type="text"]`, `input[type="search"]`, `select` e `textarea`
segue um padrão único forçado globalmente (`plugin.css`):

- `border-radius: 8px`, fundo `#f8fafc` (claro) / `#0f172a` (escuro),
  borda `#e2e8f0`, `font-size: 12px`.
- Foco: borda muda para `#005ca9` (azul institucional) com anel de
  destaque (`box-shadow` de 3px na cor do foco em baixa opacidade) — não
  o cyan do hac, o azul CAIXA.
- `textarea` tem `min-height: 80px` fixo.

**Contador de caracteres**: todo campo de texto livre com `maxlength` tem
um `<span>` de contador ao lado do label, no formato `N/limite`
(ex.: `0/100`, `1/8`), em `text-[9px]`, cor apagada
(`text-slate-400`/`dark:text-dark-muted`). Ver a tabela completa de
limites reais por campo na
[Documentação Técnica, seção 2](tecnico.html#2-as-5-categorias-de-spec).

**Toggles**: implementados como `<input type="radio">`/`<input
type="checkbox">` visualmente escondidos (`class="sr-only"`) dentro de um
`<label>` estilizado — o estado marcado é lido via seletor CSS
`has-[:checked]`/`group-has-[:checked]` (Tailwind), sem depender de
JavaScript para o estilo visual do toggle em si (só para a lógica de
negócio). Ex.: seletor de lado do balão de dica no onboarding (Direita /
Esquerda / Topo / Base), cada opção é um botão-cartão com ícone de seta
que muda de cor cyan quando selecionado.

## 8. Botões

Três variantes visuais recorrentes:

- **Primário** (`bg-[#0070af]`/`bg-blue-600`/`bg-blue-500`, resolvido via
  override global para `#005ca9`): fundo azul institucional sólido, texto
  branco, `font-weight: 700`, sem borda.
- **Secundário/outline** (`border-[#0070af]`/`border-blue-500`): fundo
  branco (ou `dark:bg-dark-surface`), texto e borda azul institucional.
- **Destaque/atenção** (`bg-orange-500`/`bg-green-600` — ambos resolvidos
  para o mesmo laranja `#d36a00`): usado para ações que merecem contraste
  extra, mas não são a ação primária padrão do plugin.

Botão-padrão sem classe de raio explícita ganha `border-radius: 8px`
automaticamente (fallback global em `plugin.css`).

**FAB (Floating Action Button)**: dois padrões nomeados —
`.fab-main` (botão flutuante principal, 48x48px, expande horizontalmente
ao passar o mouse revelando um label de texto — animação de
`width`/`padding` com easing customizado) e `.fab-inline` (variante
menor, 30px de altura, formato pílula, usado dentro de headers de view
para ações secundárias como "+ Nova spec"). Ambos têm uma variante
"ghost branco" (`.subheader-brand .fab-inline`) para quando aparecem sobre
um header colorido de fundo azul, garantindo contraste.

Todos os elementos interativos (`button`, `input`, `select`, `textarea`)
têm `:focus-visible` reforçado com contorno de 2px na cor de acento
(`#005ca9` claro / `#38a9f8` escuro) — cuidado deliberado de
acessibilidade da própria interface do plugin.

## 9. Tema claro/escuro

Implementado via classe `.dark` no elemento raiz (padrão Tailwind
`darkMode: 'class'`), alternável pelo ícone `moon`/`sun` no header.
Praticamente todo elemento estrutural declara o par de classes lado a
lado (`bg-white dark:bg-dark-surface`, `text-slate-800 dark:text-white`,
`border-gray-100 dark:border-dark-line`) em vez de depender de variáveis
CSS — é o padrão idiomático do Tailwind, mas significa que qualquer nova
tela precisa lembrar de declarar os dois estados manualmente (não há
fallback automático de tema escuro para elementos sem a classe `dark:`
correspondente).

A cor de acento cyan do hac (`#0891B2`) permanece a mesma nos dois temas;
o que muda é o tom de fundo/texto ao redor dela (ex.: `dark:text-cyan-400`
em vez do hex fixo, para manter contraste suficiente sobre fundo escuro).

## 10. Escala da UI

Três níveis de zoom da interface (`100%`, `115%`, `130%`), controlados
pela variável CSS `--ui-scale` aplicada via `zoom` no `body` (não
`transform: scale()`) — decisão técnica detalhada na
[Documentação Técnica, seção 10](tecnico.html#10-escala-da-ui---ui-scale-e-position-dos-modais).
Do ponto de vista puramente visual (sem entrar no "porquê" técnico, já
coberto lá): em escala alta (`body.scale-high`), o título do header e o
texto de autosave somem para economizar espaço horizontal, e o padding do
header/footer é reduzido — a interface se adapta para caber mais conteúdo
útil quando o designer aumenta o zoom para compensar a leitura em telas
pequenas ou alta densidade de pixels.
