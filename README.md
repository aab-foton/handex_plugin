# Handex — Handoff Express · v4.1.6

Plugin Figma desenvolvido pela equipe de Design da CAIXA em parceria com a Fóton. Automatiza o processo de handoff de design, gerando fichas técnicas no canvas, escaneando tokens de UI, anotando specs e medidas, mapeando fluxos e auditando aderência ao Design System Corporativo (DSC).

---

## Sumário

- [O que o plugin faz](#o-que-o-plugin-faz)
- [Instalação no Figma](#instalação-no-figma)
- [Configuração de ambiente](#configuração-de-ambiente)
- [Scripts disponíveis](#scripts-disponíveis)
- [Fluxo de build](#fluxo-de-build)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Arquitetura da UI](#arquitetura-da-ui)
- [Guia por arquivo](#guia-por-arquivo)

---

## O que o plugin faz

| Ferramenta | Descrição |
|---|---|
| **Informações do Projeto** | Título, versão, status, objetivo, equipe e contexto de negócio (briefing, regras, links de documentação) |
| **Escanear Tokens** | Escaneia frames registrados e extrai propriedades por categoria: Componentes, Ícones, Tipografia. Frames-container e vetores são filtrados automaticamente |
| **Conformidade DSC** | Compara propriedades escaneadas contra tokens das bibliotecas do DSC. Designer declara conformidade por frame (Check Designs + Sem desvios) |
| **Anotar Specs** | Anota especificações técnicas sobre elementos do canvas com categoria, cor semântica, tag (letra), propriedades, link e exceções |
| **Anotar Medidas** | Insere anotações de dimensão (gap, padding, width, height) diretamente sobre os elementos selecionados no canvas |
| **Fluxos de Tela** | Mapeia conexões entre frames com tipos de fluxo (sequencial, decisão, paralelo, início/fim) |
| **Gerar Ficha** | Gera ficha técnica completa no canvas com governança, equipe, briefing, tokens escaneados, specs anotadas, medidas e fluxos |
| **Guia** | Onboarding passo a passo de cada ferramenta, acessível inline no plugin |

---

## Instalação no Figma

### Para testar (sem build)

1. Baixe a pasta `handex-plugin/` (disponível no Google Drive da equipe)
2. Abra o Figma
3. Menu → Plugins → Development → **Import plugin from manifest...**
4. Selecione `manifest.json` dentro da pasta `handex-plugin/`
5. O plugin fica disponível em: Plugins → Development → Handex — Handoff Express

> A pasta `handex-plugin/` contém os 3 arquivos já compilados (`manifest.json`, `code.bundle.js`, `ui.html`). Não é necessário instalar dependências nem rodar build.

### Para desenvolver

1. Clone o repositório
2. Siga as instruções em [Configuração de ambiente](#configuração-de-ambiente)
3. Após alterações, rode `npm run bundle:ui && npm run bundle:code`
4. Importe `src/plugin/manifest.json` no Figma

---

## Configuração de ambiente

```bash
# 1. Instale as dependências
npm install

# 2. Crie o .env com o token para buscar referências do DSC via API Figma
cp .env.example .env
# Preencha FIGMA_TOKEN no .env
```

---

## Scripts disponíveis

```bash
npm run bundle:ui        # Monta o ui.html completo (frontend do plugin)
npm run bundle:code      # Compila o code.bundle.js (backend do plugin)
npm run export:plugin    # Copia os 3 arquivos compilados para handex-plugin/
npm run refs:fetch       # Busca style/component keys das libs DSC via API Figma
npm run bundle:refs      # Agrega os {slug}.json em _skeleton.json
npm run refs:rebuild     # refs:fetch + bundle:refs em sequência
npm run refs:update      # refs:rebuild + bundle:ui + bundle:code em sequência
npm run version:patch    # Incrementa versão patch (4.x.x)
npm run version:minor    # Incrementa versão minor (4.x.0)
npm run version:major    # Incrementa versão major (x.0.0)
```

> Após qualquer alteração em `src/plugin/`, rode `bundle:ui` e/ou `bundle:code` antes de testar no Figma.
> Para distribuir uma nova versão: `npm run bundle:ui && npm run bundle:code && npm run export:plugin`

---

## Fluxo de build

```
1. npm run refs:fetch
   └─ Busca styles e component keys nas libs DSC via REST API do Figma
   └─ Requer FIGMA_TOKEN no .env
   └─ Gera: src/plugin/refs/{slug}.json para cada lib

2. npm run bundle:refs
   └─ Agrega todos os {slug}.json em um único skeleton compacto
   └─ Gera: src/plugin/refs/_skeleton.json (~900 KB)

3. npm run bundle:ui
   └─ Roda bundle:refs internamente
   └─ build.cjs agrega views HTML + módulos JS + CSS + skeleton + Lucide
   └─ Gera: src/plugin/ui.html (~1.5 MB — frontend completo e autossuficiente)

4. npm run bundle:code
   └─ esbuild compila code.js em bundle único
   └─ Injeta __HANDEX_VERSION__ com o valor de package.json
   └─ Gera: src/plugin/code.bundle.js (backend executado pelo Figma)

5. npm run export:plugin  (opcional — para distribuição)
   └─ Copia manifest.json + code.bundle.js + ui.html para handex-plugin/
```

**Os dois artefatos entregues ao Figma são `ui.html` e `code.bundle.js` — ambos gerados, nunca editados diretamente.**

---

## Estrutura do projeto

```
plugins/handex/
├── package.json               # Versão, scripts de build, dependências
├── README.md                  # Este arquivo
├── BUSINESS_RULES.md          # Regras de negócio, travas e jornadas
├── CHANGELOG.md               # Histórico de versões
├── .env.example               # Modelo de variáveis de ambiente
│
├── handex-plugin/             # Distribuição — apenas os 3 arquivos compilados
│   ├── manifest.json          # (gerado por export:plugin — não editar)
│   ├── code.bundle.js
│   └── ui.html
│
├── scripts/
│   └── bundle-code.cjs        # Script esbuild para gerar code.bundle.js
│
└── src/
    └── plugin/                # ← PLUGIN FIGMA (tudo que importa aqui)
        ├── manifest.json      # Configuração do plugin para o Figma
        ├── code.js            # Backend (FONTE — editar aqui)
        ├── code.bundle.js     # Backend compilado (GERADO — não editar)
        ├── ui.html            # Frontend completo (GERADO — não editar)
        ├── build.cjs          # Assembler do ui.html
        │
        ├── modules/           # Fragmentos JS do frontend
        │   ├── core.js            # Estado global, navegação, persistência, tema
        │   ├── messages.js        # Dispatcher único de window.onmessage
        │   ├── handoff.js         # Coleta de dados e geração da ficha no canvas
        │   ├── specifications.js  # Scan, render de specs, props e conformidade
        │   ├── audit.js           # Auditoria DSC na UI
        │   ├── measurement.js     # Medidas e anotações no canvas
        │   └── design-data.js     # Dados de design e Code Connect
        │
        ├── views/             # Fragmentos HTML do frontend
        │   ├── home.html          # Tela inicial — 6 cards de ferramentas
        │   ├── handoff.html       # Hub por frame (scan + medidas + specs + conformidade)
        │   ├── specifications.html # Anotar Specs
        │   ├── flows.html         # Fluxos de Tela
        │   ├── measurement.html   # Anotar Medidas
        │   ├── guide.html         # Guia de uso com accordions por ferramenta
        │   └── modals.html        # Todas as modais compartilhadas
        │
        ├── styles/
        │   ├── tailwind-input.css     # Configuração do Tailwind v3
        │   ├── tailwind-compiled.css  # CSS gerado (não editar)
        │   └── tailwind.config.cjs    # Tema e safelist do Tailwind
        │
        └── refs/              # Referências do Design System Corporativo
            ├── _manifest.json         # Lista curada das libs DSC (FONTE DE VERDADE)
            ├── _skeleton.json         # Bundle agregado de todas as libs (GERADO)
            ├── fundamentos-visuais.json
            ├── web-angular-react.json
            ├── super-gerenciador.json
            ├── super-app.json
            ├── design-acessivel.json
            ├── code-mappings.json     # DSC slug → caminho de import no código
            ├── build-skeleton.cjs     # Script que agrega os {slug}.json
            ├── fetch-design-refs.cjs  # Script que busca via REST API do Figma
            └── README.md              # Docs do pipeline de referências
```

---

## Arquitetura da UI

O frontend do plugin **não usa módulos ES nem imports**. Todos os arquivos em `modules/` são fragmentos JavaScript que o `build.cjs` concatena em um único `<script>` dentro do `ui.html`. Eles compartilham o mesmo escopo global em runtime.

```
build.cjs (assembler)
  ├── lê views/*.html          → insere como HTML
  ├── lê modules/*.js          → concatena em <script>
  ├── lê styles/tailwind-compiled.css → inline em <style>
  ├── baixa Lucide CDN         → inline em <script>
  └── lê refs/_skeleton.json   → embarca como window.__HANDEX_REF_SKELETON__
      └── gera: ui.html (~1.5 MB, autossuficiente)
```

A comunicação entre backend (`code.js`) e frontend (`ui.html`) é feita exclusivamente via:
- `parent.postMessage({ pluginMessage: {...} }, '*')` — UI → backend
- `figma.ui.postMessage({...})` — backend → UI
- `window.onmessage` em `messages.js` — roteador de todas as mensagens recebidas

---

## Guia por arquivo

### `src/plugin/manifest.json`
Configuração obrigatória do Figma. Define `main` (backend), `ui` (frontend), `editorType` e `permissions`. Inclui `"currentuser"` para identificar o designer logado automaticamente.

### `src/plugin/code.js`
Backend do plugin. Roda no contexto privilegiado do Figma com acesso total ao canvas. Principais handlers: `scan-frame`, `create-handoff`, `apply-measurements`, `create-spec`, `create-flow`, `focus-node`. **Não é distribuído diretamente — gera `code.bundle.js`.**

### `src/plugin/build.cjs`
Assembler do `ui.html`. Lê todos os fragmentos, embarca o skeleton e gera o HTML único autossuficiente. Configurar cores do tema Tailwind aqui.

### `src/plugin/modules/core.js`
Módulo central. Inicializa `handoffData` (estado global, schema v2), expõe todas as funções públicas ao `window`, gerencia navegação entre views, persistência via `figma.clientStorage`, dark/light mode, toasts, accordions e validação do formulário de projeto.

### `src/plugin/modules/messages.js`
Único `window.onmessage` do plugin. Todo roteamento de mensagens do backend passa por aqui.

### `src/plugin/modules/handoff.js`
Coleta dados dos formulários (`collectHandoffData`) e dispara `createHandoffOnCanvas()` para gerar a ficha técnica no canvas com governança, equipe, tokens, specs, medidas e fluxos.

### `src/plugin/modules/specifications.js`
Escaneamento e exibição de tokens. `scanFrame()` envia a seleção ao backend. `renderSpecs()` exibe resultados por categoria. `renderFrameCard()` monta o accordion por frame com todas as ferramentas scopadas.

### `src/plugin/modules/audit.js` *(UI)*
Gerencia o toggle de conformidade DSC por frame: `checkDone`, `semDesvios`, snapshot de ressalvas e exibição do alerta de itens para revisar.

### `src/plugin/refs/_manifest.json`
**Fonte de verdade das bibliotecas DSC.** Lista cada lib com `slug`, `name`, `fileKey` e contagens. Toda adição ou remoção de biblioteca começa aqui.

### `src/plugin/refs/_skeleton.json`
Bundle agregado gerado por `build-skeleton.cjs`. Contém metadados, style keys e component keys de todas as libs. Embarcado em `ui.html` como `window.__HANDEX_REF_SKELETON__`. **Os valores reais (hex, fontSize, etc.) são resolvidos em runtime pela Plugin API do Figma.**

---

> Para dúvidas sobre o pipeline de referências DSC, veja `src/plugin/refs/README.md`.
> Para regras de negócio detalhadas e travas do sistema, veja `BUSINESS_RULES.md`.
> Para histórico de versões, veja `CHANGELOG.md`.

---

Handex — Handoff Express · v4.1.6 · Desenvolvido por Fóton para CAIXA Design
