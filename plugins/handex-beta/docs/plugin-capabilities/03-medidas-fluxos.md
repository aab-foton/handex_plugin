# 03 — Medidas e Fluxos de Tela

## Medidas (`measure-nodes-custom`, backend em `code.js:1636`; frontend `modules/measurement.js`)

### Capacidades

- 4 tipos: W×H (largura/altura), Margin (externo), Padding (interno), Spacing (padding + gaps automáticos) — seleção múltipla.
- Numeração sequencial por frame (`nextMeasurementNumber`).
- Visibilidade individual ou em bloco (por frame ou global), sincronizada ao canvas via mensagem `hide-node` — sem excluir os dados.
- Exportação standalone para Markdown, com lista de bullets por medida.

### Limitações

- Handler exato de cálculo geométrico (`code.js:1636+`) não foi auditado linha a linha neste levantamento — recomenda-se leitura direta antes de qualquer mudança nessa área.
- Export MD de medidas não inclui metadados adicionais além dos detalhes de cada item — é uma lista simples, não um relatório estruturado.

## Fluxos de Tela (`create-flow-connection`, `code.js:3293-3450+`)

### Capacidades

- 7 tipos de conexão: `event_start`, `event_end` (1 elemento selecionado), `line_solid`, `line_dashed`, `diamond` (decisão), `diamond_dashed`, `gateway_parallel` (2 elementos selecionados).
- Cálculo automático de lado de ancoragem com heurística de não-sobreposição (`getEdgePoints`, code.js:3319-3324) — decide se a conexão é lado-a-lado ou empilhada.
- Losango de decisão inclui texto central obrigatório (`decisionText`, default "IF").

### Limitação estrutural — mesma raiz do problema das Specs

Linhas e setas de fluxo também são **`VectorNode`** com path estático (`figma.createVector`, code.js:3380/3394/3410) — **não** `ConnectorNode` nativo, pela mesma razão confirmada em [02](02-criacao-specs.md): `createConnector()` é exclusivo de FigJam, indisponível no `editorType` do Handex. Esta limitação foi confirmada explicitamente como aplicável a Fluxos de Tela também (não só Specs) durante o teste de 2026-07-08 — **não deve ser retestada** nesta funcionalidade, a causa raiz é idêntica e já comprovada.

### Consequência prática

Assim como nas Specs, mover um dos frames conectados por um fluxo não realinha a linha/seta automaticamente — exige recriar a conexão.

## Leitura de produto

Medidas e Fluxos compartilham a mesma limitação de fundo que Specs: geometria calculada estaticamente, sem ancoragem viva a nós do Figma. É uma característica consistente e explicável de toda a família de "anotações visuais" do Handex, não uma inconsistência entre features — vale comunicar como característica de plataforma (Figma Design não oferece conectores nativos), não como limitação pontual de cada feature isolada.
