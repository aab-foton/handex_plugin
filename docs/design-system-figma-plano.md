# Plano de estruturação do DS do Handex no Figma

**Status:** pronto para execução assim que o conector Figma MCP for autorizado (claude.ai → configurações de conectores). Este plano traduz `docs/design-system-handex.md` em ações concretas de criação no Figma — variáveis, componentes, páginas.

**Escopo:** um arquivo Figma novo, próprio, do Design System do Handex — não um branch/página dentro de um arquivo do DSC da CAIXA. É a contraparte visual da documentação já levantada.

---

## 1. Estrutura de páginas do arquivo

```
📄 Cover (capa com nome, versão, data)
📄 01 · Fundamentos (cores, tipografia, espaçamento, radius — como Variables + specimens)
📄 02 · Componentes (botões, accordions, badges, toggles, inputs, modais, empty states)
📄 03 · Padrões (grid da home, shell de view, shell de modal)
📄 04 · Achados & backlog (cards visuais dos riscos, para virar tickets depois)
```

---

## 2. Variáveis do Figma (Local Variables)

Criar como **Variables** nativas do Figma (não estilos antigos), em coleções:

### Coleção `color/brand`
| Nome | Light | Dark | Fonte |
|---|---|---|---|
| `blue/500` | `#3d3dff` | `#868bff` | tailwind.config.cjs:23 |
| `blue/600` | `#2e2ee0` | `#a6aaff` | tailwind.config.cjs:24 |
| `orange/500` | `#f5b400` | `#ffd24d` | tailwind.config.cjs:39 |

### Coleção `color/surface` (modo Light/Dark nativo do Figma)
| Nome | Light | Dark |
|---|---|---|
| `bg` | `#eef2f7` | `#0f172a` |
| `surface` | `#ffffff` | `#1e293b` |
| `line` | `#dde3ec` | `#334155` |
| `muted` | `#8394a8` | `#b4c6d8` |
| `text` | `#1e293b` | `#f1f5f9` |

### Coleção `color/category-spec` — **decisão pendente antes de criar**
Não copiar os 3 hex divergentes (canvas/ficha/modal) como estão — isso replicaria o drift dentro do próprio Figma. Ação recomendada: decidir com o Augusto qual dos 3 conjuntos vira canônico (sugestão: o da ficha exportada, por ser o que o dev final vê) e criar só essas 4 variáveis (`info`, `comportamento`, `regra`, `api`), com nota de que o código precisa ser migrado para usá-las depois.

### Coleção `space`
`space/150` (6px), `space/200` (8px), `space/250` (10px), `space/300` (12px), `space/350` (14px), `space/400` (16px), `space/600` (24px) — nomenclatura por múltiplo de 50 do valor em px, compatível com convenção comum de token de espaçamento.

### Coleção `radius`
`radius/sm` (8px, fallback), `radius/lg` (12px, `rounded-xl`), `radius/xl` (16px, `rounded-2xl`), `radius/full` (999px, pills).

### Coleção `type`
Escala nomeada a decidir junto (hoje é px arbitrário sem nome): sugestão `type/3xs` (9px) → `type/2xs` (10px) → `type/xs` (11px) → `type/sm` (12–13px) → `type/md` (14px) → `type/lg` (16px) → `type/xl` (18px).

---

## 3. Componentes a criar (Figma Components + Variants)

Ordem sugerida de execução (do mais estável ao mais divergente no código — construir primeiro o que já é consistente):

1. **Input** (texto, select, textarea) — o mais consistente hoje, variantes: default / focus / disabled.
2. **Botão** — variantes: `primary` / `ghost` / `icon-utility` (rounded-xl) / `icon-close` (sem radius). Nomear as duas famílias de radius explicitamente como variantes distintas, não emendar como se fosse uma.
3. **Badge/Pill** — variantes por cor de categoria de scan (11) + categoria de spec (4, usando o conjunto canônico decidido acima).
4. **Accordion** — **uma única versão consolidada** com estado `aria-expanded` sempre presente no nome da variante (`collapsed` / `expanded`), já unificando as 4 implementações divergentes do código como referência de "como deveria ser".
5. **Toggle/Switch** — decidir entre padronizar no switch estilizado (Dados do Projeto) ou no checkbox nativo, hoje há os dois.
6. **Empty state** — template único (ícone + título + CTA sublinhado), já é o mais consistente no código.
7. **Modal shell** — header + body + footer, com slot de conteúdo; variantes por tamanho (`sm`/`md`/`lg`) mapeando os 4 tamanhos de título hoje soltos.
8. **Card de ferramenta (home)** — variante única, ícone + label + hint.

---

## 4. Padrões de tela (frames de referência, não componentes)

- **Shell de view**: header `subheader-brand` + corpo scrollável + rodapé opcional "Finalizar Registros" — montar como 1 frame de referência reutilizável por composição (não component instanciável, é estrutura de página).
- **Grid da home**: 2×3, para visualizar limite de escala antes de decidir se comporta uma 7ª ferramenta.

---

## 5. Ordem de execução recomendada quando o MCP estiver ativo

1. Criar arquivo + páginas (seção 1).
2. Criar todas as coleções de Variables (seção 2) — sem isso, nenhum componente pode referenciar token real.
3. Construir componentes na ordem da seção 3.
4. Montar os frames de padrão de tela (seção 4), já usando os componentes criados.
5. Página de achados (seção 4 do doc principal) como cards visuais — útil para review com o time.

## 6. Decisões que precisam de alinhamento ANTES de criar (não assumir sozinho)

- Qual dos 3 hex de categoria de spec vira canônico.
- Se o radius `rounded-xl` vs `rounded-2xl` vira intencionalmente duas variantes nomeadas ou se um dos dois é eliminado no código depois.
- Se o switch estilizado ou o checkbox nativo vira o toggle oficial.
- Nome canônico da tela hoje chamada de 3 formas diferentes (Escanear Tokens / Frames / Handoff) — o nome escolhido deve batizar tanto o componente quanto a página no Figma.

---

**Arquivo de referência factual:** `docs/design-system-handex.md` (tokens/componentes com citação arquivo:linha) e `docs/design-system-handex.html` (versão navegável).
