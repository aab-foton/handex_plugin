# Referências DSC — hac

Adaptação/redução de `src/plugin/refs/README.md` do Handex Beta (2026-08-24).
O hac é enxuto: não tem aba "Escanear Tokens" nem scan de conformidade DSC
geral — a única finalidade destes artefatos é alimentar a **Detecção
Automática de a11y** (componente do canvas → categoria de acessibilidade).

## Estrutura

> **Nota (2026-09-08)**: as seções abaixo ficaram desatualizadas em
> alguns pontos — `_manifest.json` hoje tem **4 libs**
> (`web-angular-react`, `super-app`, `super-dsc-web`, `dsc-android`),
> não 1. A explicação de "por que só uma lib" na seção seguinte
> descreve corretamente por que a lib "Design Acessível" (marcadores
> visuais) não precisa de entrada no manifest — isso continua válido —
> mas o restante do texto trata o manifest como se tivesse 1 única lib
> de componentes reais, o que não é mais o caso. Revisão completa do
> README fica pendente; esta nota evita que a leitura desatualizada
> engane quem chegar aqui.

| Arquivo | Origem | Versionado? | Conteúdo |
|---------|--------|-------------|----------|
| `_manifest.json` | curado | sim | As 4 libs de componentes reais (ver nota acima) — fonte de `componentsDetailed` |
| `{slug}.json` (ex. `web-angular-react.json`) | `fetch-design-refs.cjs` | sim | Meta + styles + components de cada lib do manifest (só keys/nomes) |
| `_skeleton.json` | `build-skeleton.cjs` | sim | Bundle agregado embarcado em `ui.html` como `window.__HAC_REF_SKELETON__` |
| `dsc-component-a11y-mapping*.json` | `build-dsc-a11y-mapping.cjs` | sim | Mapa `containingFrame → {shortName, confidence}` por lib — **essencial em runtime** (`_resolveDscComponentA11yMatch`, `code.js`) |
| `design-acessivel-content.json` | curado manualmente (REST API) | sim | Conteúdo textual (Descrição/Observações/Notas de Código) das 5 categorias de a11y — cópia direta do Handex |
| `design-acessivel-component-properties.json` | `fetch-a11y-component-properties.cjs` (script não portado, só o dado) | sim | Properties/variantes dos 25 component sets internos da lib "Design Acessível", usado no formulário dinâmico |
| `instruction-frames/*.png` | `fetch-instruction-frames.cjs` (2026-09-08) | sim | Imagens RENDERIZADAS (não metadado) de frames de instrução didática da lib "Design Acessível", usadas na Ficha de Handoff — ver seção própria abaixo |
| `_instruction-frames.generated.js` | `build-skeleton.cjs` | **não** (gerado) | PNGs acima em base64, embarcado em `ui.html` como `window.__HAC_INSTRUCTION_FRAMES__` |

> ⚠ Nada aqui contém **valores resolvidos** (hex, fontSize, etc.), com a
> exceção documentada das variáveis (`variables/local`, já resolvidas em
> hex/px pela própria REST API) e, a partir de 2026-09-08, dos frames de
> instrução (que são imagem por natureza — não há "valor não resolvido"
> possível para um PNG). Os demais valores são resolvidos em runtime via
> Plugin API dentro do Figma — esse é o desenho que mantém o pipeline
> livre de tokens no cliente (herdado do Handex).

## Por que a lib "Design Acessível" não precisa de entrada no manifest

As component keys dos componentes REAIS de a11y (família "Design Acessível":
Agrupamento, Conector Linha, Área Conector, Item Number) estão hardcoded como
literais em `code.js` (constantes `A11Y_AGRUPAMENTO_KEYS`,
`A11Y_CONECTOR_LINHA_KEYS`, `A11Y_AREA_CONECTOR_KEYS`, `A11Y_ITEM_NUMBER_KEYS`)
— confirmado por leitura direta do código-fonte do Handex Beta em 2026-08-24.
Elas são resolvidas via `figma.importComponentByKeyAsync(key)` sem passar por
`_manifest.json` nem `_skeleton.json`. Por isso a lib "Design Acessível" não
precisa de entrada no manifest do hac — as 4 libs listadas nele são as de
componentes REAIS do produto (web/mobile), usadas para resolver qual
componente DSC está no canvas e mapeá-lo para uma categoria de a11y.

## Frames de instrução (2026-09-08)

Diferente do resto deste diretório (metadados: keys, nomes, estilos),
`fetch-instruction-frames.cjs` captura a **imagem renderizada** de frames
de instrução didática que já existem prontos dentro do arquivo da lib
"Design Acessível" — texto explicativo + previews de assets, mantidos
por quem administra a lib, usados como coluna de instrução fixa na Ficha
de Handoff (nunca recriados como texto/vetores pelo hac). Usa a REST API
(`GET /v1/images/:file_key`), não a Plugin API — só a REST API consegue
capturar um frame solto de outro arquivo; a Plugin API só importa
componentes publicados de libs vinculadas. Ver comentário de topo do
próprio script para o raciocínio completo.

```bash
FIGMA_TOKEN=<seu_token> node src/plugin/refs/fetch-instruction-frames.cjs
```

Node ids reais dos frames a capturar ficam na constante `FRAMES` dentro
do próprio script — preencher antes de rodar em produção/CI.

## Comandos locais

```bash
# Atualizar refs do Figma (precisa FIGMA_TOKEN)
FIGMA_TOKEN=<seu_token> npm run refs:fetch

# Refazer o skeleton + mapping a partir das refs já baixadas
npm run refs:rebuild

# Atalho: fetch + rebuild + bundle:ui + bundle:code
FIGMA_TOKEN=<seu_token> npm run refs:update

# Rebuild do skeleton isolado
npm run bundle:refs

# Regenerar só o mapping DSC → a11y (depois de ter web-angular-react.json)
node src/plugin/refs/build-dsc-a11y-mapping.cjs
```

## Onde está o token e onde **não** está

- `FIGMA_TOKEN` vive **apenas** em `.env` local (gitignored) ou CI variable
  (masked + protected) — nunca embarcado em `ui.html`/`code.bundle.js`, nunca
  commitado no código.
