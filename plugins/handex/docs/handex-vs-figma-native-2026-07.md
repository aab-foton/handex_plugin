# Handex vs. Figma nativo — comparativo e plano de implementação (2026-07-09)

> Complementa `figma-api-roadmap-2026.md` (2026-07-07). Este documento nasce de uma pergunta direta: "dado tudo que o Figma já lançou até o Config 2026, alguma feature do Handex virou redundante?" — cobre Config 2025 → Config 2026, Dev Mode, Annotations, Check Designs, Variables API, measurements, prototype flows.

## Contexto da revisão de prioridade (2026-07-09)

A análise original estimou "Check Designs sai de early access em 12–18 meses" como projeção genérica de ritmo histórico do Figma — **não é dado confirmado pela Figma**. O dono do produto ponderou, com razão, que isso é pouco provável no curto prazo, por três motivos concretos:

1. Check Designs está restrito a **Organization/Enterprise desde o lançamento** — isso pode ser segmentação de plano permanente (alavanca de upsell), não uma barreira temporária de early access que "vai abrir para todo mundo".
2. A limitação central que encontramos (sem "ignorar/exceção com justificativa") é um problema de produto genuinamente difícil de resolver bem de forma genérica e escalável — pode explicar por que segue em early access sem sinal de avanço.
3. Features de linting/conformidade de design system historicamente amadurecem mais devagar que features visuais (Motion, Shaders), porque lidam com falsos positivos que irritam usuário real em produção.

**Ajuste de prioridade**: a ameaça ao scan de tokens do Handex é mais distante e incerta do que a estimativa original sugeria. Isso muda a recomendação de "congelar por precaução urgente" para "manter como está, sem pressa — revisão trimestral é suficiente, não é item de plano de implementação".

---

## Tabela comparativa final

| Capacidade do Handex | Equivalente nativo | Sobreposição | Diferencial real | Risco de obsolescência (revisado) |
|---|---|---|---|---|
| Scan de tokens vs. DSC | Check Designs (early access, Org/Enterprise) | Alta | Lib DSC curada + funciona em qualquer plano | **Baixo–Médio, sem prazo definido** — plano permanece Org/Enterprise-only, não early-access temporário |
| Auditoria declarada com ressalvas | Nenhum (pedido de feature aberto no fórum Figma, sem previsão) | Nenhuma | Registro de decisão humana, não detecção | Baixo |
| Specs anotadas no canvas | `figma.annotations` (GA) | Média | Sem seat pago, exceção estruturada, portátil | Médio, 6–12 meses |
| Medidas no canvas | Dev Mode "Add measurements" | Média | Sem seat pago, portátil | Baixo–Médio |
| Fluxos ancorados a frames reais | Prototype connections ou FigJam (arquivo separado) | Baixa | Documentação lógica no mesmo arquivo | Baixo |
| Ficha de Handoff exportável (ZIP: HTML+MD+PDF) | Nenhum | Nenhuma | Portátil sem seat/licença — tensiona o modelo de receita por seat da Figma | Muito baixo |

---

## Plano de implementação

Ordenado por prioridade real (impacto × esforço × durabilidade do diferencial), não por ordem de descoberta.

### 1. Selo de auditoria assinável (autor + timestamp na declaração de conformidade)

**Prioridade: Alta. Esforço: Baixo.**

O schema já tem `step1.equipe[]` e `audit.ressalvas[]` — falta vincular quem declarou e quando à confirmação de "sem desvios"/ressalva. Transforma um campo de texto livre em evidência auditável por terceiros (compliance, QA da CAIXA).

- [ ] Adicionar `audit.declaradoPor` (nome/e-mail do membro de equipe) e `audit.declaradoEm` (timestamp ISO) ao schema, populados no momento em que `semDesvios` é marcado ou uma ressalva é salva
- [ ] Exibir "declarado por X em DD/MM/AAAA" no card de auditoria da UI (`specifications.js`/`handoff.html`)
- [ ] Incluir esse selo na Ficha exportada (MD/HTML) — reforça o valor de "documento auditável" já existente
- [ ] Migração: registros antigos sem esses campos devem degradar graciosamente (campo vazio/"não informado"), sem quebrar schema v2 existente

### 2. Diff visual entre versões da ficha de handoff

**Prioridade: Média-alta. Esforço: Médio.**

`previousSnapshot` já existe no código (`handoff.js`) — a base estrutural está pronta. Não existe nada parecido nativamente no Figma (nem Check Designs, nem comparação de versão orientada a handoff).

- [ ] Definir o que conta como "mudança" entre snapshots: specs adicionadas/removidas, medidas alteradas, ressalvas resolvidas/novas, mudança de status de conformidade por frame
- [ ] Renderizar um resumo de delta na tela de geração de ficha ("desde a última versão: +3 specs, 1 ressalva resolvida, 2 medidas alteradas")
- [ ] Incluir o delta como seção na Ficha exportada (não só na UI do plugin)
- [ ] Validar com `data-analytics` a estrutura de comparação de snapshot antes de implementar (evitar over-engineering de diff genérico quando o caso de uso é específico)

### 3. Ler prototype connections existentes para pré-popular fluxos

**Prioridade: Investigar antes de comprometer. Esforço: desconhecido até a investigação.**

Se os frames do DSC já usam prototyping real, o Handex poderia ler `reactions`/`transitionNodeID` via Plugin API para sugerir o mapeamento de fluxo — o designer confirma/edita depois (sugestão assistida, não geração automática, preserva a declaração humana como camada final).

- [ ] Levantar com `data-design`/time de design quanto os frames reais da CAIXA já usam prototyping nativo (se a resposta for "quase nunca", a feature não compensa o esforço)
- [ ] Se viável: spike técnico lendo `reactions` de um frame de teste via Plugin API, confirmar que os dados são suficientes para inferir origem→destino com confiança
- [ ] Não prosseguir para implementação completa sem essa validação prévia

### Sem ação imediata — só monitoramento

- **Check Designs saindo de early access ou mudando de tier**: revisão trimestral do changelog oficial do Figma, não item de sprint. Se a CAIXA/Fóton migrar para Organization/Enterprise por qualquer outro motivo (não relacionado ao Handex), reavaliar a prioridade do item acima então — não antes.
- **Migração de specs/medidas para `figma.annotations`/Dev Mode measurements nativos**: já registrado em `figma-api-roadmap-2026.md` item 1 como oportunidade de médio prazo (reduz nós manuais no canvas), mas exige decisão explícita sobre manter ou não a Ficha exportada em paralelo (não é substituição 1:1, ver risco já documentado lá). Não entra neste plano de implementação imediato — é uma decisão arquitetural maior que merece discussão própria.

---

## Fora de escopo deste plano (mencionado nas rodadas de pesquisa, sem ação recomendada)

- **Code Layers / Figma Agent (Config 2026)**: reforçam a tensão filosófica já mapeada (geração automática via IA vs. governança auditável do Handex), mas não atacam nenhuma feature específica — não requer ação, só serve de contexto para decisões futuras sobre MCP Server (ver item 4 do roadmap original).
- **`figma.currentPage.focusedNode`**: sem gancho de produto hoje, pois o Handex roda no canvas de Design, não dentro do Dev Mode.
- **Trilha de auditoria em nível de sessão** (quem abriu o plugin, quando, o que mudou entre sessões): aposta de médio-longo prazo, esforço maior que os itens 1-3 acima, não priorizada nesta rodada.
