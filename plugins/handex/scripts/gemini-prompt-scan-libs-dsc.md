# Prompt para o Gemini — Scan aprofundado das libs DSC via MCP do Figma

> Cole o conteúdo abaixo (a partir de "## Contexto") como prompt para o Gemini. Ele precisa ter acesso ao MCP do Figma já autorizado.

---

## Contexto

Você vai fazer um scan aprofundado de 6 bibliotecas de componentes publicadas no Figma, usando o **MCP do Figma** (acesso real ao editor — não a REST API pública). O objetivo final é gerar um **documento estruturado (JSON)** que sirva de base para duas features de um plugin Figma chamado **Handex** (handoff de design para o Design System da CAIXA — DSC):

1. **Scan de conformidade de tokens**: hoje o plugin escaneia um frame e tenta casar cada componente/ícone/token contra uma lista de `componentKey`s conhecidos. Precisa saber, com precisão, a que componente/variante cada peça pertence — hoje só temos a chave e um nome cru.
2. **Sugestão de componente ao criar uma spec técnica**: quando o designer documenta um elemento do canvas, o plugin deveria conseguir sugerir "isto parece ser o componente X da lib Y, variante Z" — hoje isso não existe, é 100% manual.

## Por que a REST API pública não é suficiente (causa raiz do pedido)

O pipeline atual (`fetch-design-refs.cjs`, rodando contra `GET /v1/files/:key/components`) só retorna, por componente:

```json
{
  "key": "9f35761337054df2f09e447ad79c792df08abf58",
  "name": "confidencial=true, tipo=EXTERNO.RESTRITO, abreviado=false",
  "description": "",
  "containingFrame": "[dsc] Classificação de Conteúdo"
}
```

Problemas concretos já identificados:
- `name` é a string crua de propriedades de variante (`"confidencial=true, tipo=EXTERNO.RESTRITO, abreviado=false"`) — não o nome do componente pai/component set (ex: "Classificação de Conteúdo"). Isso só aparece em `containingFrame`, e nem sempre.
- A API só retorna **folhas de variante** de `COMPONENT_SET`s publicados — não retorna o nó pai, não retorna hierarquia de composição (ex: um componente maior feito de sub-componentes internos não publicados isoladamente), não retorna thumbnail/imagem.
- Sem categoria semântica (é um botão? um ícone? um card? um wrapper estrutural?), sem lista estruturada de variant properties (tipo, tamanho, estado como campos separados, não uma string concatenada).
- Isso já causou pelo menos 3 bugs reais de falso-positivo/falso-negativo no scan de conformidade do Handex, todos com a mesma causa raiz: dado insuficiente sobre o que cada `componentKey` realmente representa.

## As 6 bibliotecas a escanear

Arquivo Figma de cada uma (fileKey — use para abrir/navegar via MCP):

| Slug | Nome | fileKey |
|---|---|---|
| `fundamentos-visuais` | Fundamentos Visuais | `nbv8CUA2nbukjSkhK44kgQ` |
| `web-angular-react` | Web Angular & React (DSC legado) | `8QvOeTODSBi3PquJT5CISP` |
| `super-gerenciador` | Super DSC \| Web (sucessor do legado, mesmo fileKey do antigo "Super Gerenciador") | `erkqbRKIbaFWbkHe51BeiZ` |
| `super-app` | DSC \| Super App (mobile) | `epCGtlKQxedDxQVlK3lNcN` |
| `design-acessivel` | Design Acessível | `Wy0IhXRVZMSOOr8E609UqI` |
| `design-acessivel-mobile` | Design Acessível \| Super App (React Native) | `3zdtN13YvPlCGPdXeL0Y2i` |

Nota: `web-angular-react` e `super-gerenciador` COEXISTEM deliberadamente (migração em andamento, não é redundância a resolver) — escaneie as duas.

## O que escanear, por biblioteca

Para cada `COMPONENT_SET` e `COMPONENT` de nível superior publicado na lib (ou seja, tudo que aparece na aba Assets do Figma quando essa lib está ativada):

