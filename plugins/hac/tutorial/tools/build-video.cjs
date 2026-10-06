// Monta a composição HyperFrames de um vídeo do tutorial a partir de:
//   video/roteiro-NN.json  — cenas (fala, print, destaques)
//   video/audio/NN-*.wav   — narração por cena (gerada com `hyperframes tts`)
//   prints/*.png + prints/rects.json — prints da UI real e posição dos botões
// Uso: node tools/build-video.cjs 01
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const NN = process.argv[2] || '01';
const T = path.resolve(__dirname, '..');
const OUT = path.join(T, 'video', 'v' + NN);
const roteiro = JSON.parse(fs.readFileSync(path.join(T, 'video', `roteiro-${NN}.json`), 'utf8'));
const rects = JSON.parse(fs.readFileSync(path.join(T, 'prints', 'rects.json'), 'utf8'));

fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
for (const w of [400, 500, 700]) {
  fs.copyFileSync(path.join(T, 'node_modules/@fontsource/roboto/files', `roboto-latin-${w}-normal.woff2`), path.join(OUT, 'assets', `roboto-${w}.woff2`));
}

const dur = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Janela do plugin no vídeo: print 480x750 mostrado a 1.2x (576x900) + barra de título.
const SCALE = 1.25, WIN_X = 200, WIN_Y = 48, BAR = 44;
const LEAD = 0.5, TAIL = 0.7; // respiro antes e depois de cada fala

let t = 0;
const scenes = [];
for (const c of roteiro.cenas) {
  const wav = `${NN}-${c.id}.wav`;
  fs.copyFileSync(path.join(T, 'video', 'audio', wav), path.join(OUT, 'assets', wav));
  const d = dur(path.join(T, 'video', 'audio', wav));
  const total = LEAD + d + TAIL;
  if (c.print) fs.copyFileSync(path.join(T, 'prints', c.print + '.png'), path.join(OUT, 'assets', c.print + '.png'));
  if (c.real) fs.copyFileSync(path.join(T, '..', 'prints', c.real), path.join(OUT, 'assets', 'real-' + c.real.replace(/[^0-9]/g, '') + '.png'));
  const marks = [];
  const r = (c.print && rects[c.print]) || {};
  if (c.destaque && r[c.destaque]) marks.push(r[c.destaque]);
  for (const k of (c.destaques || [])) if (r[k]) marks.push(r[k]);
  if (c.destaqueManual) marks.push(c.destaqueManual);
  scenes.push({ ...c, start: t, total, voice: d, wav, marks });
  t += total;
}
const TOTAL = Math.ceil(t * 10) / 10;
const nTela = scenes.filter(s => s.print || s.real).length;

