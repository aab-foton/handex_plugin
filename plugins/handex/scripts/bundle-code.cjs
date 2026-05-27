// ============================================================
// scripts/bundle-code.cjs
// Wrapper de build do code.js que injeta a versão do package.json
// via esbuild API para que code.js nunca precise ser editado
// manualmente quando a versão mudar.
//
// Uso: node scripts/bundle-code.cjs
// Ou via: npm run bundle:code
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
    __HANDEX_VERSION__: JSON.stringify(version),
  },
});

console.log(`✅ code.bundle.js gerado com version = "${version}"`);
