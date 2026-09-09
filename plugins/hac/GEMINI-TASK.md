# Tarefas para o agente Gemini — hac

Este arquivo cobre 2 tarefas independentes. **Tarefa 1 já foi concluída**
(deixada aqui como referência) — se você chegou aqui de novo, provavelmente
é para a Tarefa 2.

## Escopo — LEIA ANTES DE QUALQUER AÇÃO

**Você só tem permissão para editar os arquivos explicitamente listados
em CADA tarefa abaixo** — nunca mais que isso, mesmo que pareça útil.

**Não edite, crie, apague ou renomeie nenhum outro arquivo ou pasta** —
isso inclui (mas não se limita a): `code.js`, `code.bundle.js`,
`ui.html`, qualquer arquivo em `src/plugin/modules/`,
`src/plugin/views/`, `src/plugin/styles/`, `docs/`, `.github/`, este
próprio `GEMINI-TASK.md`, ou qualquer `.json` dentro de
`src/plugin/refs/` que não seja o alvo explícito da tarefa que você
está executando (em especial nunca edite os 4 arquivos
`dsc-component-a11y-mapping*.json` — são a FONTE de dados da Tarefa 2,
não o destino).

Se você achar que alguma outra mudança seria "útil" (corrigir um typo,
melhorar um comentário, reorganizar algo) — **não faça**. Só a tarefa
pedida, só no arquivo indicado.

Não rode nenhum comando de build, bundle, lint, commit ou push. Não
use `git add`/`git commit`/`git push`. Cada tarefa termina quando o
JSON alvo estiver preenchido e salvo — nada além disso.

## Tarefa 1 (CONCLUÍDA) — conteúdo da Ficha de Handoff

Arquivo editado: `src/plugin/refs/ficha-instruction-content.json`.
Já preenchido (`_meta.status: "preenchido-parcial"` — bloco `swipe`
fica vazio de propósito, o frame de instrução dele ainda não existe na
lib, confirmado pelo dono do produto). Nada a fazer aqui.

## Tarefa 2 — revisão estrutural de componentes de match incerto

**Arquivo que você pode editar:**

```
src/plugin/refs/dsc-structural-review.json
```

Esse arquivo já vem preenchido com 87 candidatos reais (extraídos
automaticamente dos 4 arquivos `dsc-component-a11y-mapping*.json` —
componentes que hoje têm match de categoria de acessibilidade com
confiança BAIXA, resolvido só por nome/substring, não por estrutura
real). Objetivo: usar o MCP do Figma para abrir a árvore real de cada
componente (via `fileKey` + `sampleComponentKey`, já incluídos em cada
entrada) e preencher 3 campos por entrada: `hasComposedIcon`,
`hasVisibleLabelText`, `structuralNote`. Instruções completas e
detalhadas já estão em `_meta.howToFill` dentro do próprio arquivo —
leia esse campo antes de começar.

Não mude `currentMatch`/`currentConfidence`/`currentReason` (são o
estado ATUAL, só referência) nem adicione/remova entradas ou chaves —
só preencha os 3 campos marcados `"PREENCHER"` em cada uma das 87
entradas. Troque `_meta.status` para `"preenchido"` só quando nenhuma
entrada tiver mais `"PREENCHER"` sobrando.

Isso vai alimentar uma melhoria futura do matching DSC→categoria de
acessibilidade (`build-dsc-a11y-mapping.cjs`), hoje baseado só em nome.

Quando terminar qualquer uma das tarefas, não faça mais nada — não
precisa avisar ninguém nem rodar nenhum comando. O dono do repositório
vai revisar o resultado.
