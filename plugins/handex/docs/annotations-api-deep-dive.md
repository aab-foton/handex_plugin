# Handex — Aprofundamento: Annotation API nativa (Dev Mode)

> Complementa `docs/figma-api-roadmap-2026.md`. Decisão tomada em 2026-07-07: **híbrido**, não substituição. Este documento é o desenho técnico do que isso significa na prática.
>
> **Nota separada (2026-07-08)**: o spike relacionado de `ConnectorNode` nativo (`figma.createConnector()`) para a LINHA conectora das specs foi testado e **falhou em runtime**: `TypeError: not a function`. `createConnector()` é exclusivo de arquivos FigJam (`editorType: "figjam"`) — não existe no contexto Design/Dev Mode onde o Handex roda (`editorType: ["figma", "dev"]`). Ver `docs/native-connector-spike-result.md` para o registro completo. Isso NÃO afeta a análise de Annotation API deste documento (`figma.annotations`/`node.annotations` é uma API diferente, disponível em Design) — são duas features distintas da Plugin API que só coincidem em serem "recursos do Dev Mode".

## Nota de investigação: código morto encontrado, não integração existente

Durante esta análise, o usuário levantou a hipótese de que "as Especificações já resgatam o conteúdo das Annotations hoje" — o que teria mudado a decisão (uma dependência real pesa mais que uma oportunidade). Investigação no código:

- `grep` por `\.annotations|getAnnotationCategor|categoryId|AnnotationCategoryColor` em `code.js` e `specifications.js`: **zero ocorrências**. Nenhum uso da API nativa `figma.annotations`/`node.annotations`.
- `code.js:1634` tem o comentário `// add-annotations is handled below`, mas o código logo abaixo é o handler de **medidas** (`measure-nodes-custom`), não anotações — comentário desatualizado/enganoso.
- `messages.js:157` tem um listener `if (msg.type === 'annotations-added') { showToast('Anotações criadas'); }`, mas **não existe nenhum emissor** dessa mensagem em `code.js` (`figma.ui.postMessage({type: 'annotations-added', ...})` não existe em lugar nenhum do arquivo).
- `git log -S "annotations-added" --all` em `messages.js`/`ui.html`/`code.js`: o listener já existia no commit mais antigo rastreável (`fb551c6`, 2026-05-13) e nunca teve emissor em nenhum ponto do histórico disponível. `CHANGELOG.md` não menciona "annotation" nenhuma vez.

**Conclusão**: `annotations-added` é código morto — provavelmente um handler planejado para uma feature que nunca foi implementada do lado do backend (possivelmente para medidas em lote, dado que fica logo perto do handler de `measure-nodes-custom`), não uma integração com a Annotation API do Figma que existiu e foi removida. No vocabulário do produto, "anotações" é usado genericamente para os elementos desenhados no canvas (specs, medidas), não a API nativa do Dev Mode. Não há dependência real hoje — a decisão de seguir com o híbrido abaixo se mantém por mérito próprio, não por causa de uma integração pré-existente.

## Achado decisivo: visibilidade sem Dev Mode

Comparação visual direta feita pelo usuário em 2026-07-07 (screenshots de um card de spec real do Handex vs. uma Annotation nativa real no painel Dev Mode) confirma o ponto mais importante desta análise:

- **Card de spec do Handex**: é um **nó real desenhado no canvas** (`figma.createFrame`/`createLine` em `code.js`). Visível para **qualquer pessoa que abrir o arquivo Figma** — com ou sem Dev Mode habilitado, com ou sem o plugin instalado. Badge de letra, linha conectora pontilhada até o elemento, conteúdo customizado.
- **Annotation nativa**: só é renderizada **dentro do painel de Dev Mode** do Figma. Fora do Dev Mode, é completamente invisível no canvas — não é um nó, não aparece para quem não ligou o Dev Mode naquele arquivo.

Isso importa porque o público do Handex não é só dev: **PO, QA, outros designers** tipicamente revisam o handoff sem ter Dev Mode habilitado (é mais hábito/permissão de desenvolvedor). Uma migração para Annotation nativa excluiria esse público do acesso à informação — mesmo que a annotation carregasse o dado certo, ninguém sem Dev Mode a veria.

**Isso reforça, não muda, a decisão de manter o híbrido**: o card visual no canvas continua sendo o único formato que serve o público amplo (PO/QA/design), e é por isso que ele deve seguir como principal — a Annotation nativa é estritamente um complemento para quem já vive no Dev Mode, nunca um substituto.

## Por que não é substituição

A `AnnotationProperty` do Figma é uma **enumeração fechada** de propriedades de design do próprio nó (`width`, `height`, `fills`, `strokes`, `effects`, `fontSize`, `padding`, `cornerRadius` etc.) — não aceita pares arbitrários `nome/token/valor` definidos pelo designer. O que o Handex chama de "Propriedades" numa spec (`nome da propriedade` + `token do Design System` + `valor aplicado`, ver `guide.html` "Anotar Specs", passo 5) **não tem equivalente nativo**. Além disso:

