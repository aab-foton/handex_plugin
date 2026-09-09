# Tarefa para o agente Gemini — preencher conteúdo da Ficha de Handoff

## Escopo — LEIA ANTES DE QUALQUER AÇÃO

**Você só tem permissão para editar UM arquivo neste repositório:**

```
src/plugin/refs/ficha-instruction-content.json
```

**Não edite, crie, apague ou renomeie nenhum outro arquivo ou pasta** —
isso inclui (mas não se limita a): `code.js`, `code.bundle.js`,
`ui.html`, qualquer arquivo em `src/plugin/modules/`,
`src/plugin/views/`, `src/plugin/styles/`, `docs/`, `.github/`, este
próprio `GEMINI-TASK.md`, ou qualquer outro `.json` dentro de
`src/plugin/refs/` (em especial `design-acessivel-content.json` —
mesmo tipo de arquivo, mas conteúdo de OUTRA fonte, não confunda os
dois).

Se você achar que alguma outra mudança seria "útil" (corrigir um typo,
melhorar um comentário, reorganizar algo) — **não faça**. Só a tarefa
abaixo, só no arquivo indicado.

Não rode nenhum comando de build, bundle, lint, commit ou push. Não
use `git add`/`git commit`/`git push`. A tarefa termina quando o JSON
estiver preenchido e salvo — nada além disso.

## A tarefa

Abra `src/plugin/refs/ficha-instruction-content.json` — ele já tem a
estrutura completa e instruções detalhadas no campo `_meta.howToFill`.
Resumo:

1. Acesse, via MCP do Figma, esta página:
   `https://www.figma.com/design/HhriLSpKnCB2dHhyiU16iB/-HAC--Handoff-Super-DSC-Mobile-e-Web?node-id=13-517`
   — arquivo `[HAC] Handoff Super DSC Mobile e Web`, frame de referência
   `Ordem de Tabulação e Leitor de Telas [Super App] V1`.
2. Localize os 3 blocos de instrução visíveis nesse frame (ou em frames
   irmãos próximos, na mesma página): **Ordem de Tabulação**, **Swipe**,
   **Especificações para Leitor de Tela**.
3. Para cada um, transcreva o texto REAL e VISÍVEL (nunca resuma,
   parafraseie ou invente) nos campos correspondentes do JSON: título,
   subtítulo de instruções, parágrafo explicativo, subtítulo dos passos,
   lista de passos numerados (sem o número, só o texto), e a seção de
   legendas/assets (rótulo + descrição de cada selo/marcador mostrado).
4. Troque `_meta.status` de `"PENDENTE"` para `"preenchido"` só depois
   que TODOS os campos `"PREENCHER"` tiverem sido substituídos pelo
   texto real — se algum campo genuinamente não existir num dos 3
   blocos, deixe como string/array vazia (`""`/`[]`), nunca deixe
   `"PREENCHER"` órfão nem invente conteúdo pra preencher a lacuna.
5. Preencha também `_meta.extractedBy` (ex.: `"Gemini via MCP Figma"`)
   e `_meta.extractedAt` (data de hoje, formato `AAAA-MM-DD`).

Mantenha a estrutura de chaves do JSON exatamente como está — não
adicione, remova nem renomeie chaves. Só preencha valores.

Quando terminar, não faça mais nada — não precisa avisar ninguém nem
rodar nenhum comando. O dono do repositório vai revisar o resultado.
