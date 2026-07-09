# Handex — Resultado do spike: ConnectorNode nativo (DESCARTADO)

> Spike testado em 2026-07-08. **Conclusão: inviável.** `figma.createConnector()` não está disponível para plugins rodando em arquivos de Design/Dev Mode — é exclusivo de FigJam.

## O que foi tentado

Em `src/plugin/code.js`, handler `create-unified-spec` (~linha 3019), foi adicionada uma flag `USE_NATIVE_CONNECTOR` para testar trocar o `VectorNode` estático (linha conectora das specs, path calculado uma única vez) por um `ConnectorNode` nativo (`figma.createConnector()`), ancorado ao nó via `connectorStart`/`connectorEnd` + `endpointNodeId` + `magnet: 'AUTO'` — a expectativa era que a linha recalculasse sozinha quando o elemento original ou o card se movessem.

## Resultado do teste manual

Com `USE_NATIVE_CONNECTOR = true`, testado no Figma desktop: a spec foi criada, mas **sem nenhuma linha visível**. Console do plugin mostrou:

```
unhandled promise rejection: TypeError: not a function
    at <anonymous> (PLUGIN_11_SOURCE:2895:54)
```

O erro ocorre na chamada a `figma.createConnector()` — a função **não existe** no objeto `figma` neste contexto de execução.

## Confirmação na documentação oficial (2026-07-08)

Verificado diretamente na doc do Figma para eliminar qualquer dúvida: a página de `figma.createConnector()` afirma literalmente **"This API is only available in FigJam"**, e a documentação de `working-in-figjam` é ainda mais explícita: **"It's not possible to create connector nodes in a Figma [Design] file"** — `ConnectorNode` é um tipo de nó que só existe no modelo de dados de arquivos FigJam, não em arquivos Design, independente de configuração de plugin.

**Isso não é contornável ajustando `editorType`.** É possível declarar `editorType: ["figma", "figjam"]` para um plugin rodar em ambos os tipos de arquivo, mas isso não faz `ConnectorNode` aparecer dentro de um arquivo Design — FigJam e Design são tipos de arquivo estruturalmente diferentes (não modos do mesmo arquivo). Como o Handex documenta telas de produto, que por definição vivem em arquivos Design (é onde o DSC e as telas da CAIXA existem), nunca haveria um cenário real em que o conector nativo estivesse disponível nesse fluxo — exigiria que as próprias telas do produto estivessem dentro de um FigJam, o que não é como handoff de produto funciona.

## Causa raiz

`figma.createConnector()` é parte da Plugin API específica para **FigJam** (`editorType: "figjam"`). O manifest do Handex declara `editorType: ["figma", "dev"]` — arquivos de Design comuns e Dev Mode, sem FigJam. Nesse contexto, `figma.createConnector` simplesmente não é uma função disponível no objeto global `figma`, daí o `TypeError: not a function` em vez de um erro de validação de argumentos (que seria o caso se a função existisse mas os parâmetros estivessem errados).

Isso também explica por que o bloco DORMANT em `code.js` (linhas ~1862-1868, ~1910-1915) que já usava `figma.createConnector()` para outra feature ("Mapeamento de Protótipo") nunca foi ativado — muito provavelmente a mesma limitação já havia sido descoberta antes e o código foi deixado comentado sem uma nota explicando o motivo.

## Impacto na decisão

- **Descartado**: não é possível usar `ConnectorNode` nativo em nenhum lugar do Handex enquanto o plugin rodar em `editorType: ["figma", "dev"]` — isso vale tanto para a linha das Specs quanto para a hipótese de aplicar a mesma técnica em **Fluxos de Tela** (que também usa conectores/setas entre frames). A ideia de estender para Fluxos, cogitada em 2026-07-07, não deve ser retomada por essa via.
- **Sem impacto** na análise de Annotation API nativa (`figma.annotations`/`node.annotations`, documentada em `docs/annotations-api-deep-dive.md`) — é uma API diferente, disponível normalmente em arquivos Design, e não depende de `createConnector()`.
- O `VectorNode` estático (comportamento de produção, linha calculada uma vez com `M x y L x y`) continua sendo a única opção viável no Figma Design para desenhar uma linha conectora entre dois nós quaisquer. Se recálculo automático ao mover elementos for um requisito real de produto, a alternativa seria recalcular o path manualmente via um listener de mudança de posição (`figma.on('documentchange', ...)` ou similar) — uma solução bem mais cara de manter, não recomendada só por causa dessa hipótese não confirmar necessidade real.

## Estado do código

`USE_NATIVE_CONNECTOR` revertido para `false` em `code.js`, `code.bundle.js` regenerado. O branch experimental (`if (USE_NATIVE_CONNECTOR)`) foi mantido no código como documentação viva do que foi tentado e por que falha (comentários `// SPIKE:` já existentes) — pode ser removido em uma limpeza futura já que a via foi definitivamente descartada, não é mais um experimento em aberto.
