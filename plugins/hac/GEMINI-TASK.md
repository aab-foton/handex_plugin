# Tarefa para o agente Gemini — hac

Esta é uma tarefa NOVA, continuação da investigação anterior sobre o
arquivo Figma novo de referência. Se você está vendo tarefas antigas
neste arquivo, ignore-as — foram concluídas em sessões passadas.

## Escopo — LEIA ANTES DE QUALQUER AÇÃO

**Você só tem permissão para escrever no arquivo explicitamente listado
abaixo** — nunca mais que isso, mesmo que pareça útil.

**Não edite, crie, apague ou renomeie nenhum outro arquivo ou pasta** —
isso inclui `code.js`, `code.bundle.js`, `ui.html`, qualquer arquivo em
`src/plugin/modules/`, `src/plugin/views/`, `src/plugin/styles/`,
`docs/`, `.github/`, este próprio `GEMINI-TASK.md`, ou qualquer outro
`.json` dentro de `src/plugin/refs/` que não seja o alvo explícito desta
tarefa (em especial não edite `hac-new-reference-scan.json` — é o scan
anterior, mantido como histórico; esta tarefa cria um arquivo NOVO).

**Não edite nada no Figma** — esta tarefa é só de LEITURA do arquivo
Figma via MCP. Não altere nomes, propriedades, posições ou qualquer
elemento do arquivo de origem.

Não rode build/bundle/lint/commit/push. A tarefa termina quando o JSON
alvo estiver preenchido e salvo.

## Contexto — o que mudou desde o último scan

