import JSZip from 'jszip';

const README_CONTENT = `# UX Repo — Como usar este pacote com IA

Este pacote foi gerado pelo **UX Repo**, um plugin Figma da CAIXA para criação de repositórios de conocimento de UX. Os arquivos aqui contidos foram estruturados para serem usados como base de contexto (RAG) em motores de IA.

---

## Estrutura do pacote

| Arquivo / Pasta | Descrição |
|---|---|
| \`notas_do_projeto.txt\` | Dump completo de contexto semântico do projeto |
| \`dados_figma.json\` | Todos os metadados brutos extraídos do Figma (tokens, instâncias, anotações) |
| \`Telas/\` | Imagens das telas exportadas |
| \`Contexto/\` | Arquivos \`.md\` individuais por tela, prontos para indexação |
| \`Anexos/\` | Documentos adicionais enviados pelo time |

---

## Como usar com o Microsoft Copilot

1. Acesse o **Microsoft Copilot** (https://copilot.microsoft.com) ou o Copilot integrado no Teams/Word.
2. Inicie uma nova conversa e clique no ícone de **anexar arquivo**.
3. Suba o arquivo \`notas_do_projeto.txt\` e/ou os arquivos da pasta \`Contexto/\`.
4. Faça sua pergunta normalmente. O Copilot usará os arquivos como fonte de contexto para responder.

> 💡 **Dica:** Suba os arquivos \`.md\` individuais de cada tela para perguntas específicas sobre aquela interface.

---

## Como usar com o Google Gemini

1. Acesse o **Google Gemini** (https://gemini.google.com).
2. Clique no ícone de **clipe / upload** na caixa de mensagem.
3. Suba o arquivo \`notas_do_projeto.txt\` ou os \`.md\` da pasta \`Contexto/\`.
4. Faça sua pergunta. O Gemini lerá o arquivo como parte da conversa.

> 💡 **Dica:** Em perguntas amplas sobre o projeto, prefira o \`notas_do_projeto.txt\`. Para perguntas específicas de uma tela, use o \`.md\` individual daquela tela.

---

## Exemplos de prompts úteis

- *"Quais bibliotecas de design system esse projeto utiliza?"*
- *"Que tipo de componentes aparecem mais nesse projeto?"*
- *"Quais são as anotações e decisões de design registradas?"*
- *"Quais tokens de cor estão definidos neste projeto?"*
- *"Descreva o fluxo da tela [nome da tela]."*

---

Gerado automaticamente pelo **UX Repo — Centro de Inteligência de UX da CAIXA**.
`;

function generateFrameMarkdown(frame: any, pageName: string): string {
  let md = `# ${frame.name}\n\n`;
  md += `**Página:** ${pageName}  \n`;
  md += `**Dimensões:** ${frame.width}px × ${frame.height}px  \n\n`;

  if (frame.texts && frame.texts.length > 0) {
    md += `## Conteúdo Textual\n\n`;
    frame.texts.forEach((t: string) => {
      md += `- ${t}\n`;
    });
    md += '\n';
  }

  if (frame.annotations && frame.annotations.length > 0) {
    md += `## Anotações e Comentários\n\n`;
    frame.annotations.forEach((ann: any) => {
      const type = ann.nodeType === 'STICKY' ? 'Sticky Note' : `Anotação (${ann.label || 'sem título'})`;
      md += `**${type}:** ${ann.text.replace(/\n/g, ' ')}\n\n`;
    });
  }

  if (frame.specs) {
    if (frame.specs.colors && frame.specs.colors.length > 0) {
      md += `## Cores Utilizadas\n\n`;
      md += frame.specs.colors.join(', ') + '\n\n';
    }
    if (frame.specs.typography && frame.specs.typography.length > 0) {
      md += `## Tipografia\n\n`;
      frame.specs.typography.forEach((t: string) => md += `- ${t}\n`);
      md += '\n';
    }
  }

  return md;
}

export const exportToZip = async (
  projectData: any,
  exportData: any[],
  notes: string,
  files: File[],
  repoType: string,
  choices: { screens: boolean; tokens: boolean; context: boolean; specs: boolean } = { screens: true, tokens: true, context: true, specs: true }
) => {
  const zip = new JSZip();

  // Screen images
  if (choices.screens) {
    const telasFolder = zip.folder("Telas");
    exportData.forEach(file => {
      telasFolder?.file(file.name, file.bytes, { base64: false });
    });
  }

  // Main context dump
  if (choices.context && notes) {
    zip.file("notas_do_projeto.txt", notes);
  }

  // Raw Figma JSON (Design Tokens)
  if (choices.tokens) {
    zip.file("dados_figma.json", JSON.stringify(projectData, null, 2));
  }

  // Individual .md files per frame (Specifications/Context)
  if (choices.specs || choices.context) {
    const contextoFolder = zip.folder("Contexto");
    if (projectData.pages) {
      projectData.pages.forEach((page: any) => {
        page.frames.forEach((frame: any) => {
          const safeName = frame.name.replace(/[\\/:*?"<>|]/g, '_');
          const md = generateFrameMarkdown(frame, page.name);
          contextoFolder?.file(`${safeName}.md`, md);
        });
      });
    }
  }

  // User-attached files
  if (files && files.length > 0) {
    const anexosFolder = zip.folder("Anexos");
    files.forEach(file => {
      anexosFolder?.file(file.name, file);
    });
  }

  // README
  zip.file("README.md", README_CONTENT);

  const content = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectData.title}_export.zip`;
  a.click();
  URL.revokeObjectURL(url);

  if (repoType === 'gdrive') {
    window.open('https://drive.google.com/drive/my-drive', '_blank');
  } else if (repoType === 'sharepoint') {
    window.open('https://www.office.com/launch/sharepoint', '_blank');
  }
};