1. **Identidade**: `key` (component key real, o mesmo usado pela Plugin API `node.key`/`mainComponent.key`), nome do component set PAI (não a string de variante), nome de cada variante individual dentro do set.
2. **Categoria semântica**: classifique numa taxonomia curta e consistente entre as 6 libs — ex: `button`, `icon`, `input`, `card`, `navigation`, `feedback`, `layout-wrapper`, `typography`, `data-display`, `overlay`, etc. Se não tiver certeza, diga `uncertain` e explique por quê, não invente uma categoria forçada.
3. **Variant properties estruturadas**: lista de `{ property: string, values: string[] }` — ex: `{ "property": "size", "values": ["small", "medium", "large"] }`, `{ "property": "state", "values": ["default", "hover", "disabled"] }`. Extraia isso da definição real do component set (Figma expõe isso nativamente via `componentPropertyDefinitions`), não fazendo parsing de string.
4. **Hierarquia de composição**: se esse componente é composto por sub-componentes internos que TAMBÉM são publicados como peças próprias na mesma lib, liste esse relacionamento (ex: "Menu Lateral" contém instâncias de "Ícone" e "Item de Menu", ambos publicados separadamente). Se for composto por peças que NÃO são publicadas isoladamente (wrappers estruturais internos, ex: convenções `.[base] *` já vistas nesta lib), marque `internalOnly: true` nelas e não as liste como componentes "consumíveis" de primeira classe.
5. **Convenção de nome observada**: registre se o componente segue algum prefixo/convenção visível (`[dsc]`, `.[base]`, outro) — isso já é usado no código do Handex como sinal fraco de "é publicado oficialmente" (`[dsc]`) vs. "é peça de composição interna" — mas **não invente novas convenções**, só reporte o que observar.
6. **Thumbnail/preview**: se o MCP conseguir extrair uma imagem ou descrição visual do componente, inclua uma referência (path do arquivo exportado, ou descrição textual objetiva do que ele parece visualmente — não precisa ser exaustivo, é só apoio pra sugestão de componente).
7. **Descrição/documentação**: campo `description` nativo do Figma, se preenchido.

## O que NÃO fazer

- Não tente resolver ou "corrigir" a duplicidade `web-angular-react`/`super-gerenciador` — isso é decisão de produto já tomada, fora de escopo.
- Não infira categoria de acessibilidade (isso é escopo de outro plugin, o "hac", que já tem lógica própria e mantida separadamente — não duplicar aqui).
- Não modifique nada nos arquivos do Figma — isto é um scan **somente leitura**.
- Não tente escanear a lib inteira "por nome" ou adivinhar — use os fileKeys exatos acima.
- Se uma lib tiver milhares de componentes (ex: `fundamentos-visuais` tem ~10.300 e `super-gerenciador` ~4.700 pela contagem antiga da REST API), não pule/trunque silenciosamente — se precisar processar em lotes por limitação de contexto, diga isso explicitamente no output e cubra 100% ao final, ou avise exatamente quantos ficaram de fora e por quê.

## Formato de saída esperado

Um arquivo JSON por biblioteca, nomeado `{slug}.deep-scan.json`, seguindo este schema:

```json
{
  "meta": {
    "slug": "web-angular-react",
    "libraryName": "Web Angular & React",
    "figmaFileKey": "8QvOeTODSBi3PquJT5CISP",
    "scannedAt": "<ISO timestamp>",
    "totalComponentSetsFound": 0,
    "totalComponentsFound": 0,
    "coverageNote": "descreva aqui se cobriu 100% ou não, e por quê"
  },
  "componentSets": [
    {
      "parentName": "Classificação de Conteúdo",
      "parentKey": "<key do COMPONENT_SET, se aplicável>",
      "category": "data-display",
      "categoryConfidence": "high | medium | uncertain",
      "namingConvention": "[dsc]" ,
      "description": "",
      "variantProperties": [
        { "property": "confidencial", "values": ["true", "false"] },
        { "property": "tipo", "values": ["EXTERNO.RESTRITO", "..."] },
        { "property": "abreviado", "values": ["true", "false"] }
      ],
      "variants": [
        { "key": "9f35761337054df2f09e447ad79c792df08abf58", "name": "confidencial=true, tipo=EXTERNO.RESTRITO, abreviado=false" }
      ],
      "composedOf": [
        { "componentKey": "<key>", "componentName": "<nome>", "internalOnly": false }
      ],
      "thumbnailRef": null
    }
  ],
  "standaloneComponents": [
    // componentes publicados que não fazem parte de um COMPONENT_SET (variante única)
  ]
}
```

Ao final, gere também um **resumo consolidado** (`docs/handex-deep-scan-summary.md` ou similar) com:
- Total de componentes/component sets por lib, comparado com a contagem antiga da REST API (para eu conseguir validar que a cobertura aumentou, não diminuiu).
- Lista de categorias observadas, e quantos componentes caíram em `uncertain`.
- Quaisquer padrões novos de nomenclatura observados que valham a pena virar regra oficial (mas sem decidir isso sozinho — só reportar candidatos).
- Qualquer coisa que pareça inconsistente entre libs (ex: mesma categoria de componente nomeada diferente em `web-angular-react` vs. `super-gerenciador`).

## Contexto de arquitetura (para você entender onde isso entra depois)

Esses arquivos `.deep-scan.json` **não substituem** o pipeline atual (`fetch-design-refs.cjs` → `refs/{slug}.json` → `build-skeleton.cjs` → `_skeleton.json` embarcado no plugin) — são uma camada adicional de enriquecimento que será integrada depois, numa etapa separada, por outro processo. Seu trabalho aqui termina na entrega dos JSONs de scan + o resumo consolidado. Não tente integrar ao skeleton existente nem alterar o código do plugin.