Na investigação anterior (registrada em
`src/plugin/refs/hac-new-reference-scan.json`), o arquivo
`[HAC] Handoff Super DSC Mobile e Web`
(https://www.figma.com/design/HhriLSpKnCB2dHhyiU16iB) ainda **não estava
publicado como biblioteca** — nenhum componente tinha `key`.

**Isso mudou.** O arquivo já foi publicado. Confirmamos via REST API que
estes 6 component sets já têm `key` real e são importáveis:

- `[hac] Conectores` (node `1:50`, key `ef1080dfa9...`)
- `[hac] Agrupamento` (node `1:169`, key `9ad0de5497...`)
- `[hac] Número da tela` (node `13:479`, key `060f39545f...`)
- `[hac] Ordenação` (node `5222:4270`, key `a22bae6f39...`)
- `[hac mob] Box specs leitor de tela` (node `5413:1262`, key `30a1983bc9...`)
- `[hac web] Box specs leitor de tela` (node `10330:4204`, key `e2c3162d5c...`)

Os 3 conectores individuais ocultos (prefixo `.`) continuam sem key —
isso é esperado, mesmo padrão da lib antiga (variantes internas usadas
por composição, não publicadas isoladamente):
- `.[hac] Conector elementos decorativos` (node `1248:2426`)
- `.[hac] Conector títulos` (node `1248:2330`)
- `.[hac] Conector elementos interativos e imagens` (node `1248:2328`)

Também já confirmamos via REST API as properties reais dos 4 primeiros:

```
[hac] Conectores:
  letra / número#7187:0 (TEXT)
  tipo (VARIANT: decorativo, títulos, elementos interativos e imagens)
  conector (VARIANT: desativado, inferior, superior, esquerda, direita)

[hac] Agrupamento:
  letra / número#7165:65 (TEXT)
  tipo (VARIANT: elementos interativos e imagens, decorativo, títulos)
  orientação (VARIANT: esquerda, direita, inferior, superior)

[hac] Número da tela:
  mostrar label#733:0 (BOOLEAN)
  label#733:6 (TEXT)
  número#1478:0 (TEXT)
  conector (VARIANT: desativado, inferior, superior, esquerda, direita)

[hac] Ordenação:
  número#5265:3 (TEXT)
  tamanho (VARIANT: grande, pequeno)
```

**O que ainda não confirmamos, e é o objetivo desta tarefa**: como esses
componentes se comportam na prática ao serem IMPORTADOS de verdade — algo
que só dá pra testar agora que existe key real, e que a investigação
anterior (só REST API, sem MCP) não conseguia fazer.

## Sua tarefa

**Arquivo que você pode editar (crie do zero):**

```
src/plugin/refs/hac-published-lib-verification.json
```

Para cada um dos 6 component sets já publicados (listados acima):

1. **Confirme visualmente** (screenshot/inspeção via MCP) que a
   aparência de cada variante bate com o que já foi descrito no scan
   anterior (`hac-new-reference-scan.json` — pode consultar esse arquivo
   como referência, mas não o edite). Anote qualquer diferença visual
   real que encontrar.

2. **Anote a variante DEFAULT** de cada component set — ou seja, qual
   combinação de propriedades vem selecionada quando o Figma cria uma
   instância nova a partir da key raiz do component set, sem especificar
   nenhuma property (isso é relevante pro plugin saber o que esperar se
   importar sem configurar propriedades explicitamente).

3. **Para `[hac] Número da tela` e `[hac] Ordenação`**: esses dois
   parecem cobrir o mesmo conceito que hoje existe separado no plugin
   como "Item Number" (desktop) e "Ordenação" (mobile antigo). Descreva
   a diferença visual/de uso entre os dois pra confirmar se são
   realmente conceitos distintos (ex.: um é círculo grande com número,
   outro é uma marca pequena) ou se um deles é redundante.

4. **Verifique se existe algum componente NOVO no arquivo que não foi
   listado no scan anterior** — dê uma olhada geral nas páginas
   "⚙️ | Componentes Conectores Gerais" e nas 2 páginas de
   "Componentes Specs base" (Mobile e Web) procurando por qualquer
   marcador de acessibilidade (não componente de produto tipo Button/
   Card) que não esteja nesta lista de 6 + 3 ocultos.

5. **Campo mais importante**: para cada um dos 6, tente simular (via MCP,
   se a ferramenta permitir inserir/testar um componente no arquivo, SEM
   salvar nenhuma alteração real — ou, se não for possível testar,
   avalie só pela estrutura visível) se a property de texto livre
   (`letra / número`, `label`, `número`) aceita qualquer string ou tem
   alguma restrição de formato que valha documentar (ex.: só 1
   caractere, ou até 2 dígitos).

Estrutura sugerida do JSON (adapte livremente, mantendo a ideia geral):

```json
{
  "_meta": {
    "status": "preenchido",
    "scanDate": "AAAA-MM-DD",
    "contexto": "Verificação pós-publicação da lib — os 6 component sets abaixo já têm key real, diferente do scan anterior (hac-new-reference-scan.json)."
  },
  "componentesPublicados": [
    {
      "nome": "[hac] Conectores",
      "nodeId": "1:50",
      "key": "ef1080dfa9...(confirme a key completa via MCP se conseguir)",
      "varianteDefault": "descrição da combinação de properties que vem selecionada por padrão",
      "observacoesVisuais": "qualquer diferença encontrada em relação ao scan anterior, ou confirmação de que bate",
      "restricaoDePropertyTexto": "o que você observou sobre limite/formato da property de texto livre, se algo relevante"
    }
  ],
  "comparacaoNumeroTelaVsOrdenacao": "sua análise do item 3 acima",
  "componentesNovosEncontrados": ["lista de qualquer coisa nova encontrada no item 4, ou array vazio se nada novo"]
}
```

Quando terminar, não faça mais nada — não precisa avisar ninguém nem
rodar nenhum comando. O dono do repositório vai revisar o resultado antes
de decidir se e quando migrar a importação real desses componentes para
o plugin (essa migração NÃO é parte desta tarefa — é uma decisão e
implementação separadas, feitas depois, com mais cuidado, por tocar uma
área sensível do código).
