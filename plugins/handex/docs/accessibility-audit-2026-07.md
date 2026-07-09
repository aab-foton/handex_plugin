# Handex — Auditoria de Acessibilidade (WCAG)

> Auditoria somente-leitura realizada em 2026-07-08, a pedido do usuário ("o plugin por completo tem de ser acessível, seguindo padrões WCAG"). Nenhum código foi alterado nesta etapa — este documento é o levantamento de base para priorizar correções. Escopo: 9 views em `src/plugin/views/*.html`, `src/plugin/modules/core.js`, `src/plugin/modules/specifications.js`, `tailwind.config.cjs`.

## Achado mais crítico — navegação por teclado em modais (WCAG 2.1.1, nível A)

**`core.js` não trata a tecla Escape em nenhum lugar** (zero ocorrências de `keydown`/`Escape`/`e.key ===` em todo o arquivo) e **`openModal()`/`closeModal()` não gerenciam foco**: não movem o foco para dentro do modal ao abrir, nem devolvem o foco ao elemento que disparou a abertura ao fechar. Isso reprova WCAG 2.1.1 (nível A, requisito mínimo de conformidade) para qualquer usuário dependente de teclado — sem mouse, não há como fechar um modal sem tentar tabular até encontrar o botão de fechar às cegas.

11 dos 13 modais já têm `role="dialog" aria-modal="true"` corretamente marcado (bom sinal de que a estrutura semântica foi pensada), mas a marcação sozinha não substitui o comportamento funcional de foco/Escape. Dois modais nem isso têm: `check-designs-modal` e `confirm-clear-modal`.

**Prioridade de correção: mais alta de todo o relatório** — é o único item que isoladamente barra conformidade nível A.

## 1. Contraste de cor (WCAG 1.4.3 AA / 1.4.11 AA)

Padrão sistêmico: labels/hints usam `text-gray-400`/`text-slate-400`/`text-slate-300` **sem variante `dark:`** sobre fundos claros — contraste estimado abaixo do mínimo AA (4.5:1). Ocorrências centrais: `modals.html:653-681` (labels de categoria de scan), `modals.html:787` (`text-slate-300` para texto "(opcional)"), `handoff.html:39`, `dados-projeto.html:156/183/207`.

Caso mais grave: **`modals.html:264-372`** — bloco inteiro "Tipos de Especificação" (12+ blocos) usa cores inline fixas (`style="color:#005ca9"`, `background:#EBF4FB"`) sem nenhum override `dark:`, resultando em texto/fundo claro fixo mesmo dentro de modal em tema escuro.

O padrão correto **já existe** em outras partes do código (`handoff-summary.html:64-76`, `guide.html:118-121` têm `dark:text-*` corretos) — a inconsistência é de aplicação, não de desconhecimento do padrão certo.

## 2. Tamanho de texto e zoom (WCAG 1.4.4 AA)

**Contagem real: 236 ocorrências** de texto em 9-11px nas 9 views (não 143 — número revisado após grep mais preciso). Por arquivo: `modals.html` 116, `guide.html` 59, `dados-projeto.html` 20, `handoff-summary.html` 11, `home.html` 14, `measurement.html` 7, `specifications.html` 6, `handoff.html` 2, `flows.html` 1.

Sem meta tag de viewport bloqueando zoom (`ui.html` usa `width=device-width, initial-scale=1.0`, sem `user-scalable=no`). **O zoom do sistema/navegador funciona** — a limitação real é que o plugin roda num painel de tamanho fixo controlado pelo Figma, então zoom de sistema pode cortar conteúdo em vez de reflow. Isso é parcialmente limitação de plataforma (painel estreito do Figma), mas o tamanho de fonte em si (9-10px) é decisão de design corrigível — subir para mínimo 12px é viável sem quebrar o layout compacto.

## 3. Dependência só de cor (WCAG 1.4.1, nível A)

Achados reais mais graves:
- **`validateUrl()`** (`core.js` ~1850-1856): erro de URL marcado só por borda vermelha; a mensagem de erro é um toast transitório de 3s — depois disso, resta só a cor da borda como indicador permanente, sem texto persistente. Mesmo padrão que o campo de e-mail tinha **antes** da correção já aplicada nesta sessão (agora o e-mail tem hint persistente + `aria-invalid`; a URL não foi corrigida da mesma forma).
- **`modals.html:183-207,431-451`** ("Lado da Conexão/Guia"): `<input type="radio">` real está `hidden` (removido da árvore de tab), estado comunicado só por mudança de cor via `group-has-[:checked]:text-[#0070af]` — combina falha de cor-só-indicador com falha de teclado (não navegável via Tab).

