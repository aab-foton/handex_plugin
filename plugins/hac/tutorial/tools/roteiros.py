"""Roteiros dos vídeos 2 a 5 do tutorial (o 1 fica em video/roteiro-01.json)."""
import json, os
os.chdir(os.path.join(os.path.dirname(__file__), '..', 'video'))

def w(n, data):
    json.dump(data, open(f'roteiro-{n}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

def fim(prox, txt):
    return {"id": "fim", "kicker": "Próximo vídeo", "titulo": prox, "fala": txt}

r = json.load(open('roteiro-01.json', encoding='utf-8'))
r['cenas'][0]['kicker'] = 'Tutorial HAC · 1 de 5'
w('01', r)

w('02', {"titulo": "HAC | Ordem de Tabulação", "voz": "pf_dora", "cenas": [
    {"id": "abertura", "kicker": "Tutorial HAC · 2 de 5", "titulo": "Ordem de Tabulação",
     "fala": "Neste vídeo, você vai montar a ordem de tabulação: a sequência em que o teclado percorre os elementos interativos da tela."},
    {"id": "vazio", "print": "06-aba-tabulacao-vazia", "destaque": "criar", "titulo": "Comece pela aba",
     "fala": "Abra a tela e entre na aba Tabulação. Clique em Criar ordem de tabulação."},
    {"id": "instrucao", "print": "06b-instrucao-tabulacao", "titulo": "Leia as instruções",
     "fala": "Antes de começar, o HAC mostra as regras: marque só os elementos interativos, como botões, links e campos, seguindo a leitura da esquerda para a direita, de cima para baixo."},
    {"id": "captura", "real": "Screenshot 2026-09-30 094350.png", "titulo": "Marque no canvas",
     "fala": "No canvas, segure Shift e clique em cada elemento, na ordem certa. O HAC trabalha numa cópia da tela, então o design original não é alterado."},
    {"id": "revisao", "print": "06c-revisao-tabulacao", "destaque": "confirmar", "titulo": "Revise a sequência",
     "fala": "Revise a lista. Arraste para reordenar, remova o que sobrou e confirme em Criar ordem de tabulação."},
    {"id": "tamanho", "print": "05-aba-tabulacao", "destaqueManual": {"x": 14, "y": 208, "w": 236, "h": 36}, "titulo": "Tamanho do selo",
     "fala": "Escolha o tamanho do selo numerado: pequeno ou grande, conforme a escala da tela. Trocar depois atualiza os selos já aplicados."},
    {"id": "simular", "print": "05-aba-tabulacao", "destaqueManual": {"x": 15, "y": 428, "w": 300, "h": 36}, "titulo": "Ouça a ordem",
     "fala": "Use Simular leitura para ouvir a sequência em voz alta e conferir se ela faz sentido."},
    {"id": "preencher", "print": "05-aba-tabulacao", "destaqueManual": {"x": 15, "y": 508, "w": 450, "h": 38}, "titulo": "Leve para o handoff",
     "fala": "Quando estiver tudo certo, clique em Preencher Tabulação para levar a ordem ao handoff da tela."},
    fim("Leitor de Tela", "No próximo vídeo: as especificações para o leitor de tela."),
]})

w('03', {"titulo": "HAC | Leitor de Tela", "voz": "pf_dora", "cenas": [
    {"id": "abertura", "kicker": "Tutorial HAC · 3 de 5", "titulo": "Leitor de Tela",
     "fala": "Agora, as especificações para o leitor de tela: o que cada elemento anuncia para quem não enxerga a tela."},
    {"id": "instrucao", "print": "11-instrucao-leitor", "titulo": "Entenda a tarefa",
     "fala": "Na aba Leitor de Tela, as instruções explicam o objetivo: garantir que o conteúdo seja compreendido e implementado exatamente como projetado."},
    {"id": "nova", "print": "07-aba-leitor", "destaque": "novaSpec", "titulo": "Crie uma spec",
     "fala": "Selecione o elemento no canvas e clique em Nova spec."},
    {"id": "categoria", "print": "12-nova-spec-categoria", "titulo": "Escolha a categoria",
     "fala": "Escolha a categoria: Elementos e Imagens, Nível de Título, Estrutura da Página ou Elemento Decorativo."},
    {"id": "elemento", "print": "13-form-elemento", "destaqueManual": {"x": 82, "y": 266, "w": 316, "h": 36}, "titulo": "Elementos e Imagens",
     "fala": "Para botões, links e imagens, o HAC já reconhece o componente do design system e preenche o formulário. Você só confere e ajusta."},
    {"id": "titulo", "print": "14-form-titulo", "titulo": "Nível de Título",
     "fala": "Para títulos, indique o nível, de H1 a H6. O H1 é o título principal, único na página."},
    {"id": "decorativo", "print": "15-form-decorativo", "titulo": "Elemento Decorativo",
     "fala": "Ilustrações e ícones sem função são marcados como decorativos, e o leitor de tela os ignora."},
    {"id": "canvas", "real": "Screenshot 2026-09-30 095224.png", "titulo": "No canvas",
     "fala": "Cada spec aparece no canvas, ligada ao elemento, com o card que o time de desenvolvimento vai consultar."},
    {"id": "lista", "print": "07-aba-leitor", "titulo": "Tudo organizado",
     "fala": "No plugin, as specs ficam agrupadas por categoria. Dá para localizar, editar ou excluir cada uma."},
    {"id": "ajuda", "print": "16-categorias-ajuda", "titulo": "Na dúvida, consulte",
     "fala": "Se tiver dúvida sobre qual categoria usar, abra o guia Entendendo as categorias, no botão de ajuda."},
    fim("Ordem de Leitura (mobile)", "No próximo vídeo: a ordem de leitura por gesto, exclusiva do mobile."),
]})

w('04', {"titulo": "HAC | Ordem de Leitura", "voz": "pf_dora", "cenas": [
    {"id": "abertura", "kicker": "Tutorial HAC · 4 de 5", "titulo": "Ordem de Leitura",
     "fala": "No mobile, quem usa leitor de tela navega deslizando o dedo. A ordem de leitura documenta esse caminho."},
    {"id": "lista", "print": "20-mobile-lista", "titulo": "Só no mobile",
     "fala": "Em projetos Super DSC Mobile, cada tela ganha uma etapa a mais: a Ordem de Leitura."},
    {"id": "aba", "print": "21-mobile-abas-swipe", "destaques": ["aba", "criar"], "titulo": "Abra a aba Swipe",
     "fala": "Abra a aba Swipe e clique em Criar ordem de leitura."},
    {"id": "instrucao", "real": "Screenshot 2026-09-30 094757.png", "titulo": "Leia as instruções",
     "fala": "Diferente da tabulação, aqui entram todos os elementos da tela, inclusive textos, na ordem em que o gesto deve passar por eles."},
    {"id": "captura", "real": "Screenshot 2026-09-30 094913.png", "titulo": "Marque os pontos",
     "fala": "Segure Shift e clique em cada ponto no canvas. Se a tabulação já estiver pronta, você também pode reaproveitá-la como ponto de partida."},
    {"id": "revisao", "real": "Screenshot 2026-09-30 094934.png", "titulo": "Revise a trilha",
     "fala": "Revise os pontos na lista, reordene se precisar e confirme."},
    {"id": "trilha", "real": "Screenshot 2026-09-30 094949.png", "titulo": "A trilha no canvas",
     "fala": "O HAC desenha a trilha sobre a cópia da tela, mostrando o caminho exato do gesto."},
    fim("Gerar e finalizar o handoff", "No último vídeo: gerar e finalizar o handoff."),
]})

w('05', {"titulo": "HAC | Gerar e finalizar o handoff", "voz": "pf_dora", "cenas": [
    {"id": "abertura", "kicker": "Tutorial HAC · 5 de 5", "titulo": "Gerar e finalizar",
     "fala": "Com as etapas prontas, é hora de reunir tudo no handoff de acessibilidade."},
    {"id": "gerar", "print": "08-aba-resumo", "destaque": "gerar", "titulo": "Gere o handoff da tela",
     "fala": "Abra a aba Resumo. Ela mostra o que já foi inserido no handoff. Clique em Gerar Handoff."},
    {"id": "processando", "real": "Screenshot 2026-09-30 095638.png", "titulo": "Consolidando",
     "fala": "O HAC consolida cada etapa, uma de cada vez."},
    {"id": "ficha", "real": "Screenshot 2026-09-30 095714.png", "titulo": "A ficha no canvas",
     "fala": "O resultado é a ficha da tela no canvas, com as instruções, a ordem de tabulação e as especificações, lado a lado com o design."},
    {"id": "proximo", "print": "09-modal-pos-handoff", "destaques": ["outra", "finalizar"], "titulo": "E agora?",
     "fala": "Depois, escolha: documentar outra tela, ou finalizar o handoff do projeto."},
    {"id": "finalizar", "print": "03-lista-telas", "destaque": "finalizar", "titulo": "Finalize o projeto",
     "fala": "Quando todas as telas estiverem prontas, o botão Finalizar é liberado na lista de telas."},
    {"id": "confirmar", "real": "Screenshot 2026-09-30 095815.png", "titulo": "Confirme",
     "fala": "Confirme a finalização. Ela marca esta versão do handoff como concluída, e você pode continuar editando depois."},
    {"id": "final", "real": "Screenshot 2026-09-30 095837.png", "titulo": "Pronto para o desenvolvimento",
     "fala": "Pronto. O time de desenvolvimento tem toda a acessibilidade documentada no próprio Figma, e o design original segue intocado."},
    {"id": "fim", "kicker": "Tutorial HAC", "titulo": "Obrigado!",
     "fala": "Você concluiu o tutorial do HAC. Bom trabalho e boa documentação!"},
]})
print('ok')
