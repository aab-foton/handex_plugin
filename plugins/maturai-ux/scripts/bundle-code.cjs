// ============================================================
// scripts/bundle-code.cjs
// Bundla code.js com versão injetada via esbuild
// Uso: node scripts/bundle-code.cjs  |  npm run bundle:code
// ============================================================

const esbuild = require('esbuild');
const { version } = require('../package.json');

console.log(`📦 Bundling code.js → v${version}`);

esbuild.buildSync({
  entryPoints: ['src/plugin/code.js'],
  bundle: true,
  target: 'es2017',
  outfile: 'src/plugin/code.bundle.js',
  define: {
    __MATURAI_VERSION__: JSON.stringify(version),
  },
});

console.log(`✅ code.bundle.js gerado com version = "${version}"`);
