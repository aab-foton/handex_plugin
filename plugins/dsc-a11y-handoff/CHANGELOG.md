# Changelog — DSC A11Y Handoff

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
