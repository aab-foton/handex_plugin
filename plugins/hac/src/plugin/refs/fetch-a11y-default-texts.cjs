// ============================================================
// src/plugin/refs/fetch-a11y-default-texts.cjs (2026-10-07)
//
// Extrai, da lib "Design Acessível | Super App" (fileKey da lib nova, o mesmo
// de design-acessivel-mobile-properties.json), os TEXTOS PADRÃO que cada
// componente traz dentro do card "Elementos e imagens" — por plataforma
// (mobile/web), por componente e por opção de "Leitor de Tela". Ex.: no
// Top App Bar mobile, "Observações" já vem com "Seguir orientações de nome
// acessível do Button...".
//
// Por que existe (pedido do usuário, 2026-10-07): o formulário do plugin
// precisa replicar o componente da lib exatamente — ao ligar "Observações",
// o campo abre com o texto do componente, e esse texto vai para o card.
// fetch-component-properties.cjs captura toggles/variantes/defaults booleanos,
// mas NÃO os textos das sub-instâncias — por isso este script, focado, que
// parte dos ids que aquele scan já levantou (não refaz descoberta).
//
// Saída: refs/design-acessivel-default-texts.json
//   { _meta, mobile: { [componente]: { [leitor|'']: { [campo]: texto } } }, web: {...} }
// Consumo: build-a11y-constants.cjs → A11Y_{MOBILE,WEB}_DEFAULT_TEXTS_GENERATED.
//
// Rodar:  FIGMA_TOKEN=... node src/plugin/refs/fetch-a11y-default-texts.cjs
//         (token lido de process.env; nunca pedir ao usuário)
// ============================================================
const fs = require('fs');
const path = require('path');
const https = require('https');

const REFS = __dirname;
const SCAN = path.join(REFS, 'design-acessivel-mobile-properties.json');
const OUT = path.join(REFS, 'design-acessivel-default-texts.json');
const SETS = { mobile: '10206:2177', web: '10658:3627' };
const EST_SETS = { marco: '10740:4680', estrutura: '10745:5011' }; // ".[hac web base] Marco de navegação" / "Estrutura da Página" // ".[hac mob base]/.[hac web base] Elementos e imagens" — ver build-a11y-constants.cjs
const TOKEN = process.env.FIGMA_TOKEN;
if (!TOKEN) { console.error('FIGMA_TOKEN ausente no ambiente — abortando (nada foi alterado).'); process.exit(1); }

