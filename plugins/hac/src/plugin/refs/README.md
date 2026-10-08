# Referências DSC — hac

Adaptação/redução de `src/plugin/refs/README.md` do Handex Beta (2026-08-24).
O hac é enxuto: não tem aba "Escanear Tokens" nem scan de conformidade DSC
geral — a única finalidade destes artefatos é alimentar a **Detecção
Automática de a11y** (componente do canvas → categoria de acessibilidade).

## Estrutura

> **Nota (2026-10-06, completada em 2026-10-08)**: a lib legada `web-angular-react` ("DSC Web Angular & React") saiu do HAC — fora do manifest, do skeleton, do reconhecimento, do CI, dos scripts (`build-dsc-a11y-mapping.cjs` não a tem mais como fonte padrão nem nas listas curadas) e dos JSONs de revisão. Menções abaixo são históricas.

> **Nota (2026-10-01)**: o hac tem agora PERFIS por plataforma (`backend/platform-profiles.js`) — ver a seção "Pipeline do perfil web" abaixo.

> **Nota (2026-09-08)**: as seções abaixo ficaram desatualizadas em
> alguns pontos — `_manifest.json` hoje tem **4 libs**
> (`super-app`, `super-dsc-web`, `dsc-android`),
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
| `{slug}.json` (ex. `super-dsc-web.json`) | `fetch-design-refs.cjs` | sim | Meta + styles + components de cada lib do manifest (só keys/nomes) |
| `fundamentos-visuais.json` | `fetch-design-refs.cjs` (manifest, `resolveStyles: true`) | sim | Base de conhecimento da lib **"DSC \| Fundamentos Visuais"** (fileKey `nbv8CUA2nbukjSkhK44kgQ`, v2.6.0): 248 variáveis resolvidas (cores, `spacing/`, `border/`, `font/`, `icon/`, `opacity/`, `shadow/`), 39 estilos de tipografia e 5 de efeito **com valores reais** (`resolved`), 12 gradientes e ~10 mil ícones. É a fonte de verdade dos tokens visuais do próprio hac. **Não** entra em `componentsDetailed` nem no matching de a11y; `build-skeleton.cjs` não embute as keys de ícones (ver `tecnico.html`, seção 8y) |
| `_skeleton.json` | `build-skeleton.cjs` | sim | Bundle agregado embarcado em `ui.html` como `window.__HAC_REF_SKELETON__` |
| `dsc-component-a11y-mapping*.json` | `build-dsc-a11y-mapping.cjs` | sim | Mapa `containingFrame → {shortName, confidence}` por lib — **essencial em runtime** (`_resolveDscComponentA11yMatch`, `code.js`) |
| `design-acessivel-content.json` | curado manualmente (REST API) | sim | Conteúdo textual (Descrição/Observações/Notas de Código) das 5 categorias de a11y — cópia direta do Handex |
| `design-acessivel-component-properties.json` | `fetch-a11y-component-properties.cjs` (script não portado, só o dado) | sim | Properties/variantes dos 25 component sets internos da lib "Design Acessível" ANTIGA — **não consumido desde 2026-10-08** (o plugin usa só a lib nova) |
| `design-acessivel-mobile-properties.json` | `fetch-component-properties.cjs --lib design-acessivel-mobile --deep-scan` | sim | Properties de TODOS os component sets do arquivo próprio "[HAC] Handoff Super DSC Mobile e Web" (mobile **e web** — o prefixo `.[hac mob|web base]` cobre os dois). Desde 2026-10-01 grava também, nos sets publicados, `variantKeys` (key importável de cada variante, de `GET /components`) e, nos "Box specs", `wrapperVariants` (instâncias + properties por variante). Fonte das keys dos wrappers e das constantes `A11Y_WEB_*`/`A11Y_MOBILE_*` |
| `design-acessivel-web-wrapper.generated.json` | `build-a11y-constants.cjs` | sim | **Gerado.** Perfil web: keys importáveis das 4 variantes de `[hac web] Box specs leitor de tela` (elemento/titulo/decorativo/estrutura — sem "informacoes"), opções de `Componente` (61), pares extras de variante (`Imagem` → `Variante=Texto Alternativo`), aliases aprovados, opções de Estrutura e níveis H1–H6. Consumido por `backend/platform-profiles.js` |
| `design-acessivel-mobile-wrapper.generated.json` | `build-a11y-constants.cjs` | sim | **Gerado.** Perfil mobile: keys das 3 variantes de `[hac mob] Box specs leitor de tela` (ainda declaradas em `build-a11y-constants.cjs`, `MOBILE_WRAPPER_VARIANT_KEYS_BY_A11Y_TYPE`) + `componentOptions` |
| `web-component-aliases.json` | **curado por humano** | sim | Tabela de aliases do reconhecimento web (nome escaneado → opção EXATA de `Componente`). Hoje `{aliases: {}}`: cada alias precisa de aprovação humana. Nunca preencher por palpite |
| `web-recognition.cjs` | — | sim | Regra única do reconhecimento web (normalização + exato + alias), usada por `build-a11y-constants.cjs` e `report-web-recognition.cjs`. Cópias idênticas da normalização vivem em `backend/platform-profiles.js` e `modules/accessibility.js` |
| `report-web-recognition.cjs` | — | sim | Relatório de cobertura (exato/alias/sem correspondência por lib web) com SUGESTÕES para aprovar → `docs/web-recognition-report.json`. **Não é lido pelo plugin** |
| `check-lib-sources.cjs` | — | sim | Auditoria: toda key de 40 hex escrita no código precisa resolver (`GET /v1/components/{key}`) para o arquivo próprio `HhriLSpKnCB2dHhyiU16iB`. `--strict` sai 1 em desvio. Passo informativo do CI. Precisa de `FIGMA_TOKEN` |
| `design-acessivel-default-texts.json` | `fetch-a11y-default-texts.cjs` (2026-10-07) | sim | Textos padrão de cada campo do card "Elementos e imagens" por plataforma (mobile/web) > componente > opção de Leitor de Tela. Desde 2026-10-08 também `fixedTexts`: textos fixos e campos opcionais dos cards de Títulos e Decorativos por plataforma (→ `A11Y_FIXED_TEXTS_GENERATED`; os campos opcionais do mobile → `A11Y_MOBILE_FIXED_TOGGLES_GENERATED`). Consumido por `build-a11y-constants.cjs` (`A11Y_{MOBILE,WEB}_DEFAULT_TEXTS_GENERATED`) para o formulário abrir os campos com o texto da lib. Rodar: `FIGMA_TOKEN=… node src/plugin/refs/fetch-a11y-default-texts.cjs && npm run refs:a11y-constants` |
| `instruction-frames/*.png` | `fetch-instruction-frames.cjs` (2026-09-08) | sim | Imagens RENDERIZADAS (não metadado) de frames de instrução didática da lib "Design Acessível", usadas na Ficha de Handoff — ver seção própria abaixo |
| `_instruction-frames.generated.js` | `build-skeleton.cjs` | **não** (gerado) | PNGs acima em base64, embarcado em `ui.html` como `window.__HAC_INSTRUCTION_FRAMES__` |

