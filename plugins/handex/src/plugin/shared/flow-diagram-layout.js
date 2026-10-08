// Layout do diagrama de Fluxos de Tela (2026-10-05, pedido do Augusto).
// Fonte ÚNICA usada pela Ficha do canvas (code.js, via import/esbuild) e pela
// Ficha HTML (build.cjs concatena este arquivo no ui.html, tirando o `export`) -- os dois desenhos
// nunca divergem. Função pura: só calcula posições, não desenha nada.
//
// Uma jornada por componente conectado (mesmo critério de computeFlowJourneys,
// core.js). Caixas = telas (nome do frame), círculos = Início/Fim ligados à
// tela marcada, setas = conexões (cor e tracejado da conexão), losango =
// decisão. Até 4 telas cabendo em 872px: linha horizontal; acima disso,
// coluna vertical. Conexão para a tela seguinte vai reta; as demais (pular
// tela, voltar, repetida) correm em faixas próprias abaixo (horizontal) ou à
// direita (vertical).
export function hdFlowDiagramLayout(flows, nameOf, maxWidth) {
  const MAXW = maxWidth || 872;
  const BW = 140, BH = 52, R = 10, PAD = 24, EV = 36, LANE = 16;
  const isEvent = f => f.type === 'event_start' || f.type === 'event_end';
  const list = (flows || []).filter(f => f && f.sourceId);

  const parent = {};
  const find = x => { if (!(x in parent)) parent[x] = x; while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  list.forEach(f => { find(f.sourceId); if (f.targetId) { const a = find(f.sourceId), b = find(f.targetId); if (a !== b) parent[a] = b; } });
  const groups = new Map();
  list.forEach(f => { const r = find(f.sourceId); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });

  const journeys = [];
  let unnamed = 0;
  groups.forEach(conns => {
    const named = conns.find(f => f.journeyName && String(f.journeyName).trim());
    const title = named ? String(named.journeyName).trim() : `Jornada sem nome ${++unnamed}`;
    const edges = conns.filter(f => !isEvent(f) && f.targetId);
    const events = conns.filter(isEvent);

    const order = [];
    const seen = new Set();
    const visit = start => {
      const q = [start];
      while (q.length) {
        const id = q.shift();
        if (seen.has(id)) continue;
        seen.add(id); order.push(id);
        edges.forEach(e => { if (e.sourceId === id && !seen.has(e.targetId)) q.push(e.targetId); });
      }
    };
    events.filter(e => e.type === 'event_start').forEach(e => visit(e.sourceId));
    conns.forEach(f => { visit(f.sourceId); if (f.targetId) visit(f.targetId); });
    const idx = new Map(order.map((id, i) => [id, i]));
    const n = order.length;

    const startOn = new Set(events.filter(e => e.type === 'event_start').map(e => e.sourceId));
    const endOn = new Set(events.filter(e => e.type === 'event_end').map(e => e.sourceId));

    const usedPairs = new Set();
    const isStraight = e => {
      const k = e.sourceId + '>' + e.targetId;
      if (idx.get(e.targetId) !== idx.get(e.sourceId) + 1 || usedPairs.has(k)) return false;
      usedPairs.add(k);
      return true;
    };
    const straight = edges.map(isStraight);
    const laneCount = straight.filter(s => !s).length;

    const build = orient => {
      const boxes = [], ev = [], out = [], decisions = [];
      let width, height;
      if (orient === 'h') {
        const above = order.some((id, i) => (startOn.has(id) && i > 0) || (endOn.has(id) && i < n - 1));
        const top = PAD + (above ? EV + R : 0);
        const left = PAD + (startOn.has(order[0]) ? EV + R : 0);
        const GAP = 56;
        order.forEach((id, i) => boxes.push({ id, name: nameOf(id), x: left + i * (BW + GAP), y: top, w: BW, h: BH }));
        const last = boxes[n - 1];
        width = last.x + BW + (endOn.has(order[n - 1]) ? EV + R : 0) + PAD;
        height = top + BH + (laneCount ? 24 + laneCount * LANE : 0) + PAD;
        order.forEach((id, i) => {
          const b = boxes[i], cy = b.y + BH / 2;
          const both = startOn.has(id) && endOn.has(id) && i > 0 && i < n - 1;
          if (startOn.has(id)) {
            if (i === 0) ev.push({ kind: 'start', cx: b.x - EV, cy, r: R, line: [{ x: b.x - EV + R, y: cy }, { x: b.x, y: cy }] });
            else { const cx = b.x + BW / 2 - (both ? 24 : 0); ev.push({ kind: 'start', cx, cy: b.y - EV, r: R, line: [{ x: cx, y: b.y - EV + R }, { x: cx, y: b.y }] }); }
          }
          if (endOn.has(id)) {
            if (i === n - 1) ev.push({ kind: 'end', cx: b.x + BW + EV, cy, r: R, line: [{ x: b.x + BW, y: cy }, { x: b.x + BW + EV - R, y: cy }] });
            else { const cx = b.x + BW / 2 + (both ? 24 : 0); ev.push({ kind: 'end', cx, cy: b.y - EV, r: R, line: [{ x: cx, y: b.y }, { x: cx, y: b.y - EV + R }] }); }
          }
        });
        let k = 0;
        edges.forEach((e, ei) => {
          const s = boxes[idx.get(e.sourceId)], t = boxes[idx.get(e.targetId)];
          let pts;
          if (straight[ei]) {
            pts = [{ x: s.x + BW, y: s.y + BH / 2 }, { x: t.x, y: t.y + BH / 2 }];
          } else {
            const laneY = s.y + BH + 24 + k * LANE, dx = ((k % 5) - 2) * 10;
            pts = [{ x: s.x + BW / 2 + dx, y: s.y + BH }, { x: s.x + BW / 2 + dx, y: laneY }, { x: t.x + BW / 2 + dx, y: laneY }, { x: t.x + BW / 2 + dx, y: t.y + BH }];
            k++;
          }
          out.push(edgeOf(e, pts));
        });
      } else {
        const side = order.some((id, i) => (startOn.has(id) && i > 0) || (endOn.has(id) && i < n - 1));
        const left = PAD + (side ? EV + R + 8 : 0);
        const top = PAD + (startOn.has(order[0]) ? EV + R : 0);
        const GAP = 56;
        order.forEach((id, i) => boxes.push({ id, name: nameOf(id), x: left, y: top + i * (BH + GAP), w: BW, h: BH }));
        const last = boxes[n - 1];
        width = left + BW + (laneCount ? 24 + laneCount * LANE : 0) + PAD;
        height = last.y + BH + (endOn.has(order[n - 1]) ? EV + R : 0) + PAD;
        order.forEach((id, i) => {
          const b = boxes[i], cx = b.x + BW / 2;
          const both = startOn.has(id) && endOn.has(id) && i > 0 && i < n - 1;
          if (startOn.has(id)) {
            if (i === 0) ev.push({ kind: 'start', cx, cy: b.y - EV, r: R, line: [{ x: cx, y: b.y - EV + R }, { x: cx, y: b.y }] });
            else { const cy = b.y + BH / 2 - (both ? 14 : 0); ev.push({ kind: 'start', cx: b.x - EV, cy, r: R, line: [{ x: b.x - EV + R, y: cy }, { x: b.x, y: cy }] }); }
          }
          if (endOn.has(id)) {
            if (i === n - 1) ev.push({ kind: 'end', cx, cy: b.y + BH + EV, r: R, line: [{ x: cx, y: b.y + BH }, { x: cx, y: b.y + BH + EV - R }] });
            else { const cy = b.y + BH / 2 + (both ? 14 : 0); ev.push({ kind: 'end', cx: b.x - EV, cy, r: R, line: [{ x: b.x, y: cy }, { x: b.x - EV + R, y: cy }] }); }
          }
        });
        let k = 0;
        edges.forEach((e, ei) => {
          const s = boxes[idx.get(e.sourceId)], t = boxes[idx.get(e.targetId)];
          let pts;
          if (straight[ei]) {
            pts = [{ x: s.x + BW / 2, y: s.y + BH }, { x: t.x + BW / 2, y: t.y }];
          } else {
            const laneX = s.x + BW + 24 + k * LANE, dy = ((k % 5) - 2) * 6;
            pts = [{ x: s.x + BW, y: s.y + BH / 2 + dy }, { x: laneX, y: s.y + BH / 2 + dy }, { x: laneX, y: t.y + BH / 2 + dy }, { x: t.x + BW, y: t.y + BH / 2 + dy }];
            k++;
          }
          out.push(edgeOf(e, pts));
        });
      }
      out.forEach((ed, i) => {
        if (ed.decision) decisions.push({ n: ed.decision.n, type: edges[i].type, from: nameOf(edges[i].sourceId), to: nameOf(edges[i].targetId), text: ed.decision.text || '' });
      });
      return { title, orient, width, height, boxes, events: ev, edges: out, decisions };
    };

    // O desenho segue o TIPO escolhido no plugin (2026-10-08, pedido do
    // Augusto): Sequência = seta contínua; Mensagem = seta tracejada; Decisão =
    // losango; Decisão (opcional) = losango com linha tracejada. O texto da
    // conexão vira um marcador NUMERADO no meio da seta (losango só em
    // Decisão, etiqueta nos demais) e o texto completo vai para a lista abaixo.
    let decN = 0;
    const edgeOf = (e, pts) => {
      const dashed = e.type === 'line_dashed' || e.type === 'diamond_dashed';
      const isDecision = e.type === 'diamond' || e.type === 'diamond_dashed';
      const hasText = !!(e.decisionText && String(e.decisionText).trim());
      let mid = null;
      if (isDecision || hasText) {
        let best = 0, bi = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const l = Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
          if (l > best) { best = l; bi = i; }
        }
        mid = { x: (pts[bi].x + pts[bi + 1].x) / 2, y: (pts[bi].y + pts[bi + 1].y) / 2 };
      }
      const text = e.decisionText ? String(e.decisionText).trim() : '';
      return { points: pts, color: e.color || '#22292e', dashed, type: e.type, decision: mid ? { x: mid.x, y: mid.y, n: ++decN, text, kind: isDecision ? 'decision' : 'label' } : null };
    };

    if (n === 0) return;
    let lay = build('h');
    if (lay.width > MAXW) { decN = 0; lay = build('v'); }
    journeys.push(lay);
  });
  return journeys;
}

