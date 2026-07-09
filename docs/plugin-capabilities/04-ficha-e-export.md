# 04 — Ficha de Handoff e Export

## Ficha de Handoff (`create-handoff`, `code.js:356+`)

### Capacidades

- Monta um frame único no canvas a partir do schema `handoffData` v2 completo: `step1` (título/versão/objetivo/status/equipe), `step2` (briefing/regras/anexos/docs), `frames[]` (specs/audit/measurements/exceções), `createdFlows[]`, `docs` (proto/a11y/research).
- Pré-requisitos de geração (bloqueio de UI): título, objetivo, ≥1 membro da equipe com nome preenchido — e-mail e papel não são obrigatórios (e-mail, se preenchido, é validado por formato).
- Versionamento: reabrir com ficha já gerada oferece escolha Major/Minor antes de recriar.
- Todos os nós gerados (frame principal, grupos de spec, legenda, medidas, observações) recebem `locked = true`.

## Import/Export

| Formato | Conteúdo | Limite |
|---|---|---|
| HTML | Standalone com Tailwind/Lucide embarcados, nome `handoff_{base}_visualizador.html` | Tags de categoria não interativas (`pointer-events: none`) — é só visualização |
| Markdown | Até 10 tokens por categoria + contagem de excedente (`+N itens`) | Cap deliberado de legibilidade, não limite técnico de linguagem |
| JSON | Backup completo de `handoffData` | Exclui `Uint8Array` de previews (não serializável em JSON puro) |

### Import

- Valida apenas a presença de `step1` na raiz do JSON — sem validação de schema mais profunda confirmada no código lido.
- Faz merge com defaults e incrementa versão minor automaticamente.

## Leitura de produto

A ficha de handoff é o artefato central de entrega do produto — sua integridade (bloqueio de edição) é proposital e deve ser destacada como diferencial de confiabilidade em qualquer justificativa, não apresentada como restrição. Os 3 formatos de export cobrem públicos diferentes: HTML para quem não tem Figma/plugin, Markdown para documentação técnica leve, JSON como fonte de verdade para integração com outros sistemas.