const scan = JSON.parse(fs.readFileSync(SCAN, 'utf8'));
const fileKey = scan._meta && scan._meta.fileKey;
const comps = Array.isArray(scan.components) ? scan.components : Object.values(scan.components || {});

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'X-Figma-Token': TOKEN } }, res => {
      // Bytes juntos e decodificados UMA vez: concatenar pedaços como texto
      // partia caracteres acentuados na fronteira ("Acess��vel", 2026-10-07).
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => {
        const d = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 200)}`));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Texto de uma sub-instância de campo: a property TEXT "Texto" (override do
// componente) ou, sem ela, o TEXT "Text" filho.
function fieldText(inst) {
  const props = inst.componentProperties || {};
  const k = Object.keys(props).find(x => /^texto$/i.test(x.split('#')[0]));
  if (k && props[k] && typeof props[k].value === 'string') return props[k].value;
  const t = (inst.children || []).find(c => c.type === 'TEXT' && /^text$/i.test(c.name));
  return t ? t.characters : null;
}

(async () => {
  const out = { _meta: { description: 'GERADO por fetch-a11y-default-texts.cjs — não editar à mão. Textos padrão por plataforma > componente > opção de Leitor de Tela ("" quando o componente não tem opções) > campo.', fileKey, generatedAt: new Date().toISOString() } };
  for (const [platform, setId] of Object.entries(SETS)) {
    const set = comps.find(c => c.nodeId === setId);
    if (!set) { console.warn(`⚠ conjunto ${platform} (${setId}) não está no scan — pulando`); continue; }
    const jobs = []; // { componente, leitor, id }
    for (const v of (set.perVariantProperties || [])) {
      const m = /Componente=([^,]+)/.exec(v.variantName || '');
      if (!m) continue;
      const componente = m[1].trim();
      const sr = v.screenReaderVariants && v.screenReaderVariants.variants;
      if (sr && sr.length) {
        for (const s of sr) jobs.push({ componente, leitor: (/=(.+)$/.exec(s.variantName) || [])[1] || '', id: s.variantId });
      } else if (v.nestedComponentId) {
        jobs.push({ componente, leitor: '', id: v.nestedComponentId });
      }
    }
    const res = {};
    for (let i = 0; i < jobs.length; i += 40) {
      const batch = jobs.slice(i, i + 40);
      const ids = [...new Set(batch.map(j => j.id))].join(',');
      let data = null;
      for (let attempt = 0; attempt < 3 && !data; attempt++) {
        try { data = await get(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}&depth=2`); }
        catch (e) { console.warn(`  tentativa ${attempt + 1} falhou: ${e.message}`); await sleep(2000 * (attempt + 1)); }
      }
      if (!data) throw new Error(`lote ${i} falhou 3x — abortando sem gravar`);
      for (const j of batch) {
        const node = data.nodes[j.id] && data.nodes[j.id].document;
        if (!node) continue;
        const fields = {};
        for (const c of (node.children || [])) {
          if (c.type !== 'INSTANCE') continue;
          const txt = fieldText(c);
          if (txt != null) fields[c.name] = txt;
        }
        (res[j.componente] = res[j.componente] || {})[j.leitor] = fields;
      }
      process.stdout.write(`  ${platform}: ${Math.min(i + 40, jobs.length)}/${jobs.length}\r`);
      await sleep(400);
    }
    out[platform] = res;
    console.log(`\n✅ ${platform}: ${Object.keys(res).length} componentes, ${jobs.length} variantes lidas`);
  }

  // Estrutura da Página WEB (2026-10-07): textos fixos de cada Tipo do
  // "Marco de navegação" e do "Idioma" (a lib passou a ter Idioma como
  // componente único, sem Página/Parte, e Marco ganhou Section/Form).
  const fieldsDeep = (node, depth = 0, acc = {}) => {
    for (const c of (node.children || [])) {
      if (c.type === 'INSTANCE') { const t = fieldText(c); if (t != null && acc[c.name] == null) acc[c.name] = t; }
      if (depth < 3) fieldsDeep(c, depth + 1, acc);
    }
    return acc;
  };
  try {
    const est = { marco: {}, idioma: null };
    const d1 = await get(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(EST_SETS.marco + ',' + EST_SETS.estrutura)}&depth=4`);
    const marcoSet = d1.nodes[EST_SETS.marco] && d1.nodes[EST_SETS.marco].document;
    for (const v of ((marcoSet && marcoSet.children) || [])) {
      const m = /Tipo=(.+)$/.exec(v.name || '');
      if (m) est.marco[m[1].trim()] = fieldsDeep(v);
    }
    const estSet = d1.nodes[EST_SETS.estrutura] && d1.nodes[EST_SETS.estrutura].document;
    const idiomaVar = ((estSet && estSet.children) || []).find(c => /Varia[cç][aã]o=Idioma/i.test(c.name || ''));
    const idiomaInst = idiomaVar && (idiomaVar.children || []).find(c => c.type === 'INSTANCE');
    if (idiomaInst && idiomaInst.componentId) {
      await sleep(400);
      const d2 = await get(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(idiomaInst.componentId)}&depth=4`);
      const comp = d2.nodes[idiomaInst.componentId] && d2.nodes[idiomaInst.componentId].document;
      if (comp) est.idioma = fieldsDeep(comp);
    }
    out.webEstrutura = est;
    console.log(`✅ estrutura web: marco ${Object.keys(est.marco).join('/')}, idioma ${est.idioma ? 'ok' : 'não achado'}`);
  } catch (e) {
    console.warn('⚠ textos de Estrutura web não lidos:', e.message);
  }
  // Textos FIXOS e campos opcionais dos cards de Títulos e Decorativos, por
  // plataforma (2026-10-08, pedido do usuário: "o plugin inteiro deve ter como
  // base a lib nova"). O componente de conteúdo de cada card é o que o scan
  // aponta em wrapperVariants do "[hac mob|web] Box specs leitor de tela"
  // (instância que não é o "Conector") — nenhum id escrito aqui. Cada campo:
  // { label, text, toggle } — label lido do TEXT "Label" (o nome da camada não
  // é confiável: no Título mobile a camada "Descrição" traz "Observações:"),
  // toggle=true quando o componente declara um BOOLEAN com esse nome.
  // Componente variante de um set (Títulos web: Nível=H1..H6) → um bloco por
  // valor da variante; senão, chave "".
  const BOX_RE = { mobile: /\[hac mob\]/i, web: /\[hac web\]/i };
  const FIXED_TYPES = { titulo: 'Títulos', decorativo: 'Elementos Decorativos' };
  const labelOf = inst => {
    const t = (inst.children || []).find(c => c.type === 'TEXT' && /^label$/i.test(c.name));
    return t ? String(t.characters || '').replace(/:\s*$/, '').trim() : String(inst.name || '').trim();
  };
  const fieldsOf = (node, booleanNames) => (node.children || [])
    .filter(c => c.type === 'INSTANCE')
    .map(c => {
      const label = labelOf(c);
      const text = fieldText(c);
      return text == null ? null : { label, text, toggle: booleanNames.includes(label) };
    })
    .filter(Boolean);
  const booleansOf = defs => Object.entries(defs || {}).filter(([, d]) => d.type === 'BOOLEAN').map(([k]) => k.split('#')[0].trim());
  try {
    const fixed = {};
    for (const [platform, re] of Object.entries(BOX_RE)) {
      const box = comps.find(c => c.shortName === 'Box specs leitor de tela' && re.test(c.fullName || ''));
      if (!box || !Array.isArray(box.wrapperVariants)) { console.warn(`⚠ Box specs ${platform} sem wrapperVariants no scan — pulando textos fixos`); continue; }
      fixed[platform] = {};
      for (const [type, option] of Object.entries(FIXED_TYPES)) {
        const v = box.wrapperVariants.find(w => w.name === `Conector=${option}`);
        const content = v && (v.instances || []).find(i => i.name !== 'Conector');
        if (!content || !content.componentId) { console.warn(`⚠ ${platform}/${type}: conteúdo do card não achado`); continue; }
        await sleep(400);
        const d = await get(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(content.componentId)}&depth=3`);
        const entry = d.nodes[content.componentId];
        const meta = entry && entry.components && entry.components[content.componentId];
        const setId = meta && meta.componentSetId;
        const byVariant = {};
        if (setId) {
          await sleep(400);
          const ds = await get(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(setId)}&depth=4`);
          const set = ds.nodes[setId] && ds.nodes[setId].document;
          const bools = booleansOf(set && set.componentPropertyDefinitions);
          for (const comp of ((set && set.children) || [])) {
            const val = String(comp.name || '').split(',').map(x => x.split('=')[1]).filter(Boolean).join(', ').trim();
            byVariant[val] = fieldsOf(comp, bools);
          }
        } else {
          const comp = entry && entry.document;
          byVariant[''] = comp ? fieldsOf(comp, booleansOf(comp.componentPropertyDefinitions)) : [];
        }
        fixed[platform][type] = byVariant;
      }
    }
    out.fixedTexts = fixed;
    console.log('✅ textos fixos:', Object.entries(fixed).map(([p, t]) => `${p}(${Object.keys(t).join('/')})`).join(' '));
  } catch (e) {
    console.warn('⚠ textos fixos de Títulos/Decorativos não lidos:', e.message);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`✅ ${path.relative(process.cwd(), OUT)}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
