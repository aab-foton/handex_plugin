# Release notes — Figma Community

Texto pronto para colar no campo de descrição de cada publicação em Community → Manage → Publish new version. Mantido separado do `CHANGELOG.md` (que é técnico/interno) porque este é escrito para o usuário final do plugin, sem jargão de código.

---

## Version [preencher] — v6.7.0 (2026-08-28)

**Novidades**

**Toggles no Contexto de Negócio**
Briefing Estratégico, Regras de Negócio e HUs e Links de Referência agora têm um interruptor próprio — vêm ativados por padrão, e você pode desligar qualquer um deles quando não fizer sentido para o projeto, sem perder o que já preencheu.

**Limpar Briefing**
Novo botão para apagar todas as perguntas do Briefing de uma vez, com uma confirmação simples — não precisa mais remover pergunta por pergunta.

**Correções e melhorias**

**Especificação criada podia não aparecer na lista**
Em algumas sessões — geralmente depois de trocar de arquivo Figma ou excluir um frame com o plugin ainda aberto — uma nova especificação era criada normalmente no canvas, mas não aparecia na lista de "Anotar Specs" dentro do plugin. Corrigido — a especificação agora aparece sempre, mesmo nesses casos.

**Conformidade com o Design System volta a ser verificada automaticamente**
Na etapa "Escanear Tokens", cada item escaneado (componente, ícone, tipografia) agora mostra de novo se está "Em conformidade", "Necessita revisão" ou "Fora do padrão" em relação ao Design System CAIXA — com a contagem de propriedades em cada situação. O critério é rigoroso: um item sem token vinculado é tratado como fora do padrão, mesmo que você marque "Sem desvios" — só passa para "Em revisão" depois que você escreve uma justificativa no campo de observações.

**Botão de atualizar escaneamento mais fácil de encontrar**
Antes, o botão para re-escanear um frame só aparecia depois de declarar a conformidade — dificultando revisar e escanear de novo antes de decidir. Agora ele fica sempre visível, ao lado do título "Tokens Escaneados".

**Instruções de "Escanear Tokens" mais claras**
O onboarding e o guia "Como usar o plugin" foram reescritos para deixar explícito que o scan é um ponto de partida, não uma aprovação automática — cabe a você revisar cada item antes de declarar conformidade.

**Clique no canvas não trava mais o Tab dentro do plugin**
Depois de abrir um modal e clicar no canvas do Figma, o teclado podia ficar "preso" tentando voltar para o plugin em vez de navegar no Figma normalmente. Corrigido — clicar fora do plugin agora funciona como esperado, sem interferência do plugin.

**Rodapé da home reorganizado**
"Gerar Ficha de Handoff" agora ocupa a linha inteira, sozinho, como ação principal. Abaixo, os botões de Baixar, Importar e Limpar ficaram do mesmo tamanho, distribuídos lado a lado.

**Tela de resumo do Handoff reorganizada**
"Gerar Ficha" agora vem antes das opções de exportação, para que o que você exporta sempre reflita o que já foi gerado no canvas. Um aviso explica a diferença entre exportar em Markdown (para ler) e em JSON (backup completo, o único que pode ser reimportado depois).

**Instruções mais claras em Informações do Projeto**
O guia agora explica o "porquê" de preencher o Briefing Estratégico, as Regras de Negócio e HUs, e os Links de Referência — não só o "como".

**Nomenclatura corrigida**
"DSC" agora aparece corretamente como "Design System CAIXA" em todo o plugin.

---

## Version 11 — v6.2.0 (2026-08-04)

**Correções e melhorias**

**Especificação apagada não volta mais sozinha**
Ao excluir uma especificação e depois navegar para outra tela do plugin (ou reabrir o plugin), ela podia reaparecer na lista mesmo já tendo sido apagada. Corrigido — agora a exclusão é definitiva.

> Se você já tinha apagado alguma especificação antes desta atualização e ela ainda aparecer uma última vez, é só excluir novamente — a partir daqui ela não volta mais.

**Indicação visual no ícone de linhas do grupo de especificações**
O ícone que oculta/exibe as linhas de conexão de um grupo de especificações agora fica azul quando as linhas estão visíveis, no mesmo padrão do ícone de olho ao lado.

---

## Version 10 — v6.1.2 (2026-07-29)

**Novidade**

**Sugestão automática de tag ao criar especificação**
Ao criar uma nova especificação, o campo de tag já vem preenchido com a próxima letra disponível (A, B, C...), com base nas especificações já existentes no frame. Você continua podendo editar livremente — inclusive para criar sub-níveis como A1 ou B1.1 — a sugestão só poupa o trabalho de digitar do zero toda vez.

---

## Version 9 — v6.1.1 (2026-07-29)

> Publicada sem este texto colado no campo de release notes da Figma — ver nota no `CHANGELOG.md` v6.1.1. Reaproveitar aqui na próxima publicação, ou adicionar retroativamente se a Figma permitir editar a descrição de uma versão já publicada.

**Correções e melhorias**

**Especificações sem frame associado agora permanecem salvas**
Especificações criadas sem vincular a um frame específico podiam desaparecer da lista ao navegar entre telas do plugin. Corrigido — elas agora persistem normalmente, junto com as especificações vinculadas a frames.

**Ficha de handoff exportada sem mais duplicações**
A ficha HTML exportada podia mostrar a mesma especificação duas vezes em seções diferentes. Agora cada especificação aparece uma única vez.

**Importação de backup (JSON) mais confiável**
Ao restaurar um backup, especificações e medidas que não estavam vinculadas a um frame específico eram ignoradas — o resumo da importação mostrava contagem zerada e nada era recriado no canvas. Agora esses dados são reconhecidos e recriados corretamente.
