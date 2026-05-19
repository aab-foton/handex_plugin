# HANDEX v2.0.0 - Advanced Figma Plugin

[![GitHub Stars](https://img.shields.io/github/stars/aab-foton/handex?style=flat-square)](https://github.com/aab-foton/handex)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> 🎨 Um plugin poderoso para Figma que potencializa seus fluxos de design com IA, handoff inteligente, medições automáticas e anotações colaborativas.

## 📋 Sumário

- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Requisitos](#requisitos)
- [Instalação e Uso](#instalação-e-uso)
- [Desenvolvimento](#desenvolvimento)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Configuração](#configuração)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Tecnologias](#tecnologias)
- [Contribuindo](#contribuindo)

## 🎯 Visão Geral

HANDEX é um plugin para Figma desenvolvido para facilitar o handoff de designs e colaboração entre designers e desenvolvedores. Com integração de IA (Gemini), o plugin consegue:

- **Analisar designs** automaticamente
- **Gerar documentação técnica** de forma inteligente
- **Medir componentes** com precisão
- **Anotar designs** colaborativamente
- **Exportar especificações** em múltiplos formatos
- **Criar fichas técnicas** automáticas (BPMN)

O plugin possui uma **interface moderna, modular e totalmente responsiva**, permitindo uma transição suave entre diferentes fluxos de trabalho e visualização de código em tempo real.

### 🎨 Experiência do Usuário (UX)
- **Interface Responsiva de 3 Colunas**: Layout otimizado para produtividade.
- **Auto-Redimensionamento Dinâmico**: A janela do plugin se ajusta automaticamente ao conteúdo.
- **Zoom Proporcional da UI**: Escalonamento inteligente para diferentes tamanhos de tela.
- **Modo Escuro/Claro**: Suporte nativo a temas com alternância manual e automática.
- **Acessibilidade (WCAG)**: Interface amigável para tecnologias assistivas com labels ARIA e navegação semântica.

## ✨ Funcionalidades

### 🤖 IA Integrada (Gemini)
- Análise inteligente de componentes de design
- Geração automática de documentação técnica
- Extração de dados de design com IA
- Sugestões de melhorias de acessibilidade e performance

### 📋 Handoff de Design
- **Ficha Técnica Padronizada**: Documentação estruturada seguindo padrões BPMN.
- **Design Specs Inteligentes**: Especificações com restrições de layout (Fill/Hug) automáticas.
- **Exportação em múltiplos formatos**: Geração de pacotes ZIP completos com especificações técnicos.
- **Versionamento de exportações**: Histórico de alterações e controle de revisões.

### 📏 Medições e Especificações
- Medições automáticas de componentes
- Cálculo de espaçamentos (padding, margins, gaps)
- Extração de propriedades visuais (cores, tipografia, tamanhos)
- Geração de grid de especificações

### 📝 Anotações e Comentários
- Adicionar anotações às camadas
- Sistema de categorização de anotações
- Visualização integrada de comentários
- Exportação de anotações em documentos

### 🎯 Guias e Recursos
- Guias contextualizados no plugin
- Recursos de ajuda integrados
- Documentação de workflows
- Best practices de handoff

### 📊 Métricas e Visibilidade
- Dashboard de projeto
- Rastreamento de componentes
- Estatísticas de design
- Relatórios exportáveis

## 🏗️ Arquitetura

### Estrutura de Camadas

```
┌─────────────────────────────┐
│   UI React (SPA)            │  ← src/App.tsx, components/
│   (Tailwind + Lucide)       │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│   Plugin Code (JavaScript)   │  ← src/plugin/code.js
│   (Figma Plugin API)        │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│   Figma Document API        │
│   (Native Plugin Runtime)   │
└─────────────────────────────┘
```

### Módulos Principais

#### Frontend (`src/`)
- **App.tsx**: Aplicação principal com alternância entre preview e visualização de código
- **components/**: Componentes React reutilizáveis
  - `PluginPreview.tsx`: Renderização interativa do plugin
  - `CodeViewer.tsx`: Visualizador de código-fonte
- **hooks/**: Hooks customizados
  - `useVersions.ts`: Gerenciamento de versões de arquivo
- **utils/**: Utilitários
  - `downloadPlugin.ts`: Lógica de download do plugin

#### Plugin (`src/plugin/`)
- **code.js**: Script principal que executa no context Figma
  - Gerenciamento de comunicação UI ↔ Plugin
  - Operações no documento (criar frames, textos, etc.)
  - Tratamento de seleções e eventos
- **ui.html**: Interface HTML do plugin (gerada dinamicamente)
- **modules/**: Módulos especializados
  - `core.js`: Funcionalidades centrais
  - `design-data.js`: Extração de dados de design
  - `handoff.js`: Lógica de handoff
  - `measurement.js`: Sistema de medições
  - `messages.js`: Protocolo de mensagens
  - `specifications.js`: Geração de especificações
- **views/**: Templates HTML das diferentes seções
  - `home.html`: Tela inicial
  - `handoff.html`: Interface de handoff
  - `measurement.html`: Interface de medições
  - `specifications.html`: Visualizador de especificações
  - `guide.html`: Guia de uso
  - `modals.html`: Modais compartilhados
- **styles/**: Estilos do plugin
  - `plugin.css`: Folha de estilos principal

#### Configuração
- **manifest.json**: Configuração do plugin Figma
- **build.cjs**: Script de build que empacota a UI React em HTML
- **vite.config.ts**: Configuração do Vite para dev/build
- **tsconfig.json**: Configuração do TypeScript

## 🔧 Requisitos

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- Conta Figma com plugin instalado
- **Chave de API Gemini** (para funcionalidades de IA)

## 🚀 Instalação e Uso

### 1. Setup Inicial

```bash
# Clone o repositório
git clone https://github.com/aab-foton/handex.git
cd handex

# Instale as dependências
npm install

# Configure a chave de API
cp .env.example .env.local

# Adicione sua Gemini API Key em .env.local
GEMINI_API_KEY=sua_chave_aqui
```

### 2. Desenvolvimento Local

```bash
# Inicie o servidor dev em http://localhost:3000
npm run dev

# Em outro terminal, compile a UI do plugin
npm run bundle:ui
```

O servidor dev servirá:
- Interface de visualização do plugin (React)
- Endpoint para download do plugin compilado
- Hot-reload durante desenvolvimento

### 3. Instalação no Figma

1. Abra Figma
2. Vá para: **Menu → Plugins → Development → Import plugin from manifest...**
3. Selecione o arquivo `src/plugin/manifest.json`
4. O plugin estará disponível em: **Right Panel → Plugins → HANDEX**

### 4. Build para Produção

```bash
# Build da aplicação React e plugin
npm run build

# Resultado em ./dist/
```

## 💻 Desenvolvimento

### Scripts Disponíveis

```bash
npm run dev          # Inicia servidor de dev com Vite
npm run build        # Build de produção (SPA + plugin)
npm run preview      # Pré-visualiza build de produção
npm run lint         # Verifica tipos TypeScript
npm run clean        # Remove diretório dist/
npm run bundle:ui    # Compila a UI React em HTML estático
```

### Fluxo de Desenvolvimento

1. **Alterações na UI React**:
   - Edite arquivos em `src/` (exceto `src/plugin/`)
   - Hot-reload automático no `npm run dev`
   - Tipos TypeScript verificados continuamente

2. **Alterações no Plugin (code.js, modules/)**:
   - Edite `src/plugin/code.js` ou módulos em `src/plugin/modules/`
   - Execute `npm run bundle:ui` para recompilar a UI
   - Recarregue o plugin no Figma (Cmd+R ou Ctrl+R)

3. **Alterações de Estilos**:
   - Tailwind CSS é processado automaticamente (src/index.css)
   - Plugin CSS em `src/plugin/styles/plugin.css` é compilado manualmente

### Debugging

#### No Navegador (React App)
- Abra DevTools (F12)
- Console, Network, Elements tabs
- Local Storage para estado persistido em `handex-view-mode`

#### No Plugin (Figma)
1. Figma → Right Panel → Plugin → Menu (⋯) → View Code
2. Ou: **Ctrl+Shift+P** → "Run last plugin" → Inspect

## 📁 Estrutura do Projeto

```
handex/
├── src/
│   ├── App.tsx                    # Componente principal React
│   ├── main.tsx                   # Entry point React
│   ├── index.css                  # Estilos globais (Tailwind)
│   ├── components/
│   │   ├── CodeViewer.tsx         # Visualizador de código
│   │   └── PluginPreview.tsx      # Pré-visualização do plugin
│   ├── hooks/
│   │   └── useVersions.ts         # Hook para versionamento
│   ├── utils/
│   │   └── downloadPlugin.ts      # Download do plugin
│   └── plugin/
│       ├── manifest.json          # Configuração do plugin Figma
│       ├── code.js                # Script principal do plugin
│       ├── ui.html                # UI gerada (build output)
│       ├── build.cjs              # Script de build
│       ├── modules/               # Módulos especializados
│       │   ├── core.js
│       │   ├── design-data.js
│       │   ├── handoff.js
│       │   ├── measurement.js
│       │   ├── messages.js
│       │   └── specifications.js
│       ├── views/                 # Templates HTML
│       │   ├── home.html
│       │   ├── handoff.html
│       │   ├── measurement.html
│       │   ├── specifications.html
│       │   ├── guide.html
│       │   └── modals.html
│       └── styles/
│           └── plugin.css         # Estilos do plugin
├── backup/                        # Versão anterior do plugin
├── dist/                          # Build output (prod)
├── node_modules/
├── package.json
├── tsconfig.json
├── vite.config.ts                 # Configuração do bundler
├── index.html                     # HTML raiz da SPA
├── .env.example                   # Template de variáveis
├── .env.local                     # Variáveis locais (não commitado)
├── .gitignore
└── README.md
```

## ⚙️ Configuração

### Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```env
# API Gemini para funcionalidades de IA
GEMINI_API_KEY=sua_chave_aqui

# (Opcional) Configurações de ambiente
VITE_API_URL=http://localhost:3000
VITE_ENV=development
```

**Obtenha sua Gemini API Key**:
1. Acesse [Google AI Studio](https://aistudio.google.com/)
2. Clique em "Get API Key"
3. Crie uma chave nova e copie para `.env.local`

### Configuração do Plugin (manifest.json)

```json
{
  "name": "HANDEX v2.0.0",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"]
}
```

- **name**: Nome e versão do plugin
- **main**: Script de entrada (code.js)
- **ui**: Interface HTML
- **editorType**: Figma é o único editor suportado

## 📦 Tecnologias

### Frontend
- **React 19**: Framework UI
- **TypeScript 5.8**: Tipagem estática
- **Vite 6.2**: Bundler e dev server ultrarrápido
- **Tailwind CSS 4.1**: Utilitários de styling
- **Lucide React**: Biblioteca de ícones
- **Motion**: Animações suaves

### Backend / Plugin
- **Figma Plugin API 1.0**: Acesso ao documento Figma
- **Express 4.21**: Servidor de dev
- **JSZip 3.10**: Geração de arquivos ZIP

### Desenvolvimento
- **tsx**: Executor de TypeScript
- **Autoprefixer**: Prefixos CSS automáticos

## 🤝 Contribuindo

Para contribuir ao projeto:

1. **Crie uma feature branch**:
   ```bash
   git checkout -b feat/sua-funcionalidade
   ```

2. **Faça suas alterações**:
   - Mantenha o código limpo e bem tipado
   - Adicione comentários para lógica complexa
   - Teste mudanças localmente

3. **Commit com mensagens descritivas**:
   ```bash
   git commit -m "feat: descrição da funcionalidade"
   git commit -m "fix: descrição do bug corrigido"
   git commit -m "docs: atualização de documentação"
   ```

4. **Push e abra um Pull Request**:
   ```bash
   git push origin feat/sua-funcionalidade
   ```

### Guidelines

- Respeite o código existente
- Use TypeScript e tipos explícitos
- Siga a convenção de nomes do projeto
- Teste suas mudanças
- Documente APIs públicas

## 📄 Licença

Este projeto está licenciado sob a **Apache License 2.0** - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 📞 Suporte

- 📧 **Issues**: [GitHub Issues](https://github.com/aab-foton/handex/issues)
- 💬 **Discussões**: [GitHub Discussions](https://github.com/aab-foton/handex/discussions)
- 🐦 **Contato**: [@aab-foton](https://github.com/aab-foton)

---

<div align="center">

**Feito com ❤️ pela equipe AAB**

[⬆ Voltar ao topo](#handex-v200---advanced-figma-plugin)

</div>
