# DSC Handoff Plugin - Memória de Projeto

Este documento serve como a base de conhecimento e diretrizes para o desenvolvimento do plugin de Handoff. As instruções aqui contidas têm precedência sobre padrões genéricos.

## 🎯 Objetivo Geral
Desenvolver um plugin para Figma que gera documentação estruturada de Component Sets, incluindo:
1. **Tabela Técnica:** Lista de propriedades (locais e de subcomponentes expostos).
2. **Seções de Anatomia:** Visualização de variações booleanas e direcionais.
3. **State Matrix:** Grid de estados cruzando variantes de tema/tipo com estados do componente.

---

## 🛠️ Pilares Técnicos e Regras de Negócio

### 1. Tabela Técnica (Fonte Definitiva)
- **Fonte Primária:** `node.componentPropertyDefinitions` (contém variantes, locais e expostas).
- **Filtro de Exposição (Nested):** Utiliza `node.defaultVariant.exposedInstances` para identificar quais subcomponentes estão com o "check" ativo no painel lateral. Propriedades aninhadas sem check são filtradas.
- **Nomenclatura Legível:** 
  - Limpa IDs internos via regex.
  - Converte símbolos Figma em seta elegante ` -> `.
- **Automação de Texto:** 
  - Propriedades `TEXT` que contenham "label", "text" ou "texto" recebem valor fixo **"texto"**.
  - Descrição gerada: `"Texto que será aplicado na(o) [Nome da Propriedade]"`.

### 2. Anatomia e Visualização
- **Estilo Original:** As instâncias geradas devem preservar as cores originais (ex: ícones brancos). Para isso, criar instâncias a partir de `defaultVariant` e aplicar apenas a propriedade específica do teste.
- **Lógica Booleana Direcional:** Agrupar pares (Left/Right, Top/Bottom) em linhas de 4 cards: `NONE`, `[DIR] ONLY`, `[DIR] ONLY`, `BOTH`.
- **Resiliência de Layout:** Sempre realizar o `appendChild` no container pai **antes** de configurar propriedades de Auto Layout (`layoutSizingHorizontal`, etc) para evitar crashes da API.

### 3. State Matrix
- **Alinhamento:** Utilizar largura de coluna dinâmica baseada no maior componente (`maxCompWidth + 100px`, mínimo 320px).
- **Eixos:** 
  - Colunas: Estados (`state`).
  - Linhas: Cruzamento de `variant`/`theme` com `type`/`mode`.

---

## 📋 Status das Tarefas

- [x] Reset da lógica de tabela.
- [x] Inclusão de subcomponentes expostos (Exposed Instances).
- [x] Restauração total das propriedades Locais (Text/Boolean).
- [x] Filtro dinâmico baseado nos checks do Figma.
- [x] Automação de nomes e descrições de texto.
- [ ] Refinamento final de posicionamento do documento.

---

## 📝 Histórico de Decisões Importantes
- **2026-02-26:** Reset completo da Tabela Técnica para reconstrução focada na API nativa do Figma.
- **2026-02-26:** Decidido usar `componentPropertyDefinitions` como base primária para garantir que a tabela reflita as definições do designer, cruzando com `exposedInstances` para respeitar os "checks" da sidebar.
- **2026-02-26:** Implementada limpeza de sufixos numéricos (ex: `-> 0`) que surgiam de IDs internos do Figma mal processados.
