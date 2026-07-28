# Proposta: melhorias operacionais para designer e dev (2026-07-09)

> Status: proposta priorizável, focada em fricção real do dia a dia — não em posicionamento estratégico. Complementa `handex-governanca-evidencia-proposta-2026-07.md` (proposta de gestão/compliance, escopo separado).

## Contexto

A pergunta original ("o que nos deixa à frente do Figma?") gerou primeiro uma resposta de nível gestão/produto (governança, evidência formal, auditoria) — documentada separadamente. O dono do produto redirecionou: quer foco no **operacional**, no que resolve fricção concreta de quem usa a ferramenta na prática — o designer documentando, o dev consumindo.

Pesquisa de mercado confirma que a fricção real de handoff não é falta de ferramenta — é retrabalho por informação implícita/repetida e dificuldade de navegação em documentação extensa. Cruzado com leitura do código atual (`specifications.js`, `measurement.js`, `handoff.js`), isso aponta para lacunas concretas e pontuais, não features grandes.

## 5 melhorias, por persona

### Designer

**1. Duplicar spec para outro elemento**
- **Problema**: o mesmo padrão de comportamento se repete em vários elementos de um frame (ex: "campo obrigatório, valida no blur"), e cada spec é criada do zero — reabrir modal, escolher categoria, redigitar texto.
- **Onde**: botão "Duplicar para outro elemento" no card de spec (`specifications.js`, `renderSpecsListForFrame`). Clona categoria/texto/propriedades, só pede nova seleção de nó no canvas.
- **Esforço**: baixo — reaproveita `executeUnifiedSpec` já existente, só muda a origem do formulário (vazio → clonado).

**2. Lembrar última configuração de medida**
- **Problema**: `executeMeasurement` sempre abre o modal do zero (`resetMeasureSelection` zera tudo a cada abertura). Medir padding de 8 botões seguidos = repetir a seleção de tipo 8 vezes.
- **Onde**: `measurement.js` — trocar reset incondicional por preservar o último `currentMeasureTypes` como padrão pré-selecionado.
- **Esforço**: baixo — sem mudança de schema.

### Dev

**3. Busca global na Ficha de Handoff exportada**
- **Problema**: a busca existente (`filterElements`, `handoff.js`) só cobre tokens escaneados. Specs, medidas e fluxos ficam fora — dev precisa abrir accordions manualmente pra achar algo.
- **Onde**: estender a busca para indexar nome de spec, categoria, observação e nome de medida, reaproveitando o padrão de `filterSpecItems` (já existe no plugin) adaptado ao HTML standalone.
- **Esforço**: médio — precisa funcionar sem acesso a `handoffData` runtime, só ao DOM já renderizado no export.

**4. "Copiar como CSS" em cada propriedade**
- **Problema**: a ficha mostra `padding: token/16px` como texto puro — dev copia manualmente pra usar no código.
- **Onde**: botão de copiar ao lado de cada propriedade, gerando `padding: 16px;` pronto pra colar. Puramente apresentação, não toca em `handoffData` nem no plugin.
- **Esforço**: baixo — JS de clipboard sobre dado já renderizado.

### Ambos

**5. Campo de dúvida/comentário na ficha exportada**
- **Problema**: hoje se o dev discorda de uma spec ou não acha o elemento, o canal é Slack/e-mail externo — quebra o registro, o designer só sabe se alguém lembrar de avisar.
- **Onde**: campo de comentário por spec/medida na ficha HTML exportada, salvo em `localStorage` do navegador do dev, com botão "copiar dúvidas pendentes" pra colar de volta no Figma ou mandar por outro canal.
- **Esforço**: médio — só JS no HTML standalone, sem backend/sincronização.
- **Importante**: não é aprovação nem workflow formal — é reduzir "onde eu registro essa dúvida agora". Fica deliberadamente fora da camada de auditoria DSC (não mistura declaração de conformidade com comunicação de dúvida).

## Por que estas e não outras

Nenhuma envolve IA decidindo algo no canvas, nem automação de julgamento de design — são reduções de trabalho mecânico (cliques repetidos, redigitação) e melhorias de navegação/apresentação do que já existe. Todas preservam a separação de camadas já estabelecida no produto (scan automatizado ≠ declaração humana ≠ comunicação de dúvida).

## Prioridade sugerida

1. Duplicar spec (baixo esforço, alto uso — provavelmente a fricção mais sentida no dia a dia de quem documenta muitos elementos parecidos)
2. Lembrar última medida (baixo esforço, mesma lógica)
3. Copiar como CSS (baixo esforço, ganho direto pro dev)
4. Busca global na ficha (esforço médio, mas ataca a queixa nº1 de quem consome handoff)
5. Campo de dúvida (esforço médio, mais novo conceitualmente — vale validar com um dev real antes de construir)
