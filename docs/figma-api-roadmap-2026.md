# Handex — Oportunidades da Figma Plugin API (análise 2026-07-07)

> Estudo prévio de novidades da Figma Plugin API e como podem evoluir o Handex. Baseado em `src/plugin/code.js`, `src/plugin/modules/specifications.js` e `src/plugin/refs/` no estado do repo nesta data. Handex é um plugin de **handoff express**: a filosofia de produto é velocidade e baixo atrito para o designer documentar — qualquer feature nova deve ser julgada primeiro por "isso acelera ou trava o fluxo express?".

## Resumo executivo

| # | Feature Figma | Impacto | Esforço | Alinhamento com "express" |
|---|---|---|---|---|
| 1 | Annotations API nativa (`figma.annotations`) | Alto | Baixo–Médio | Forte — reduz nós manuais no canvas |
| 2 | Dev Mode: `DevStatus` + `DEV_MODE_STATUS_UPDATE` | Alto | Baixo | Forte — handoff nativo sem passo extra |
| 3 | Novos `VariableScope` (opacity, stroke, effects) | Médio | Baixo | Neutro — amplia auditoria sem novo passo |
| 4 | Figma MCP Server (Dev Mode) | Médio (estratégico) | Médio | Tensiona a filosofia — ver nota abaixo |
| 5 | Slots (GA jun/2026) | Baixo p/ Handex | Alto | Baixo — Handex audita, não gera componentes |

---

## 1. Annotations API nativa (`figma.annotations`)

Hoje o Handex simula anotações manualmente — `code.js` não usa `figma.annotations`/`Annotation` nativo (confirmado por busca no código: só há um comentário `// add-annotations is handled below`, sem chamada real à API nativa). Specs de handoff provavelmente são materializadas como cards/badges desenhados no canvas.

**Onde entra:** migrar a criação de specs (`modules/specifications.js` → `code.js`) para `node.annotations = [...]` faria as specs aparecerem **nativamente no painel de Dev Mode** que o desenvolvedor já abre — sem precisar que o designer gere uma "ficha" separada só para isso. Isso é diretamente a favor da filosofia express: menos arte manual no canvas, informação aparece onde o dev já está olhando.

**Risco a avaliar:** a ficha de handoff atual (`GENERATE_HANDOFF_FILE`/handoff.js) é um artefato visual único e portátil (pode ser visto por qualquer stakeholder, não só quem tem Dev Mode). Migrar 100% para annotations nativas pode fragmentar a experiência — a ficha unificada tem valor de "documento único" que talvez valha manter em paralelo, não substituir.

## 2. Dev Mode Status (`DevStatus`) + `DEV_MODE_STATUS_UPDATE`

Evento nativo disparado quando um nó muda de status "Ready for Dev"/"Completed". Hoje a auditoria de conformidade (`audit.js`: `checkDone`, `semDesvios`) é uma declaração manual do designer, sem ligação ao status nativo de Dev Mode do Figma.

**Onde entra:** ligar `checkDone`/`semDesvios` ao `DevStatus` nativo — por exemplo, sugerir automaticamente marcar "Ready for Dev" no Figma quando o designer completa a auditoria no Handex, ou vice-versa, popular o card de auditoria quando o dev muda o status. Reduz duplicação de trabalho entre o painel nativo do Figma e o plugin — no espírito express, elimina um passo redundante.

**Cuidado:** o projeto já tem uma decisão de produto deliberada de manter separadas a camada de scan automatizado e a de declaração humana (ver `CLAUDE.md`). Ligar ao `DevStatus` não deve reintroduzir a mistura dessas camadas — o `DevStatus` seria um terceiro sinal, não substituto de nenhum dos dois existentes.

## 3. Novos `VariableScope` (opacity, stroke weight, effects) + `boundVariables` em LayoutGrid/Effect

Amplia quais variáveis podem ser auditadas contra o DSC. Hoje o scan de tokens provavelmente cobre cor/tipografia (dado `_manifest.json`: Fundamentos Visuais tem 248 variáveis, 12 cores, 39 tipografias). Estender a auditoria para opacidade/stroke/efeito aumenta a cobertura de conformidade sem exigir passo extra do designer — o scan já é automático.

**Esforço:** baixo, extensão pontual de `specifications.js`.