> ⚠ Nada aqui contém **valores resolvidos** (hex, fontSize, etc.), com a
> exceção documentada das variáveis (`variables/local`, já resolvidas em
> hex/px pela própria REST API), dos estilos de tipografia e efeito das libs
> `fundamentos-visuais`, `super-dsc-web` e `super-app` (a partir de
> 2026-09-30, opt-in `resolveStyles` no manifest — `web-angular-react` e
> `dsc-android` seguem só com nome + descrição). As duas últimas guardam os
> fundamentos da família SDSC (Super DSC), que não existem como arquivo
> separado: vivem nas coleções `dsc` e `SuperApp Theme` dessas libs) e, a partir de
> 2026-09-08, dos frames de
> instrução (que são imagem por natureza — não há "valor não resolvido"
> possível para um PNG). Os demais valores são resolvidos em runtime via
> Plugin API dentro do Figma — esse é o desenho que mantém o pipeline
> livre de tokens no cliente (herdado do Handex).

## Por que a lib "Design Acessível" não precisa de entrada no manifest

As component keys dos marcadores/selos do arquivo próprio (Agrupamento,
Conectores, Identificação da tela, Ordenação) estão declaradas em
`backend/platform-profiles.js` (`A11Y_AGRUPAMENTO_KEYS`,
`A11Y_CONECTOR_LINHA_KEYS`, `A11Y_IDENTIFICACAO_TELA_KEYS`,
`A11Y_ORDENACAO_ITEM_KEY`, desde 2026-10-01 — antes em `code.js`); as keys dos
wrappers "Box specs leitor de tela" são GERADAS (`design-acessivel-*-wrapper.generated.json`).
Elas são resolvidas via `figma.importComponentByKeyAsync(key)` sem passar por
`_manifest.json` nem `_skeleton.json`. `check-lib-sources.cjs` audita todas. Por isso a lib "Design Acessível" não
precisa de entrada no manifest do hac — as 4 libs listadas nele são as de
componentes REAIS do produto (web/mobile), usadas para resolver qual
componente DSC está no canvas e mapeá-lo para uma categoria de a11y.

