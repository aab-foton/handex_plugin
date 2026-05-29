# Changelog — DSC A11Y Handoff

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
