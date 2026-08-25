# Referências DSC — hac

Adaptação/redução de `src/plugin/refs/README.md` do Handex Beta (2026-08-24).
O hac é enxuto: não tem aba "Escanear Tokens" nem scan de conformidade DSC
geral — a única finalidade destes artefatos é alimentar a **Detecção
Automática de a11y** (componente do canvas → categoria de acessibilidade).

## Estrutura

| Arquivo | Origem | Versionado? | Conteúdo |
|---------|--------|-------------|----------|
| `_manifest.json` | curado | sim | Só a lib "Web Angular & React" — única fonte de `componentsDetailed` |
| `web-angular-react.json` | `fetch-design-refs.cjs` | sim | Meta + styles + components da lib (só keys/nomes) |
| `_skeleton.json` | `build-skeleton.cjs` | sim | Bundle agregado embarcado em `ui.html` como `window.__HAC_REF_SKELETON__` |
| `dsc-component-a11y-mapping.json` | `build-dsc-a11y-mapping.cjs` | sim | Mapa `containingFrame → {shortName, confidence}` — **essencial em runtime** (`_getDscFrameToA11yMap`, a portar em `code.js`) |
| `design-acessivel-content.json` | curado manualmente (REST API) | sim | Conteúdo textual (Descrição/Observações/Notas de Código) das 5 categorias de a11y — cópia direta do Handex |
| `design-acessivel-component-properties.json` | `fetch-a11y-component-properties.cjs` (script não portado, só o dado) | sim | Properties/variantes dos 25 component sets internos da lib "Design Acessível", usado no formulário dinâmico |

> ⚠ Nada aqui contém **valores resolvidos** (hex, fontSize, etc.). Os valores
> são resolvidos em runtime via Plugin API dentro do Figma — esse é o desenho
> que mantém o pipeline livre de tokens no cliente (herdado do Handex).

## Por que só uma lib no manifest

As component keys dos componentes REAIS de a11y (família "Design Acessível":
Agrupamento, Conector Linha, Área Conector, Item Number) estão hardcoded como
literais em `code.js` (constantes `A11Y_AGRUPAMENTO_KEYS`,
`A11Y_CONECTOR_LINHA_KEYS`, `A11Y_AREA_CONECTOR_KEYS`, `A11Y_ITEM_NUMBER_KEYS`)
— confirmado por leitura direta do código-fonte do Handex Beta em 2026-08-24.
Elas são resolvidas via `figma.importComponentByKeyAsync(key)` sem passar por
`_manifest.json` nem `_skeleton.json`. Por isso a lib "Design Acessível" não
precisa de entrada no manifest do hac — só a lib "Web Angular & React"
precisa, porque é dela que vem `componentsDetailed`, usado para resolver
qual componente DSC está no canvas e mapeá-lo para uma categoria de a11y.

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