## 4. Tooltips e texto alternativo (WCAG 1.1.1 / 4.1.2, nível A)

Padrão inconsistente: botões de navegação principal (FABs, botões fechar modal) **já têm** `aria-label` corretamente. Em contraste, botões de ação gerados **dinamicamente** em `specifications.js` (localizar no canvas, remover frame/spec/propriedade, deletar) têm apenas `title`, sem `aria-label` — insuficiente para leitores de tela que não expõem `title` de forma confiável. Botão fechar snackbar em `dados-projeto.html:282-285` não tem nem um nem outro.

Estimativa: 6-8 botões-ícone recorrentes (multiplicados pelos N cards renderizados dinamicamente) sem `aria-label`.

## 5. Navegação por teclado, detalhes adicionais (WCAG 2.1.1 / 2.4.3)

Além do achado crítico de modais (topo do documento): elementos clicáveis customizados sem `tabindex`/`role="button"` — item de alerta de conformidade (`specifications.js`, `<li onclick="focusNode(...)">`) e cabeçalho de card de frame inteiro clicável (`specifications.js`, `<div onclick="toggleFrameAccordion(...)">`). Contraponto positivo: accordions em `guide.html` usam `<button>` real, corretos — o padrão certo existe, não foi replicado em todo lugar.

## 6. Labels e formulários (WCAG 1.3.1 / 3.3.2, nível A)

Padrão misto. Corretos (`<label for=>` associado): campos principais do Step 1 (`s1-titulo`, `s1-versao`, `s1-objetivo`), vários inputs de modal. **Placeholder-only** (mesmo padrão que o campo de e-mail tinha antes da correção desta sessão, ainda não replicada aos demais campos): `s1-jornada`/`s1-feature`, os 3 links de documentação (proto/a11y/research), textarea de observação de exceção. Selects nativos ocultos substituídos por dropdown custom **sem `aria-label`** no botão substituto: seletor de status do projeto, categoria de anotação, seletor de frame (specs e medidas).

## 7. Estrutura semântica (WCAG 1.3.1, nível A)

Sem `<h1>` na UI do plugin (só existe dentro do HTML gerado no canvas do Figma, não na interface). 25 headings reais (`h2`-`h4`), mas ao menos 12 "títulos visuais" são `<span>`/`<p>` estilizados em vez de heading semântico.

**Achado mais sistêmico desta categoria**: as 4 listas de conteúdo mais importantes do plugin — specs, medidas, fluxos, frames — são todas `<div>` vazias preenchidas via `document.createElement('div')`, nunca `<ul>/<li>`. O padrão correto (`<ol>/<ul>+<li>`) já existe em `guide.html` e nos alertas de conformidade, mas não foi aplicado às listas principais de dados do usuário — que são justamente o conteúdo mais navegado por leitores de tela.

## Leitura consolidada

A auditoria revela um padrão recorrente: **o código certo já existe em algum lugar do plugin, mas não foi aplicado de forma sistemática**. Isso é uma boa notícia relativa — não é preciso "aprender" o padrão de acessibilidade certo, é preciso *auditar e replicar* o que já está bem feito em `guide.html`/`handoff-summary.html`/FABs de navegação para o resto do produto (`modals.html`, `dados-projeto.html`, listas geradas dinamicamente).

A correção aplicada ao campo de e-mail nesta mesma sessão (hint de erro persistente + `aria-invalid` + `aria-describedby`) é exatamente o padrão que precisa ser replicado nos outros pontos apontados nas seções 3 e 6.

## Priorização recomendada

1. **Foco/Escape em modais** (seção 5, achado crítico) — único item que sozinho reprova nível A; afeta todos os 13 modais do plugin.
2. **`aria-label` em botões-ícone dinâmicos** (seção 4) e **radios ocultos sem alternativa de teclado** (seção 3) — baixo esforço, alto impacto, mesmo padrão já aplicado ao e-mail.
3. **Listas semânticas** (`<ul>/<li>` nas 4 listas principais, seção 7) — exige tocar em `specifications.js`/`measurement.js`/`handoff.js` na geração dinâmica de itens, esforço médio.
4. **Contraste de cor no modal "Tipos de Especificação"** (seção 1) — correção pontual mas de várias linhas (12+ blocos).
5. **Tamanho de fonte geral** (seção 2) — o item de maior volume (236 ocorrências), mas o de menor urgência WCAG isolada; melhor tratado como padronização de design system do próprio plugin, não como bug pontual.

Nenhuma correção foi aplicada ainda — este documento existe para decidir, com o usuário, por onde começar.
