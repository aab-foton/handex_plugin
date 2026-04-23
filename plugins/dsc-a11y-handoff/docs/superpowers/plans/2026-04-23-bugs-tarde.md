# Bugs para corrigir — tarde de 2026-04-23

Base: commit `3b1cdb2` (rollback feito). Nenhum reaproveitamento do código quebrado.

## Lista

1. **Checkbox "sem gestos / sem teclado"**
   - Ao marcar, deve excluir os dados já inseridos E não preencher nada no template.
   - Comportamento atual: não está fazendo nenhum dos dois corretamente.

2. **Propriedades booleanas com `#[números]` no nome**
   - Ex: `LABEL#14952:56`, `SHOW CLOCK ICON#42996:0`
   - Remover o sufixo `#XXXX:XX` do texto exibido.
   - Colocar as propriedades booleanas por último na lista.

3. **Área de toque misturando variante com default**
   - Ao criar área de toque em uma variante específica, ele traz a default no lugar.
   - Estava funcionando antes do rollback → regressão no código base.

4. **Criação de variante para tabs trava o plugin**
   - Tentar criar uma variante para "tabulação" (igual ao fluxo da área de toque) congela e não responde.
   - Provavelmente o mesmo fluxo `create-variation-frame` / `_pendingOpenTouchForm` mas para tab.

5. **Nome acessível não mostra o input**
   - Ao selecionar uma especificação que tem "Nome Acessível", o campo de input não aparece na UI.
   - A imagem mostra o card com "NOME ACESSÍVEL: Função, Valor, Rótulos" mas sem input editável.

6. **Overlay de área de toque não é apagado após salvar**
   - Após confirmar e salvar a área de toque, o frame rosa de marcação deve ser removido do canvas.
   - Atualmente fica lá.

## Ordem sugerida

3 → 4 → 6 → 1 → 5 → 2

(Começar pelos que bloqueiam o fluxo principal de variações.)
