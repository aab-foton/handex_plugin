// Gera prints da interface REAL do hac (src/plugin/ui.html) num Chrome headless.
// O `parent` da página é trocado por um "Figma de mentira" que recebe as
// mensagens da UI e responde (init-plugin com um projeto de exemplo, etc.).
// Uso: node tools/shoot.cjs [cena ...]   (sem argumento = todas as cenas)
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const UI = 'file:///' + path.join(ROOT, 'src', 'plugin', 'ui.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '..', 'prints');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SAMPLE = require('./sample-project.cjs');

const SCENES = process.env.PROBE ? require('./probe-scenes.cjs') : require('./scenes.cjs');

async function newPage(browser, state) {
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 750, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument((state) => {
    window.__sent = [];
    window.__reply = (pluginMessage) => window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage } }));
    const fake = {
      postMessage(m) {
        const msg = m && m.pluginMessage;
        if (!msg) return;
        window.__sent.push(msg);
        if (msg.type === 'ui-ready') {
          setTimeout(() => window.__reply({
            type: 'init-plugin', version: state.version, fileKey: 'demo',
            currentUser: { id: '1', name: 'Ana Designer', photoUrl: null },
            theme: 'light', savedState: state.savedState, onboardingSeen: state.onboardingSeen,
          }), 30);
        }
        if (msg.type === 'get-a11y-selection-info') {
          const sel = window.__fakeSelection || [{ id: '1:1', name: 'Tela Principal' }];
          setTimeout(() => window.__reply({ type: 'a11y-selection-info', id: sel[0].id, name: sel[0].name, ids: sel.map(n => n.id), names: sel.map(n => n.name) }), 10);
        }
        if (msg.type === 'create-unified-spec') {
          const o = msg.opts || {};
          window.__specSeq = (window.__specSeq || 0) + 1;
          setTimeout(() => window.__reply({ type: 'spec-created', spec: { id: 'NEW' + window.__specSeq, targetNodeId: o.targetNodeId, name: 'Elemento ' + o.targetNodeId,
            letter: o.letter, a11yType: o.a11yType, a11yOrigin: o.a11yOrigin, a11yAreaId: o.a11yAreaId, properties: o.properties || [] } }), 20);
        }
      },
    };
    window.parent = fake;
  }, state);
  page.on('pageerror', e => console.error('  [pageerror]', e.message));
  await page.goto(UI, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  return page;
}

(async () => {
  const want = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
  const version = require(path.join(ROOT, 'package.json')).version;
  for (const scene of SCENES) {
    if (want.length && !want.includes(scene.id)) continue;
    const state = { version, savedState: scene.empty ? null : SAMPLE(scene.origin || 'web'), onboardingSeen: { web: true, mobile: true } };
    const page = await newPage(browser, state);
    try {
      if (scene.run) await page.evaluate(scene.run);
      await new Promise(r => setTimeout(r, scene.wait || 700));
      await page.evaluate(() => {
        if (typeof _refreshIcons === 'function') _refreshIcons();
        // Sem anel de foco automático nos prints (o botão fechar das modais
        // ganha foco ao abrir).
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      });
      await new Promise(r => setTimeout(r, 250));
      if (scene.probe) console.log(await page.evaluate(scene.probe));
      // Posição (em px da janela 480x750) dos elementos a destacar no vídeo:
      // scene.marks = { nome: 'texto visível do botão' }.
      if (scene.marks) {
        const rects = await page.evaluate((marks) => {
          const out = {};
          for (const [key, text] of Object.entries(marks)) {
            const els = [...document.querySelectorAll('button, a, label, [role="button"], h3, p, span, div')]
              .filter(e => e.offsetParent && e.textContent.replace(/\s+/g, ' ').trim() === text);
            const el = els.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)
              .map(e => e.closest('button') || e)[0];
            if (el) { const r = el.getBoundingClientRect(); out[key] = { x: r.x, y: r.y, w: r.width, h: r.height }; }
          }
          return out;
        }, scene.marks);
        const file = path.join(OUT, 'rects.json');
        const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        all[scene.id] = rects;
        fs.writeFileSync(file, JSON.stringify(all, null, 2));
        const missing = Object.keys(scene.marks).filter(k => !rects[k]);
        if (missing.length) console.log('  marcas não achadas:', missing.join(', '));
      }
      await page.screenshot({ path: path.join(OUT, scene.id + '.png') });
      console.log('ok', scene.id);
    } catch (e) {
      console.error('FALHOU', scene.id, e.message);
    }
    await page.close();
  }
  await browser.close();
})();
