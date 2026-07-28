# 01 — Scan e Auditoria de Conformidade DSC

Handler `scan-frame`, `code.js:1940-2350`.

## Capacidades

- Classifica nós em 5 categorias: `components`, `icons`, `typography`, `frames`, `vectors` (code.js:1960-1966).
- Heurística de detecção de ícone: nome contém "icon"/"ic-" OU instância ≤32×32px sem "button" no nome (code.js:2327-2328).
- Auditoria de conformidade por duas vias: (a) `isRemote` — variável/estilo/componente vinculado a uma lib publicada, conforme direto sem checar skeleton; (b) consulta ao skeleton DSC via `referenceTokens`. Fallback por prefixo `[dsc]` no nome do nó, e tipografia com fonte contendo "caixa" força conforme mesmo sem match exato de score.
- 5 libs DSC indexadas (`_manifest.json`): Fundamentos Visuais (248 variáveis, 12 cores, 39 tipografias, 10333 componentes), Web Angular & React (1839 componentes), Super Gerenciador (4422), Super App (4266), Design Acessível (293).

## Regras de filtragem (decisão de produto, não bug)

- **Vetores excluídos da conformidade**: VECTOR/BOOLEAN_OPERATION/ELLIPSE/RECTANGLE são classificados como `vectors` — shapes primitivos não representam conformidade de Design System (consistente com BUSINESS_RULES.md §2.3).
- **Frames com filhos DS excluídos**: se `_hasDSChild()` (code.js:2201-2213) encontra qualquer descendente INSTANCE/COMPONENT, o frame não entra no scan — é tratado como container de layout, a conformidade "vive" nos filhos.
- **Frames sem filhos DS mantidos**: ausência de filtro correspondente — indicam tela potencialmente 100% custom, informação relevante para o handoff.

## Limites técnicos explícitos

- **3 das 5 libs DSC têm zero variáveis/cores/efeitos indexados** (Web Angular & React, Super Gerenciador, Super App) — a auditoria de cor/spacing dessas libs depende só de componentes/tipografia, não de variáveis Figma. Cobertura de auditoria é desigual entre libs.
- **Profundidade de recursão do scan: 8 níveis** (code.js:2318) — mais raso que a extração do BI Bridge (15 níveis), refletindo escopo diferente (auditoria de conformidade vs. extração de tema completo).
- Nós invisíveis e fills/strokes ocultos são pulados no scan.

## Arquitetura de segurança do skeleton DSC

`_skeleton.json` (~901 KB, embarcado no `ui.html`) contém **apenas keys/nomes**, nunca valores resolvidos (hex, fontSize) — resolução acontece em runtime via Plugin API, dentro do próprio Figma. Isso é uma decisão de arquitetura deliberada para manter o pipeline de build livre de segredos/dados de design resolvidos no cliente.

## Leitura de produto

O scan é uma auditoria **assistida**, não uma certificação automática de conformidade — a decisão final de "está conforme" combina sinal automático (score contra o skeleton) com declaração humana do designer (ver [02](02-criacao-specs.md) e a separação de camadas documentada em `CLAUDE.md`). Isso deve ser comunicado com precisão: o Handex não substitui revisão humana, ele estrutura e acelera essa revisão.
