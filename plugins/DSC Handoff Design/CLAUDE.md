# DSC Handoff — Plugin Figma

## Sobre o Projeto

Plugin Figma para geração automática de documentação visual de componentes do Design System Caixa. Gera handoffs contendo:

- **Tabela de propriedades** — texto, booleano, variante, troca de instância
- **Variações visuais** — anatomia do componente
- **Matriz de estados** — combinações de variantes × estados

## Estrutura

```
code.ts        → Lógica principal do plugin (TypeScript)
code.js        → Build compilado (gerado pelo tsc)
ui.html        → Interface do plugin (HTML inline)
manifest.json  → Manifesto do plugin Figma (id: 1608233821729882247)
```

## Comandos

```bash
npm run build    # Compila code.ts → code.js
npm run watch    # Compila em modo watch
npm run lint     # Roda ESLint
npm run lint:fix # Corrige lint automaticamente
```

## Convenções

- **Idioma do código**: variáveis, funções e comentários em **português**
- **TypeScript strict mode** com target ES2017
- O arquivo principal é `code.ts` — todo o plugin vive neste único arquivo
- O build gera `code.js` que é referenciado pelo `manifest.json`
- Usa a API do Figma (`@figma/plugin-typings`)

## Constantes Importantes

- `CANDIDATOS_EIXO_Y` — propriedades candidatas ao eixo Y da matriz de estados
- `DICIONARIO_PROPRIEDADES` — descrições amigáveis para propriedades conhecidas
- `PARES_DIRECIONAIS` — pares como left/right usados para agrupar variações

## Observações

- Não há bundler (webpack/esbuild) — o tsc compila direto
- O plugin não faz chamadas de rede (`networkAccess: none`)
- Branch principal: `main`, branch de ajustes: `ajustes`
