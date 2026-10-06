"""Roteiros do tutorial em duas trilhas: Web (w1-w4) e Mobile (m1-m5).

Web usa só prints web (prefixo sem "m-") e nunca fala de Swipe. Mobile usa os
prints "m-*" e os prints reais do canvas (../prints, feitos num projeto mobile).
Uso: python tools/roteiros.py   -> grava video/roteiro-<id>.json
"""
import json, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'video'))
VOZ = 'pf_dora'
REAL = 'Screenshot 2026-09-30 {}.png'


def w(n, titulo, cenas):
    json.dump({"titulo": titulo, "voz": VOZ, "cenas": cenas},
              open(f'roteiro-{n}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)


def abre(kicker, titulo, fala):
    return {"id": "abertura", "kicker": kicker, "titulo": titulo, "fala": fala}


def fim(titulo, fala, kicker="Próximo vídeo"):
    return {"id": "fim", "kicker": kicker, "titulo": titulo, "fala": fala}


def cena(id, titulo, fala, print=None, real=None, **kw):
    c = {"id": id, "titulo": titulo, "fala": fala}
    if print: c["print"] = print
    if real: c["real"] = REAL.format(real)
    c.update(kw)
    return c


# ───────────────────────────── WEB ─────────────────────────────
KW = "Tutorial HAC Web · {} de 4"

w('w1', 'HAC Web | Primeiros passos', [
    abre(KW.format(1), "Primeiros passos", "Este é o HAC, o Handoff de Acessibilidade da CAIXA. Neste vídeo, você começa a documentar uma tela web direto no Figma."),
    cena("proposito", "O que o HAC faz", "O HAC registra como o leitor de tela anuncia cada elemento e em que ordem o teclado percorre a tela. O time de desenvolvimento recebe tudo pronto, no próprio canvas.", "01-home-origem"),
    cena("lib", "Escolha Web", "Na tela inicial, escolha Super DSC Web.", "01-home-origem", destaque="web"),
    cena("sublib", "Escolha a biblioteca", "Na web convivem duas bibliotecas: a legada, Web Angular e React, e a nova, Super DSC Web. Escolha a do seu projeto. O HAC reconhece as duas.", "02-home-sublib-web", destaques=["legado", "nova"]),
    cena("selecionar", "Selecione a tela", "Selecione no canvas a tela que você quer documentar e clique em Selecionar Tela.", "03-lista-telas", destaque="selecionar"),
    cena("nomear", "Dê um nome", "Dê um nome para a tela e confirme. Ela ganha um selo numerado e passa a reunir toda a documentação dela.", "04-selecionar-tela", destaque="confirmar"),
    cena("cards", "Acompanhe cada tela", "Cada tela vira um card, com o andamento de cada etapa. Clique no card para abrir o espaço de trabalho.", "03-lista-telas", destaqueManual={"x": 17, "y": 158, "w": 446, "h": 183}),
    cena("abas", "Três etapas", "Na web, o trabalho tem três abas. Tabulação, para a ordem do teclado. Leitor de Tela, para o que cada elemento anuncia. E Resumo, para gerar o handoff.", "05-aba-tabulacao", destaques=["abaTab", "abaLeitor", "abaResumo"]),
    fim("Ordem de Tabulação", "No próximo vídeo, você monta a ordem de tabulação da tela web."),
])

w('w2', 'HAC Web | Ordem de Tabulação', [
    abre(KW.format(2), "Ordem de Tabulação", "A ordem de tabulação é a sequência em que o teclado percorre os elementos interativos da tela."),
    cena("vazio", "Comece pela aba", "Abra a tela, entre na aba Tabulação e clique em Criar ordem de tabulação.", "06-aba-tabulacao-vazia", destaque="criar"),
    cena("instrucao", "Leia as instruções", "Na web, a tabulação é a sequência que o leitor de tela, como NVDA, VoiceOver ou Jaws, percorre quando o usuário navega por teclado ou outros dispositivos. Marque só os elementos interativos, como botões, links e campos.", "06b-instrucao-tabulacao"),
    cena("marcar", "Marque no canvas", "No canvas, segure Shift e clique em cada elemento, da esquerda para a direita, de cima para baixo. O HAC trabalha numa cópia da tela e não altera o design original.", "06c-revisao-tabulacao"),
    cena("revisao", "Revise a sequência", "Revise a lista. Arraste para reordenar, remova o que sobrou e confirme em Criar ordem de tabulação.", "06c-revisao-tabulacao", destaque="confirmar"),
    cena("tamanho", "Tamanho do selo", "Escolha o tamanho do selo numerado, pequeno ou grande, conforme a escala da tela. Trocar depois atualiza os selos já aplicados.", "05-aba-tabulacao", destaqueManual={"x": 14, "y": 208, "w": 236, "h": 36}),
    cena("simular", "Ouça a ordem", "Use Simular leitura para ouvir a sequência em voz alta e conferir se ela faz sentido.", "05-aba-tabulacao", destaque="simular"),
    cena("preencher", "Leve para o handoff", "Quando estiver tudo certo, clique em Preencher Tabulação.", "05-aba-tabulacao", destaque="preencher"),
    fim("Leitor de Tela", "No próximo vídeo: as especificações para o leitor de tela na web."),
])

w('w3', 'HAC Web | Leitor de Tela', [
    abre(KW.format(3), "Leitor de Tela", "Agora, as especificações para o leitor de tela: o que cada elemento anuncia para quem não enxerga a tela."),
    cena("instrucao", "Entenda a tarefa", "As instruções explicam o objetivo: definir como o NVDA, o VoiceOver e o Jaws interpretam e anunciam cada elemento.", "11-instrucao-leitor"),
    cena("nova", "Crie uma spec", "Selecione o elemento no canvas e clique em Nova spec.", "07-aba-leitor", destaque="novaSpec"),
    cena("categoria", "Quatro categorias", "Na web são quatro categorias: Estrutura da Página, Nível de Título, Elementos e Imagens, e Elemento Decorativo.", "12-nova-spec-categoria"),
    cena("elemento", "Elementos e Imagens", "Para botões, links e imagens, o HAC reconhece o componente do design system e preenche o formulário. Você confere e ajusta.", "13-form-elemento", destaque="componente"),
    cena("titulo", "Nível de Título", "Para títulos, indique o nível, de H1 a H6. O H1 é o título principal, único na página.", "14-form-titulo"),
    cena("estrutura", "Estrutura da Página", "Estrutura da Página marca as regiões semânticas, como cabeçalho, conteúdo principal, rodapé e idioma.", "17-form-estrutura"),
    cena("decorativo", "Elemento Decorativo", "Ilustrações e ícones sem função são marcados como decorativos, e o leitor de tela os ignora.", "15-form-decorativo"),
    cena("lista", "Tudo organizado", "As specs ficam agrupadas por categoria. Dá para localizar, editar ou excluir cada uma.", "07-aba-leitor"),
    cena("ajuda", "Na dúvida, consulte", "Se tiver dúvida sobre qual categoria usar, abra o guia Entendendo as categorias, no botão de ajuda.", "16-categorias-ajuda"),
    fim("Gerar e finalizar", "No último vídeo da trilha web: gerar e finalizar o handoff."),
])

w('w4', 'HAC Web | Gerar e finalizar', [
    abre(KW.format(4), "Gerar e finalizar", "Com a tabulação e o leitor de tela prontos, é hora de reunir tudo no handoff de acessibilidade."),
    cena("gerar", "Gere o handoff da tela", "Abra a aba Resumo e clique em Gerar Handoff. O HAC monta a ficha da tela no canvas, sem tocar no design original.", "08-aba-resumo", destaque="gerar"),
    cena("proximo", "E agora?", "Quando a ficha fica pronta, escolha: documentar outra tela, ou finalizar o handoff do projeto.", "09-modal-pos-handoff", destaques=["outra", "finalizar"]),
    cena("finalizar", "Finalize o projeto", "Quando todas as telas estiverem prontas, o botão Finalizar é liberado na lista de telas.", "03-lista-telas", destaque="finalizar"),
    cena("confirmar", "Confirme", "Confirme a finalização. Ela marca esta versão do handoff como concluída, e você pode continuar editando depois.", "18-modal-finalizar", destaque="confirmar"),
    fim("Obrigado!", "Você concluiu a trilha web do HAC. Boa documentação!", kicker="Tutorial HAC Web"),
])

# ──────────────────────────── MOBILE ────────────────────────────
KM = "Tutorial HAC Mobile · {} de 5"

w('m1', 'HAC Mobile | Primeiros passos', [
    abre(KM.format(1), "Primeiros passos", "Este é o HAC, o Handoff de Acessibilidade da CAIXA. Neste vídeo, você começa a documentar uma tela mobile direto no Figma."),
    cena("proposito", "O que o HAC faz", "O HAC registra o que o leitor de tela anuncia em cada elemento e em que ordem ele percorre a tela. O time de desenvolvimento recebe tudo pronto, no próprio canvas.", "01-home-origem"),
    cena("lib", "Escolha Mobile", "Na tela inicial, escolha Super DSC Mobile. O HAC passa a reconhecer os componentes do DSC Super App.", "01-home-origem", destaque="mobile"),
    cena("selecionar", "Selecione a tela", "Selecione no canvas a tela que você quer documentar e clique em Selecionar Tela.", "m-03-lista-telas", destaque="selecionar"),
    cena("nomear", "Dê um nome", "Dê um nome para a tela e confirme. Ela ganha um selo numerado e passa a reunir toda a documentação dela.", "m-04-selecionar-tela", destaque="confirmar"),
    cena("cards", "Acompanhe cada tela", "Cada tela vira um card, com o andamento de cada etapa. Clique no card para abrir o espaço de trabalho.", "m-03-lista-telas", destaqueManual={"x": 17, "y": 158, "w": 446, "h": 178}),
    cena("abas", "Quatro etapas", "No mobile, o trabalho tem quatro abas: Tabulação, Swipe para a ordem de leitura por gesto, Leitor de Tela e Resumo.", "m-05-aba-tabulacao", destaques=["abaTab", "abaSwipe", "abaLeitor", "abaResumo"]),
    fim("Ordem de Tabulação", "No próximo vídeo, você monta a ordem de tabulação da tela mobile."),
])

w('m2', 'HAC Mobile | Ordem de Tabulação', [
    abre(KM.format(2), "Ordem de Tabulação", "A ordem de tabulação é a sequência que o leitor de tela percorre nos elementos interativos da tela."),
    cena("vazio", "Comece pela aba", "Abra a tela, entre na aba Tabulação e clique em Criar ordem de tabulação.", "m-06-aba-tabulacao-vazia", destaque="criar"),
    cena("instrucao", "Leia as instruções", "No mobile, é a sequência que o VoiceOver e o TalkBack percorrem nos elementos interativos. Marque só botões, links, campos e seletores.", "m-06b-instrucao-tabulacao"),
    cena("captura", "Marque no canvas", "No canvas, segure Shift e clique em cada elemento, na ordem certa. O HAC trabalha numa cópia da tela e não altera o design original.", real="094350"),
    cena("revisao", "Revise a sequência", "Revise a lista. Arraste para reordenar, remova o que sobrou e confirme em Criar ordem de tabulação.", "m-06c-revisao-tabulacao", destaque="confirmar"),
    cena("tamanho", "Tamanho do selo", "Escolha o tamanho do selo numerado, pequeno ou grande. Trocar depois atualiza os selos já aplicados.", "m-05-aba-tabulacao", destaqueManual={"x": 14, "y": 208, "w": 236, "h": 36}),
    cena("simular", "Ouça a ordem", "Use Simular leitura para ouvir a sequência em voz alta.", "m-05-aba-tabulacao", destaque="simular"),
    cena("preencher", "Leve para o handoff", "Quando estiver tudo certo, clique em Preencher Tabulação.", "m-05-aba-tabulacao", destaque="preencher"),
    fim("Ordem de Leitura", "No próximo vídeo: a ordem de leitura por gesto, o Swipe."),
])

w('m3', 'HAC Mobile | Ordem de Leitura', [
    abre(KM.format(3), "Ordem de Leitura", "No celular, quem usa leitor de tela navega deslizando o dedo. A ordem de leitura documenta esse caminho."),
    cena("aba", "Abra a aba Swipe", "Abra a aba Swipe e clique em Criar ordem de leitura.", "m-21-aba-swipe", destaques=["aba", "criar"]),
    cena("instrucao", "Leia as instruções", "Diferente da tabulação, aqui entram todos os elementos da tela, inclusive textos, na ordem em que o gesto passa por eles.", real="094757"),
    cena("captura", "Marque os pontos", "Segure Shift e clique em cada ponto no canvas. Se a tabulação já estiver pronta, você também pode reaproveitá-la como ponto de partida.", real="094913"),
    cena("revisao", "Revise a trilha", "Revise os pontos na lista, reordene se precisar e confirme.", real="094934"),
    cena("trilha", "A trilha no canvas", "O HAC desenha a trilha sobre a cópia da tela, mostrando o caminho exato do gesto.", real="094949"),
    fim("Leitor de Tela", "No próximo vídeo: as especificações para o leitor de tela no mobile."),
])

w('m4', 'HAC Mobile | Leitor de Tela', [
    abre(KM.format(4), "Leitor de Tela", "Agora, as especificações para o leitor de tela: o que o VoiceOver e o TalkBack anunciam em cada elemento."),
    cena("instrucao", "Entenda a tarefa", "As instruções explicam o objetivo: garantir que o conteúdo seja compreendido e implementado exatamente como projetado.", "m-11-instrucao-leitor"),
    cena("nova", "Crie uma spec", "Selecione o elemento no canvas e clique em Nova spec.", "m-07-aba-leitor", destaque="novaSpec"),
    cena("categoria", "Três categorias", "No mobile são três categorias: Títulos, Elementos e Imagens, e Elemento Decorativo.", "m-12-nova-spec-categoria"),
    cena("elemento", "Elementos e Imagens", "Para botões, links e imagens, o HAC reconhece o componente do DSC Super App e preenche o link do componente. Você confere e ajusta.", "m-13-form-elemento", destaque="componente"),
    cena("titulo", "Títulos", "No mobile, todo título usa o mesmo marcador H, sem níveis de H1 a H6.", "m-14-form-titulo"),
    cena("decorativo", "Elemento Decorativo", "Ilustrações e ícones sem função são marcados como decorativos, e o leitor de tela os ignora.", "m-15-form-decorativo"),
    cena("canvas", "No canvas", "Cada spec aparece no canvas, ligada ao elemento, com o card que o time de desenvolvimento vai consultar.", real="095224"),
    cena("lista", "Tudo organizado", "No plugin, as specs ficam agrupadas por categoria. Dá para localizar, editar ou excluir cada uma.", "m-07-aba-leitor"),
    fim("Gerar e finalizar", "No último vídeo da trilha mobile: gerar e finalizar o handoff."),
])

w('m5', 'HAC Mobile | Gerar e finalizar', [
    abre(KM.format(5), "Gerar e finalizar", "Com a tabulação, a ordem de leitura e o leitor de tela prontos, é hora de reunir tudo no handoff."),
    cena("gerar", "Gere o handoff da tela", "Abra a aba Resumo e clique em Gerar Handoff.", "m-08-aba-resumo", destaque="gerar"),
    cena("processando", "Consolidando", "O HAC consolida cada etapa, uma de cada vez.", real="095638"),
    cena("ficha", "A ficha no canvas", "O resultado é a ficha da tela no canvas, com as instruções, a tabulação, a ordem de leitura e as especificações, lado a lado com o design.", real="095714"),
    cena("proximo", "E agora?", "Quando a ficha fica pronta, escolha: documentar outra tela, ou finalizar o handoff do projeto.", "m-09-modal-pos-handoff", destaques=["outra", "finalizar"]),
    cena("finalizar", "Finalize o projeto", "Quando todas as telas estiverem prontas, o botão Finalizar é liberado na lista de telas.", "m-03-lista-telas", destaque="finalizar"),
    cena("confirmar", "Confirme", "Confirme a finalização. Ela marca esta versão do handoff como concluída, e você pode continuar editando depois.", real="095815"),
    cena("final", "Pronto para o desenvolvimento", "Pronto. O time de desenvolvimento tem toda a acessibilidade documentada no próprio Figma, e o design original segue intocado.", real="095837"),
    fim("Obrigado!", "Você concluiu a trilha mobile do HAC. Boa documentação!", kicker="Tutorial HAC Mobile"),
])
print('ok: w1-w4, m1-m5')
