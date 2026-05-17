import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2015',
    minify: false,
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/plugin/controller.ts',
      name: 'code',
      formats: ['iife'],
      fileName: () => 'code.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
