# Referência visual: handoff de componente do DSC

Extraído em 2026-10-02 do nó "Handoff Menu Icon Item" (`menu-plataforma`, fileKey `8NdZZCl6vnrmV5YxHtI8bh`, node `198:8843`) pela API REST do Figma. Base para o card de elemento da Ficha (ver `docs/plano-card-de-elemento-unico.md`) e, por decisão do Augusto, para a linguagem visual do Handex inteiro. Valores medidos, não inferidos.

## Estrutura

1. **Título:** "Handoff" (60/72, 600, azul) + nome do componente (40/56, 600, neutro escuro).
2. **Descrição de Funcionalidade:** título de seção + parágrafo.
3. **Propriedades:** tabela Propriedade | Valor (padrão em negrito) | Descrição.
4. **Anatomia:** painel "Preview" com partes numeradas + uma coluna por parte (número + nome, linhas "propriedade: chip de token", alertas).
5. **Espaçamento e Alinhamento:** painel Preview com áreas de espaçamento e rótulos de alinhamento desenhados.
6. **Variações:** Preview com cada variante numerada + "o que muda em relação ao default".
7. **Estados:** por grupo (Hover, Active, Focus), Preview + specs por parte + alertas.

Cada seção: título (40/56, 600, `#005ca9`) + descrição (20/30, 400) com gap 24; seções separadas por gap 120; folha com padding 80, raio 16, borda `#404b52` 2px.

## Tipografia

| Uso | Fonte | Peso | Tamanho / altura |
|---|---|---|---|
| Título da página | CAIXA Std | 600 | 60 / 72 |
| Nome do componente, título de seção | CAIXA Std | 600 | 40 / 56 |
| Título do subgrupo (Hover, Active…) | CAIXA Std | 600 | 24 / 36 |
| Descrição de seção | CAIXA Std | 400 | 20 / 30 |
| Nome da parte (Base, Icon), tag "Preview" | CAIXA Std | 600 / 700 | 18 / 27 |
| Título de alerta | CAIXA Std | 700 | 18 / 27 |
| Célula e cabeçalho de tabela, texto de alerta | CAIXA Std | 400 / 600 | 16 / 24 |
| Número do marcador | CAIXA Std | 600 | 14 / 21 |
| Rótulo de propriedade ("background color:") | Fira Code | 450 | 14 / 24 |
| Valor de token / valor bruto | Fira Code | 400 / 450 | 14 / 24 |
| Selo "DSC Library" | Fira Code | 450 | 12 / 12 |

## Cores (todas da lib DSC | Fundamentos Visuais)

| Papel | Hex |
|---|---|
| Títulos, marcadores, conectores | `#005ca9` |
| Texto principal | `#22292e` |
| Texto secundário / valor de token | `#404b52` |
| Fundo da folha, de células e de alerta | `#ffffff` |
| Fundo de cabeçalho de tabela, tag Preview, valor bruto | `#ebf1f2` |
| Borda de tabela | `#d0e0e3` |
| Borda de painel Preview, de valor bruto, de amostra | `#9eb2b8` |
| Fundo alternativo de Preview (espaçamento, estados) | `#a0d2fc` |
| Alerta informativo (borda e ícone) | `#038299` |

## Componentes

| Componente | Fundo | Borda | Raio | Padding / gap |
|---|---|---|---|---|
| **Painel Preview** | `#ffffff` ou `#a0d2fc` | `#9eb2b8` 1px | 8 | livre |
| **Tag "Preview"** | `#ebf1f2` | — | 8 | 12/16 · 8 |
| **Marcador numerado** | `#005ca9` (círculo 24px) + conector `#005ca9` 2px | — | 500 | 8 |
| **Rótulo de propriedade** (`background color:`) | transparente | — | 4 | 4 |
| **Chip de cor** | `#e5f2fc` + amostra 16px | `#005ca9` 1px | 4 | 4 · 4 |
| **Chip de número** (opacidade, raio, tamanho de ícone, borda) | `#fff3d6` | `#d19400` 1px | 4 | 4 · 4 |
| **Chip de componente** ("DSC Library" + nome) | `#eac9de`, selo `#753c61` com texto branco | `#93537d` 1px | 4 | 4 · 4 |
| **Valor bruto** (`44px \| 2.75rem`) | `#ebf1f2` | `#9eb2b8` 1px | 4 | 4 |
| **Linha propriedade + chip** | — | — | — | gap 8 |
| **Coluna de parte** | — | — | — | gap 16; colunas com gap 64 |
| **Tabela** | cabeçalho `#ebf1f2`, células `#ffffff` | `#d0e0e3` 1px, linha inferior por célula | 8 | cabeçalho 24/16, célula 8/16 |
| **Alerta** | `#ffffff`, ícone info 32px `#038299` | `#038299` 2px, lateral esquerda 12px | 4 | 12/12/12/28 · 16 |
| **Espaçamento desenhado** | `#ef765e` 64% | `#b23820` 1px | — | — |
| **Área de alinhamento** | `#b26f9b` 12% | `#753c61` 1px | — | — |
| **Rótulo de alinhamento** ("align center") | `#f8eaf3` | `#753c61` 1px, conector `#753c61` 2px | 8 | 8 |

## Observações para o Handex

- **Fonte:** a referência usa **CAIXA Std** e **Fira Code**. Decisão (2026-10-05): a Ficha usa **Roboto** (fonte vigente da lib DSC | Fundamentos Visuais) no lugar da CAIXA Std, que dependia de a fonte estar disponível na máquina; Fira Code mantida.
- Unidades sempre em `px | rem` (base 16).
- Tokens exibidos no formato de variável CSS (`--dsc-color-bg-highlight-4`), não no nome Figma (`dsc/color/bg/highlight/4`).