let html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face { font-family: Roboto; src: url(assets/roboto-400.woff2) format('woff2'); font-weight: 400; }
@font-face { font-family: Roboto; src: url(assets/roboto-500.woff2) format('woff2'); font-weight: 500; }
@font-face { font-family: Roboto; src: url(assets/roboto-700.woff2) format('woff2'); font-weight: 700; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1920px; height: 1080px; overflow: hidden; background: #eef2f7; }
#root { position: relative; width: 1920px; height: 1080px; font-family: Roboto, sans-serif; color: #1c2a33; }
.clip { position: absolute; inset: 0; }
.bg { background: radial-gradient(circle at 85% 15%, #dbe8f5 0, #eef2f7 45%); }
.brand { position: absolute; left: 1010px; top: 92px; display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 26px; color: #005ca9; letter-spacing: .02em; }
.brand i { width: 6px; height: 34px; background: #f39200; border-radius: 3px; display: block; }
.win { position: absolute; z-index: 1; left: ${WIN_X}px; top: ${WIN_Y}px; width: ${480 * SCALE}px; height: ${750 * SCALE + BAR}px; border-radius: 18px; overflow: hidden; background: #fff; box-shadow: 0 30px 70px rgba(0, 40, 80, .22), 0 4px 14px rgba(0, 40, 80, .12); }
.win .bar { height: ${BAR}px; display: flex; align-items: center; gap: 12px; padding: 0 18px; border-bottom: 1px solid #e3e8ee; font-size: 17px; font-weight: 500; color: #1c2a33; }
.win .bar b { width: 22px; height: 22px; border-radius: 6px; background: #1c2a33; display: block; }
.win img { display: block; width: ${480 * SCALE}px; height: ${750 * SCALE}px; }
.mark { position: absolute; border: 5px solid #f39200; border-radius: 16px; box-shadow: 0 0 0 9999px rgba(10, 30, 50, .28); opacity: 0; }
.mark.multi { box-shadow: none; }
.txt { position: absolute; left: 1010px; top: 300px; width: 780px; }
.step { font-size: 24px; font-weight: 700; color: #f39200; letter-spacing: .08em; text-transform: uppercase; }
.title { margin-top: 14px; font-size: 68px; line-height: 1.08; font-weight: 700; color: #00437a; }
.fala { margin-top: 30px; font-size: 32px; line-height: 1.45; color: #34444f; }
.card { background: #005ca9; color: #fff; display: flex; flex-direction: column; justify-content: center; padding-left: 180px; }
.card .k { font-size: 30px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #ffc46b; }
.card .h { margin-top: 18px; font-size: 120px; font-weight: 700; line-height: 1; }
.card .s { margin-top: 34px; font-size: 36px; max-width: 1300px; line-height: 1.4; color: #dbe9f6; }
.card .logo { position: absolute; left: 180px; top: 120px; font-size: 34px; font-weight: 700; letter-spacing: .04em; }
.realbox { position: absolute; left: 70px; top: 70px; width: 1130px; height: 940px; border-radius: 18px; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 30px 70px rgba(0, 40, 80, .22); }
.realbox img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.txt.real { left: 1270px; width: 590px; } .txt.real .title { font-size: 56px; } .txt.real .fala { font-size: 29px; }
.prog.real { left: 1270px; }
.wide .realbox { left: 70px; top: 50px; width: 1780px; height: 760px; }
.wide .txt.real { left: 90px; top: 850px; width: 1740px; display: grid; grid-template-columns: 560px 1fr; column-gap: 50px; }
.wide .txt.real .step { grid-column: 1 / 3; } .wide .txt.real .title { font-size: 50px; margin-top: 8px; } .wide .txt.real .fala { margin-top: 10px; font-size: 28px; }
.wide .prog.real { display: none; }
.prog { position: absolute; left: 1010px; bottom: 90px; display: flex; gap: 10px; }
.prog span { width: 34px; height: 6px; border-radius: 3px; background: #c9d6e3; }
.prog span.on { background: #005ca9; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
`;

let telaIdx = 0;
const tlLines = [];
scenes.forEach((s, i) => {
  const id = `s${i}`;
  const st = s.start.toFixed(2), du = s.total.toFixed(2);
  html += `  <audio id="a${i}" src="assets/${s.wav}" data-start="${(s.start + LEAD).toFixed(2)}" data-duration="${s.voice.toFixed(2)}" data-volume="1"></audio>\n`;
  if (!s.print && !s.real) {
    html += `  <section id="${id}" class="clip card" data-start="${st}" data-duration="${du}">
    <div class="logo">CAIXA · HAC</div>
    <div class="k">${esc(s.kicker || '')}</div>
    <div class="h">${esc(s.titulo)}</div>
    <div class="s">${esc(s.fala)}</div>
  </section>\n`;
    tlLines.push(`tl.fromTo('#${id} .h', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: .7, ease: 'power3.out' }, ${st});`);
    tlLines.push(`tl.fromTo('#${id} .k, #${id} .s', { opacity: 0 }, { opacity: 1, duration: .6, stagger: .15 }, ${(s.start + .2).toFixed(2)});`);
    return;
  }
  if (s.real) {
    telaIdx++;
    const dotsR = Array.from({ length: nTela }, (_, k) => `<span class="${k < telaIdx ? 'on' : ''}"></span>`).join('');
    const img = 'real-' + s.real.replace(/[^0-9]/g, '') + '.png';
    const buf = fs.readFileSync(path.join(T, '..', 'prints', s.real));
    const wide = buf.readUInt32BE(16) / buf.readUInt32BE(20) > 1.35; // PNG: largura/altura no IHDR
    html += `  <section id="${id}" class="clip bg${wide ? ' wide' : ''}" data-start="${st}" data-duration="${du}">
    <div class="realbox"><img src="assets/${img}" alt="" /></div>
    <div class="txt real"><div class="step">Passo ${telaIdx} de ${nTela} · no canvas</div><div class="title">${esc(s.titulo)}</div><div class="fala">${esc(s.fala)}</div></div>
    <div class="prog real">${dotsR}</div>
  </section>
`;
    tlLines.push(`tl.fromTo('#${id} .realbox', { opacity: 0, scale: .97 }, { opacity: 1, scale: 1, duration: .6, ease: 'power2.out' }, ${st});`);
    tlLines.push(`tl.fromTo('#${id} .realbox img', { scale: 1 }, { scale: 1.06, duration: ${du}, ease: 'none' }, ${st});`);
    tlLines.push(`tl.fromTo('#${id} .title', { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: .6 }, ${(s.start + .15).toFixed(2)});`);
    tlLines.push(`tl.fromTo('#${id} .fala', { opacity: 0 }, { opacity: 1, duration: .6 }, ${(s.start + .35).toFixed(2)});`);
    return;
  }
  telaIdx++;
  const dots = Array.from({ length: nTela }, (_, k) => `<span class="${k < telaIdx ? 'on' : ''}"></span>`).join('');
  const marks = s.marks.map((m, k) => {
    const pad = 6;
    const left = m.x * SCALE - pad, top = BAR + m.y * SCALE - pad;
    return `<div class="mark ${s.marks.length > 1 ? 'multi' : ''}" id="${id}m${k}" style="left:${left.toFixed(0)}px;top:${top.toFixed(0)}px;width:${(m.w * SCALE + pad * 2).toFixed(0)}px;height:${(m.h * SCALE + pad * 2).toFixed(0)}px"></div>`;
  }).join('\n    ');
  html += `  <section id="${id}" class="clip bg" data-start="${st}" data-duration="${du}">
    <div class="brand"><i></i>HAC · Handoff de Acessibilidade CAIXA</div>
    <div class="win"><div class="bar"><b></b>HAC - Handoff de Acessibilidade CAIXA</div><img src="assets/${s.print}.png" alt="" />
    ${marks}</div>
    <div class="txt"><div class="step">Passo ${telaIdx} de ${nTela}</div><div class="title">${esc(s.titulo)}</div><div class="fala">${esc(s.fala)}</div></div>
    <div class="prog">${dots}</div>
  </section>\n`;
  tlLines.push(`tl.fromTo('#${id} .win', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: .6, ease: 'power2.out' }, ${st});`);
  tlLines.push(`tl.fromTo('#${id} .title', { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: .6, ease: 'power2.out' }, ${(s.start + .15).toFixed(2)});`);
  tlLines.push(`tl.fromTo('#${id} .fala', { opacity: 0 }, { opacity: 1, duration: .6 }, ${(s.start + .35).toFixed(2)});`);
  s.marks.forEach((m, k) => {
    const at = s.start + LEAD + 0.6 + k * Math.min(1.6, (s.voice - 1) / Math.max(1, s.marks.length));
    tlLines.push(`tl.fromTo('#${id}m${k}', { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: .45, ease: 'back.out(2)' }, ${at.toFixed(2)});`);
  });
});

html += `</div>
<script>
const tl = gsap.timeline({ paused: true });
${tlLines.join('\n')}
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log(`v${NN}: ${scenes.length} cenas, ${TOTAL}s -> ${path.join(OUT, 'index.html')}`);