## 4. Figma MCP Server (Dev Mode) — tensão filosófica

O MCP Server da Figma permite que agentes de código (Claude Code, Cursor) leiam variáveis/componentes/layout diretamente e escrevam de volta no canvas. Isso é poderoso, mas **o Handex existe precisamente para ser o intermediário estruturado e auditável entre design e dev na CAIXA** — um ambiente regulado onde rastreabilidade e conformidade documentada importam mais que velocidade pura de um agente de IA editando o canvas livremente.

Não recomendo integrar o MCP Server como via de edição automática do canvas no contexto do Handex — o valor do produto está em ser a camada de **governança e evidência** (ficha gerada, auditoria declarada, ressalvas documentadas), não em automatizar decisões de design. Um uso possível e mais seguro: expor o `_skeleton.json`/refs DSC como contexto **somente leitura** para agentes de IA que ajudem desenvolvedores a consumir os componentes DSC corretamente — mantendo o Handex como fonte de verdade, não como executor automático.

### 4b. Documentação de projeto como contexto para geração externa (ex: Figma Make) — implementado de forma contida (2026-08)

Ideia avaliada em profundidade (3 rodadas de análise, 2026-08): usar o que já foi documentado de UM projeto no Handex (briefing, tokens usados, cenários de exceção, medidas, fluxos) como contexto para uma ferramenta externa (Figma Make ou equivalente) gerar/propor uma tela nova dentro do mesmo projeto.

**Confirmado tecnicamente:** não existe hoje nenhuma API que permita um plugin do Figma Design empurrar contexto para dentro de um projeto Figma Make — são superfícies de produto separadas, sem canal programático entre elas. O único caminho real é o designer copiar/colar manualmente o conteúdo exportado como attachment/prompt no Make.

**O que foi implementado:** `_aiContext` (`modules/design-data.js`, `_buildAiContext()`) — um campo agregador que entra automaticamente no JSON exportado (`exportHandoffData`/`exportProgress`), sem UI/botão visível. É estritamente material de apoio pronto para copiar/colar, contido a UM projeto (o que já foi documentado nele) — nunca integração automática, nunca geração feita pelo próprio Handex.

**Por que não ir além disso (não expandir para RAG institucional multi-projeto):** uma versão mais ambiciosa — agregar briefings de VÁRIOS projetos numa base de conhecimento institucional consultável — foi avaliada e descartada por dois motivos, não só um:
1. É uma categoria de infraestrutura diferente (busca semântica/RAG sobre texto livre, exige vector store e pipeline de ingestão institucional — não é "adicionar um endpoint").
2. Briefings estratégicos são o conteúdo mais sensível que o Handex coleta (decisões de escopo, riscos de LGPD/compliance ainda não revisados formalmente, contexto pré-lançamento) — elevar isso a "fato institucional buscável" por qualquer agente, sem dono de curadoria nem processo de revisão, é risco de governança de conteúdo que não é decisão do Handex tomar unilateralmente.

Se um produto institucional de RAG/base de conhecimento vier a existir, com dono formal e processo de curadoria fora do Handex, o Handex pode ser *uma* fonte exportável entre várias — mas isso não deve ser prototipado nem desenhado a partir daqui.

## 5. Slots (GA junho 2026)

`SlotNode` é uma feature de **geração/composição** de componentes com conteúdo freeform. O Handex audita e documenta componentes existentes — não gera componentes. Baixa relevância direta, a menos que o produto evolua para sugerir/preencher slots automaticamente durante o handoff (fora do escopo atual "express").

---

## Nota sobre a filosofia "handoff express"

As duas features de maior prioridade (1 e 2) compartilham uma característica: **reduzem passos manuais aproveitando capacidades nativas do Figma**, em vez de adicionar novas telas/fluxos ao plugin. Isso está alinhado com o núcleo do produto. A feature 4 (MCP) é a única que tensiona a filosofia — vale tratá-la com cautela deliberada, não adoção reflexiva só porque a Figma oferece.

**Fontes consultadas:** developers.figma.com/docs/plugins/updates, figma.com/plugin-docs/api/DevStatus, figma.com/plugin-docs/api/Annotation, figma.com/blog/introducing-figma-mcp-server, developers.figma.com/docs/plugins/api/SlotNode.
