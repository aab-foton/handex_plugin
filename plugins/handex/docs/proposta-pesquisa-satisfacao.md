# Proposta: pesquisa de satisfação pós-handoff com dados de uso (guardada)

Status: **aprovada como direção, não implementada** (decisão do Augusto em 2026-10-06: "documente isso, vamos fazer no futuro").

## Objetivo

Medir o uso e o valor do Handex:
- quanto tempo o designer levou para concluir o handoff;
- quanto conteúdo o handoff tem (frames, especificações, medidas, fluxos etc.);
- se o designer ficou satisfeito, quanto tempo economizou e o que faltou.

## Caminhos descartados e por quê

| Caminho | Por que não |
|---|---|
| Envio automático para uma planilha (Google Apps Script) a cada Ficha | Coleta silenciosa de dados de projeto da CAIXA saindo do Figma, mesmo com hash. Em 2026-10-06 o próprio ambiente de desenvolvimento bloqueou a criação do módulo de envio automático. Exige liberar domínio novo no manifest. |
| Gravar os dados de uso no Git (GitHub/GitLab) | O plugin precisaria de um token de acesso embutido no código; qualquer pessoa com o plugin extrairia o token e ganharia acesso ao repositório. Git também não serve como base de respostas (um commit por envio, limite de requisições, nada tabulável). |

## Proposta escolhida: Google Forms com link pré-preenchido

1. Depois que a Ficha é gerada (ou atualizada), o plugin mostra um aviso discreto: **"Como foi este handoff? (2 min)"**, com **Responder** e **Agora não**, e a opção **não perguntar de novo neste projeto**.
2. **Responder** abre o formulário no navegador (`<a target="_blank">`, mesmo padrão dos links "Ver documentação completa"), já preenchido com os dados de uso via parâmetros `entry.NNN=` da URL.
3. O designer responde as perguntas de satisfação e envia. As respostas caem na planilha vinculada ao formulário.

Vantagens: o designer vê o que será enviado e decide enviar (consentimento explícito); o plugin não envia nada sozinho, não guarda segredo e não precisa de domínio novo no manifest.

## Dados de uso pré-preenchidos

Sensíveis viram código (SHA-256 com sal fixo, 16 caracteres) — dá para contar e agrupar sem identificar:

| Campo | Origem |
|---|---|
| Código do arquivo | hash de `figma.fileKey` |
| Código do projeto | hash de `step1.titulo` (normalizado) |
| Código do designer | hash de `figma.currentUser.id` (permissão `currentuser` já existe no manifest) |
| Evento | Ficha gerada · Ficha atualizada · Nova versão |
| Versão da Ficha, status do projeto, versão do plugin | `step1.versao`, `step1.status`, `PLUGIN_VERSION` |
| Tempo corrido | da 1ª ação no projeto até a Ficha (dias e horas) |
| Tempo ativo | soma dos períodos de uso do plugin no projeto, ignorando pausas > 10 min |
| Contagens | frames, frames de Novo Componente, itens a construir, componentes do DSC reutilizados, especificações, exceções, medidas, fluxos, jornadas, anotações no canvas, respostas do briefing, regras |

### Medição de tempo (a implementar junto)

- Guardar em `handoffData` (sem bump de schema): `_usage.firstActivityAt` (1ª ação: scan, especificação, medida, fluxo ou anotação), `_usage.activeMs` (acumulado) e `_usage.lastTickAt`.
- Tempo ativo: a cada interação no plugin, somar o intervalo desde `lastTickAt` se for ≤ 10 min; acima disso, considerar pausa e só atualizar `lastTickAt`. Gravar com o `saveToStorage` já existente (com debounce).
- Na geração da Ficha, registrar o par (tempo corrido, tempo ativo) daquela versão, para comparar 1ª versão × atualizações.
- Os campos `_usage.*` não entram no Markdown, na Ficha HTML nem no `_aiContext`.

## Perguntas sugeridas para o formulário

1. Facilidade de gerar o handoff com o Handex (1 a 5).
2. Quanto tempo você acha que economizou? (nada · até 30 min · 30 min a 2 h · mais de 2 h)
3. Qual ferramenta mais ajudou? (Anotações · Especificações · Medidas · Fluxos de Tela · Escanear Tokens)
4. O que faltou ou atrapalhou? (texto livre)
5. Você recomendaria o Handex a outro designer? (0 a 10)

Seção à parte, "Dados do handoff (preenchidos pelo plugin)", com um campo de texto curto por dado de uso.

## Pré-requisitos para retomar

1. Criar o formulário no Google Forms (conta da planilha de destino; o Augusto indicou a planilha `1tgFXXRo5I0w6-ZQfFjk-8t-qIDWHa4o_m5vL3x3NTPw`, que o conector desta sessão não conseguiu abrir).
2. Gerar um **link pré-preenchido** com valores fictícios em todos os campos de dados e passar ao desenvolvimento — dele saem os códigos `entry.NNN` de cada campo.
3. Confirmar com a governança do contrato CAIXA que o envio voluntário desses dados (com hash) para o Google é aceitável.

## Implementação prevista (quando retomar)

- Medição de tempo em `core.js` (contador de atividade) + campos `_usage` em `handoffData`.
- Aviso pós-Ficha nos pontos de sucesso já existentes (`handoff-complete` e `ficha-position-confirmed`, `messages.js`); preferência "não perguntar de novo" por projeto em `handoffData`.
- Montagem do link com `encodeURIComponent` e hash via `crypto.subtle` no iframe da UI.
- Documentação: `BUSINESS_RULES.md`, `docs/site/business-rules.html`, `CHANGELOG.md`, onboarding/guia se o aviso ganhar explicação.
