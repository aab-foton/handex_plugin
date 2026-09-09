// ============================================================
// HAC — fetch-instruction-frames.cjs
//
// Captura, via REST API do Figma, a imagem RENDERIZADA (PNG) de frames
// de INSTRUÇÃO didática que já existem prontos dentro do arquivo da lib
// "Design Acessível" (mobile, fileKey abaixo) — não são componentes
// publicados, são frames soltos com texto/previews de assets, mantidos
// por quem administra a lib. Usados como coluna de instrução fixa na
// Ficha de Handoff final (entrega futura, ver docs/tecnico.html seção
// 8e) — nunca recriados como texto/vetores pelo hac.
//
// Conceitualmente SEPARADO de fetch-design-refs.cjs: aquele busca
// METADADOS (keys/nomes/estilos) de libs de componentes inteiras; este
// busca a IMAGEM RENDERIZADA de node ids específicos de 1 único
// arquivo. Reaproveita só o padrão de autenticação (FIGMA_TOKEN).
//
// Por que só a REST API resolve isso (não a Plugin API/figma.*, que
// roda dentro do sandbox do plugin no Figma do designer): a Plugin API
// só importa COMPONENTES PUBLICADOS de libs vinculadas
// (importComponentByKeyAsync) — nunca abre outro arquivo Figma à
// distância, nunca captura um frame solto (não-componente) de outro
// arquivo. A REST API, rodando no CI por token, não tem essa restrição:
// GET /v1/images/:file_key?ids=... renderiza qualquer node do arquivo
// que o token tenha acesso de leitura, componente ou não.
//
// Onde as imagens vão parar: versionadas em
// refs/instruction-frames/*.png (Git, não Release Asset externo — o
// designer usa o plugin publicado como pacote privado da organização,
// nunca busca essas imagens ao vivo pela rede; decisão de arquitetura
// registrada nesta mesma sessão, ver docs/tecnico.html). build-skeleton.cjs
// lê esses PNGs e os embute como base64 em
// refs/_instruction-frames.generated.js, concatenado no ui.html final
// por build.cjs — mesmo tratamento que o skeleton de componentes já
// recebe (window.__HAC_REF_SKELETON__).
//
// GARANTIA DE PRODUTO (2026-09-08, reforçada a pedido do usuário):
// FIGMA_TOKEN é usado EXCLUSIVAMENTE aqui e em fetch-design-refs.cjs —
// scripts de CI/manutenção, nunca embarcados no plugin distribuído. O
// token NUNCA pode ser impeditivo para o uso do plugin: se este script
// nunca rodar, falhar, ou o token expirar, o pior resultado é
// `window.__HAC_INSTRUCTION_FRAMES__` ficar vazio ({}) — ver
// build-skeleton.cjs, que gera esse objeto best-effort a partir do que
// existir em refs/instruction-frames/ no momento do build, sem exigir
// nada. Qualquer código que consumir esse objeto (a montagem da Ficha de
// Handoff, ainda não implementada) DEVE tratar uma chave ausente como
// "sem imagem disponível" — nunca lançar erro nem bloquear a geração da
// Ficha por causa disso.
//
// Uso:
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-instruction-frames.cjs
//
// Requer Node 18+ (usa fetch nativo).
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REFS_DIR = __dirname;
const OUT_DIR = path.join(REFS_DIR, 'instruction-frames');
const MANIFEST_PATH = path.join(OUT_DIR, '_manifest.json');
const TOKEN = process.env.FIGMA_TOKEN;

if (!TOKEN) {
  console.error('⛔  FIGMA_TOKEN environment variable not set.');
  console.error('   Set it via: export FIGMA_TOKEN=xxx');
  process.exit(1);
}

const FIGMA_API = 'https://api.figma.com';

// fileKey da lib "Design Acessível" (mobile) — mesma lib cujas
// component keys já estão hardcoded em code.js (A11Y_AGRUPAMENTO_KEYS,
// A11Y_CONECTOR_LINHA_KEYS, A11Y_ITEM_NUMBER_KEYS). NÃO confundir com o
// fileKey "super-app" do _manifest.json (epCGtlKQxedDxQVlK3lNcN,
// componentes reais do produto) — são arquivos diferentes.
const DESIGN_ACESSIVEL_FILE_KEY = '3zdtN13YvPlCGPdXeL0Y2i';

// Lista de frames a capturar. `nodeId` é o id do node dentro do arquivo
// (formato "123:456", visível no Figma via botão direito → "Copy/Paste
// as → Copy link", extraindo o parâmetro `node-id` da URL — trocar '-'
// por ':' se necessário). Placeholders abaixo até serem confirmados.
//
// 'swipe' fica DE FORA desta lista de propósito: o frame de instrução do
// Swipe ainda não existe na lib (confirmado com o usuário, 2026-09-08) —
// uma proposta de conteúdo foi produzida à parte (ver
// content-copy/proposta-swipe, fora deste pipeline) para revisão humana
// e posterior réplica manual na lib real. Só depois de existir um node
// id real na lib é que esta entrada deve ser adicionada aqui.
const FRAMES = [
  {
    key: 'tabulacao',
    fileKey: DESIGN_ACESSIVEL_FILE_KEY,
    // TODO: node id real — confirmar com o usuário/dono da lib.
    nodeId: null,
  },
  {
    key: 'leitor',
    fileKey: DESIGN_ACESSIVEL_FILE_KEY,
    // TODO: node id real — confirmar com o usuário/dono da lib.
    nodeId: null,
  },
];

