import JSZip from 'jszip';
import { PluginFiles } from '../hooks/useVersions';

export const downloadPluginZip = async (files: PluginFiles) => {
  const zip = new JSZip();

  // 1. Add Source Files
  zip.file('src/code.js', files['code.js']);
  zip.file('index.html', files['ui.html']);

  // 1.5 Add Pre-built Dist Files (so it works out of the box)
  zip.file('dist/code.js', files['code.js']);
  zip.file('dist/index.html', files['ui.html']);

  // 2. Modify and Add Manifest
  try {
    const manifest = JSON.parse(files['manifest.json']);
    manifest.main = 'dist/code.js';
    manifest.ui = 'dist/index.html';
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  } catch (e) {
    // fallback if parse fails
    zip.file('manifest.json', files['manifest.json']);
  }

  // 3. Add Vite & NPM Configs
  zip.file('package.json', JSON.stringify({
    name: "handex-figma-plugin",
    version: "1.0.0",
    scripts: {
      "dev": "vite",
      "build": "vite build && npm run build:main",
      "build:main": "esbuild src/code.js --bundle --outfile=dist/code.js"
    },
    devDependencies: {
      "@figma/plugin-typings": "^1.88.0",
      "vite": "^5.0.0",
      "vite-plugin-singlefile": "^2.0.0",
      "esbuild": "^0.20.0",
      "typescript": "^5.0.0"
    }
  }, null, 2));

  zip.file('vite.config.ts', `import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    outDir: 'dist',
    emptyOutDir: false,
  },
});`);

  zip.file('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: "es2015",
      lib: ["esnext", "dom"],
      strict: true,
      typeRoots: ["./node_modules/@types", "./node_modules/@figma"]
    }
  }, null, 2));

  zip.file('README.md', `# HANDEX Figma Plugin

Este é um projeto de plugin do Figma configurado com Vite.

## Como usar

1. Execute \`npm install\` para instalar as dependências.
2. Execute \`npm run build\` para compilar o plugin para a pasta \`dist\`.
3. No Figma, vá em **Plugins > Development > Import plugin from manifest...** e selecione o arquivo \`manifest.json\` na raiz desta pasta.

## Desenvolvimento

- Execute \`npm run dev\` para iniciar o servidor de desenvolvimento do Vite para a interface (UI).
- Qualquer alteração no \`src/code.js\` exigirá rodar \`npm run build:main\` para atualizar o backend do plugin.
`);

  // Generate and save
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'handex-figma-plugin.zip';
  a.click();
  URL.revokeObjectURL(url);
};