| Recurso da spec Handex | Equivalente nativo | Veredito |
|---|---|---|
| Categoria + cor customizada | `AnnotationCategory` (`figma.annotations.addAnnotationCategoryAsync({label, color})`) + `categoryId` na Annotation | Cobre |
| Nota técnica | `label` (texto simples) ou `labelMarkdown` (Markdown) | Cobre |
| Propriedades técnicas livres (nome/token/valor) | Nenhum — `properties` só aceita tipos fixos do nó | **Não cobre** |
| Letra/tag (A, B, C1) + empilhamento por coluna no canvas | Nenhum — annotation é entrada plana num painel, não elemento gráfico no canvas | **Não cobre** |
| Link para componente DSC | Nenhum campo dedicado; só via texto livre em Markdown | Parcial |
| Exceções aninhadas (Erro/Sucesso/Alerta/Confirmação) | Nenhuma estrutura hierárquica | **Não cobre** |

Migrar integralmente perderia a informação mais valiosa do produto (propriedades técnicas estruturadas) e a experiência visual de card conectado ao elemento no canvas — que hoje é o que torna a ficha "auto-suficiente" (funciona sem que o dev precise abrir o Dev Mode).

## Desenho do híbrido

**Princípio**: o card visual no canvas continua sendo a fonte de verdade e a UI principal (nada muda para o designer). A Annotation nativa é um **espelho simplificado e adicional**, criado em paralelo, para que a spec também apareça no painel de Dev Mode nativo do Figma — útil para desenvolvedores que já trabalham por ali e não abrem o plugin.

### Ponto de integração no código

`src/plugin/code.js`, handler `create-unified-spec` (linha ~2650): já resolve o `node` alvo (elemento selecionado ou `targetNodeId`) e já tem `opts` com `color`, `fillColor`, categoria, label/nota, e a lista de propriedades técnicas. É o ponto natural para, **após** criar o `specCard` visual (como hoje), adicionar:

```js
// Após criar o specCard visual (comportamento atual inalterado)
try {
  let category = await findOrCreateAnnotationCategory(opts.categoriaNome, opts.color);
  node.annotations = [
    ...(node.annotations || []),
    {
      label: buildAnnotationSummary(opts), // "Letra A · Botão Primário · 3 propriedades — ver ficha no canvas"
      categoryId: category.id
    }
  ];
} catch (e) {
  // Annotation nativa é um extra — nunca deve bloquear a criação da spec visual se falhar
}
```

`buildAnnotationSummary(opts)` gera um resumo textual (não tenta replicar as propriedades técnicas 1:1) com uma instrução clara de que os detalhes completos estão no card do canvas — evita duplicar dados que podem divergir.

### `findOrCreateAnnotationCategory`

Reutiliza a paleta de cores já existente do sistema de specs (`_CAT_COLORS`/`CATEGORY_COLORS` em `specifications.js` — ver memória `project-spec-colors`). Precisa mapear hex → `AnnotationCategoryColor` (enum fechado de cores nomeadas do Figma, não hex livre) — **checar na implementação real se o enum tem cores próximas o suficiente das 11 categorias atuais**; se não tiver, usar a cor mais próxima e documentar o desvio, não forçar um hack de cor.

### Erros/exceções

`node.annotations` deve ser tratado como **melhor esforço**: se falhar (nó não suporta annotations, ex. tipos fora da lista suportada, ou erro de permissão), a criação da spec visual não deve ser bloqueada — sempre um `try/catch` silencioso com log, nunca um `figma.notify` de erro que confunda o designer sobre o que realmente falhou.

### Limpeza ao excluir spec

O fluxo de `deleteNode` (specifications.js) hoje remove o card visual do canvas. Ao adotar o híbrido, também precisa remover a entrada correspondente de `node.annotations` — senão a anotação nativa fica órfã, referenciando uma spec que não existe mais no card visual. Isso exige guardar uma referência (ex: id da spec) dentro do `label` ou de outro campo rastreável para localizar a entrada certa no array de annotations no momento da exclusão.

## Esforço estimado

- Baixo-médio: é aditivo, não uma migração. Principal trabalho é (a) mapear as 11 cores de categoria existentes para o enum fechado do Figma, (b) implementar `findOrCreateAnnotationCategory` com cache (evitar recriar categoria a cada spec), (c) tratar o ciclo de vida (criar/remover) em paralelo ao card visual sem acoplar os dois fortemente.
- Risco principal: **duplicação de estado** entre o card visual (fonte de verdade) e a annotation nativa (espelho) — se um dos dois falhar silenciosamente, ficam dessincronizados. Mitigar tratando a annotation sempre como best-effort e nunca como algo que o usuário edita diretamente (só o plugin escreve nela).

## Recomendação

Vale um spike pequeno (1 spec, 1 categoria) antes de comprometer no roadmap — validar na prática se o enum `AnnotationCategoryColor` tem cores suficientes e se `node.annotations` de fato aparece no painel Dev Mode como esperado para os tipos de nó que o Handex mais usa (Frame, Instance, Text).