async function figmaGetJSON(pathName) {
  const url = FIGMA_API + pathName;
  const res = await fetch(url, { headers: { 'X-Figma-Token': TOKEN } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${pathName} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function downloadBinary(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download da imagem falhou → HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function loadExistingManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const byKey = {};
    for (const entry of (parsed.frames || [])) {
      if (entry && entry.key) byKey[entry.key] = entry;
    }
    return byKey;
  } catch (e) {
    console.warn('⚠  _manifest.json existente não pôde ser lido, tratando como vazio:', e && e.message);
    return {};
  }
}

// Captura BEST-EFFORT por frame (2026-09-08, pedido do usuário: "evitar
// que fique sem imagem" — o token/CI nunca pode ser impeditivo pro
// plugin, ver comentário de topo). Cada frame é tentado
// independentemente dos outros: se a captura de UM falhar (node id
// mudou, rede caiu, rate limit), os DEMAIS ainda são capturados/
// atualizados nesta mesma rodada — nunca "tudo ou nada". O frame que
// falhou preserva o PNG e a entrada de manifest da última captura
// bem-sucedida (nunca apaga nem sobrescreve com algo quebrado); se
// nunca houve uma captura bem-sucedida daquele frame, ele simplesmente
// continua ausente (build-skeleton.cjs já trata isso — gera o objeto
// sem essa chave, sem erro).
async function captureFrame(frame) {
  console.log(`→ Capturando frame "${frame.key}" (node ${frame.nodeId}) do arquivo ${frame.fileKey}...`);

  // GET /v1/images/:file_key devolve uma URL de S3 de curta duração
  // por node solicitado — nunca o binário direto. scale=2 pra
  // qualidade de tela retina; a REST API do Figma não devolve valor
  // resolvido nenhum aqui, só a URL temporária da imagem renderizada.
  const idsParam = encodeURIComponent(frame.nodeId);
  const imagesResp = await figmaGetJSON(`/v1/images/${frame.fileKey}?ids=${idsParam}&format=png&scale=2`);

  if (imagesResp.err) {
    throw new Error(`Figma API retornou erro: ${imagesResp.err}`);
  }
  const tempUrl = imagesResp.images && imagesResp.images[frame.nodeId];
  if (!tempUrl) {
    throw new Error(`Nenhuma URL de imagem devolvida (node id existe no arquivo?)`);
  }

  const bytes = await downloadBinary(tempUrl);
  const outPath = path.join(OUT_DIR, `${frame.key}.png`);
  fs.writeFileSync(outPath, bytes);

  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  console.log(`  ✅ ${frame.key}.png (${(bytes.length / 1024).toFixed(1)} KB)`);
  return {
    key: frame.key,
    fileKey: frame.fileKey,
    nodeId: frame.nodeId,
    fetchedAt: new Date().toISOString(),
    sha256,
    bytes: bytes.length,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pending = FRAMES.filter(f => !f.nodeId);
  if (pending.length > 0) {
    console.warn(`⚠  ${pending.length} frame(s) sem nodeId preenchido, pulando: ${pending.map(f => f.key).join(', ')}`);
    console.warn('   Preencha FRAMES[].nodeId neste arquivo com o id real do node na lib "Design Acessível".');
  }

  const active = FRAMES.filter(f => !!f.nodeId);
  const manifestByKey = loadExistingManifest();

  if (active.length === 0) {
    console.warn('⚠  Nenhum frame com nodeId preenchido — nada a capturar. Encerrando sem erro.');
    return;
  }

  let successCount = 0;
  let failureCount = 0;

  for (const frame of active) {
    try {
      const entry = await captureFrame(frame);
      manifestByKey[frame.key] = entry;
      successCount++;
    } catch (e) {
      failureCount++;
      const hadPrevious = !!manifestByKey[frame.key];
      console.error(`  ⚠  Falha ao capturar "${frame.key}": ${e && e.message}`);
      console.error(hadPrevious
        ? `     Mantendo a imagem da última captura bem-sucedida (${manifestByKey[frame.key].fetchedAt}) — nada foi sobrescrito.`
        : '     Nenhuma captura anterior bem-sucedida deste frame — ele continua ausente.');
      // Continua pro próximo frame — best-effort, nunca aborta o loop.
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ frames: Object.values(manifestByKey) }, null, 2) + '\n');
  console.log(`✅ ${successCount}/${active.length} frame(s) de instrução capturado(s) nesta rodada — refs/instruction-frames/`);
  if (failureCount > 0) {
    console.warn(`⚠  ${failureCount} frame(s) falharam nesta rodada (ver acima) — imagens anteriores preservadas, sem interromper o build.`);
  }
}

main().catch(e => {
  // Só chega aqui por erro de infraestrutura fora do loop por-frame
  // (ex.: mkdirSync falhando, disco cheio) — nunca por falha de captura
  // de 1 frame específico, que já é tratada dentro do loop acima sem
  // lançar. Mesmo assim, sai com código 1 só pra sinalizar no CI que
  // algo anormal aconteceu — não apaga nada em refs/instruction-frames/.
  console.error('⛔  fetch-instruction-frames.cjs falhou de forma inesperada:', e && e.message);
  process.exit(1);
});