## Pipeline do perfil web (2026-10-01)

A web segue a base `⚙️ | Componentes Specs base Web` do arquivo próprio (mesma
lib do mobile). Fluxo, todo derivado de dado — nenhuma lista de componentes
escrita à mão:

```bash
# 1. Scan do arquivo próprio (a MESMA flag --deep-scan do CI; confira _meta.deepScan antes e
#    `git diff --stat` depois — o arquivo não pode encolher)
FIGMA_TOKEN=... node src/plugin/refs/fetch-component-properties.cjs --lib design-acessivel-mobile --deep-scan --reset
# 2. Constantes da UI (A11Y_WEB_*) + JSONs de wrapper (web e mobile)
node src/plugin/refs/build-a11y-constants.cjs        # ou: npm run refs:a11y-constants
# 3. Cobertura do reconhecimento + sugestões (NÃO ativado)
node src/plugin/refs/report-web-recognition.cjs      # -> docs/web-recognition-report.json
# 4. Auditoria de keys do código
FIGMA_TOKEN=... node src/plugin/refs/check-lib-sources.cjs --strict
```

Reconhecimento web = casamento EXATO do nome normalizado (minúsculas, sem
acento, só `[a-z0-9]`, sem `[dsc…]`) com uma opção de `Componente`, mais os
aliases de `web-component-aliases.json`. Sem aproximação. O que não bate segue
o caminho "sem correspondência": o dropdown cai em "Personalizado" (texto livre)
e o card sai genérico, com aviso — nunca com o componente padrão da lib.

Estado do scan em 2026-10-01: 61 opções de `Componente` na base web; 59 têm
instância base com properties (2 — `Tile Button` e `Loading Animation` — não
têm nenhuma); 41 têm sub-modos de "Leitor de Tela" (142 sub-variantes); as 18
restantes são componentes-folha só com `Observações`. Não há truncamento por
profundidade nesses casos (todos os sets cabem em `--screen-reader-depth` 6).
A entrada mobile `10206:2177` do JSON foi preservada do scan de 2026-09-30 (ver
`_meta.warnings`) — o próximo refresh semanal a atualiza.

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

# Mapping DSC → a11y das 3 libs atuais (a legada web-angular-react saiu do hac)
npm run refs:a11y-mapping

# Refazer o skeleton + mapping a partir das refs já baixadas
npm run refs:rebuild

# Atalho: fetch + rebuild + bundle:ui + bundle:code
FIGMA_TOKEN=<seu_token> npm run refs:update

# Rebuild do skeleton isolado
npm run bundle:refs

# Regenerar só o mapping DSC → a11y de uma lib
node src/plugin/refs/build-dsc-a11y-mapping.cjs --src super-dsc-web.json --out dsc-component-a11y-mapping-superdscweb.json
```

## Onde está o token e onde **não** está

- `FIGMA_TOKEN` vive **apenas** em `.env` local (gitignored) ou CI variable
  (masked + protected) — nunca embarcado em `ui.html`/`code.bundle.js`, nunca
  commitado no código.
