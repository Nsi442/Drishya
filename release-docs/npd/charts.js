// Geometry for the phase flowcharts. One template, five charts, so the set
// reads as one drawing rather than five.
const W = 720;
const BOX_X = 44, BOX_W = 500, BOX_H = 52, TAB_W = 88;
const BOX_R = BOX_X + BOX_W;          // 544
const PITCH = 78;
// 36 apart, not 26: a rotated label needs clear air on both sides or it
// reads as crossing the neighbouring loop's line.
const LANES = [562, 598, 634, 670];
const TOP = 18;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function defs(id) {
  return `<defs>
      <marker id="arw-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path class="ah" d="M0,0 L10,5 L0,10 Z"/>
      </marker>
      <marker id="arwl-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path class="ah-loop" d="M0,0 L10,5 L0,10 Z"/>
      </marker>
    </defs>`;
}

function phaseChart(p, seg) {
  // Render part of a phase, so a thirteen-step phase becomes two figures that
  // each fit a page instead of one that fits none.
  if (seg) {
    const steps = p.steps.slice(seg.from, seg.to);
    const hasGate = steps.some((st) => st.code === p.gate.code);
    p = Object.assign({}, p, {
      steps,
      entry: seg.entry || p.entry,
      gate: hasGate ? p.gate : { n: p.gate.n, code: '__none__', title: '', midPhase: true },
      exits: seg.last ? p.exits : null,
    });
  }
  const rows = [];                     // every drawn row, in order
  rows.push({ kind: 'term', label: p.entry });
  for (const s of p.steps) {
    const isGate = p.gate.code === s.code;
    rows.push(isGate ? { kind: 'gate', ...s, gate: p.gate } : { kind: 'step', ...s });
  }
  const tail = p.gate.midPhase ? null : { kind: 'term', label: `Gate ${p.gate.n} passed` };
  if (tail) rows.push(tail);

  const y = (i) => TOP + i * PITCH;
  const H = y(rows.length - 1) + BOX_H + (p.exits ? 74 : 18);
  const yOf = {};
  rows.forEach((r, i) => { if (r.code) yOf[r.code] = y(i); });

  const out = [defs(p.slug)];

  // Edges first, so boxes sit on top of them.
  for (let i = 0; i < rows.length - 1; i++) {
    const y1 = y(i) + BOX_H, y2 = y(i + 1);
    out.push(`<line class="edge" x1="${BOX_X + BOX_W / 2}" y1="${y1}" x2="${BOX_X + BOX_W / 2}" y2="${y2 - 2}" marker-end="url(#arw-${p.slug})"/>`);
  }

  // Rework loops, each in its own lane so two never overlap.
  p.loops.forEach((lp, k) => {
    const lane = LANES[k % LANES.length];
    if (yOf[lp.from] === undefined) return;
    // A loop whose target is not on this chart (because a long phase is split
    // across two figures) leaves the drawing as a labelled stub, rather than
    // being silently dropped.
    if (yOf[lp.to] === undefined) {
      const ys0 = yOf[lp.from] + BOX_H / 2;
      // Two short lines, not one long one: a single label ran past the
      // viewBox and was clipped mid-word in the rendered figure.
      out.push(`<path class="loop" d="M${BOX_R},${ys0} H${BOX_R + 26}"/>`);
      out.push(`<text class="offchart" x="${BOX_R + 32}" y="${ys0 - 3}">${esc(lp.label)}</text>`);
      out.push(`<text class="offchart em" x="${BOX_R + 32}" y="${ys0 + 11}">\u2192 ${esc(lp.to)}</text>`);
      return;
    }
    const ys = yOf[lp.from] + BOX_H / 2;
    const yt = yOf[lp.to] + BOX_H / 2;
    out.push(`<path class="loop" d="M${BOX_R},${ys} H${lane} V${yt} H${BOX_R + 4}" marker-end="url(#arwl-${p.slug})"/>`);
    const mid = (ys + yt) / 2;
    out.push(`<text class="loop-label" x="${lane + 12}" y="${mid}" text-anchor="middle" transform="rotate(-90 ${lane + 12} ${mid})">${esc(lp.label)}</text>`);
  });

  // Nodes.
  rows.forEach((r, i) => {
    const yy = y(i);
    if (r.kind === 'term') {
      const w = 210, x = BOX_X + (BOX_W - w) / 2;
      out.push(`<rect class="term" x="${x}" y="${yy + 10}" width="${w}" height="32" rx="16"/>`);
      out.push(`<text class="term-text" x="${BOX_X + BOX_W / 2}" y="${yy + 30}" text-anchor="middle">${esc(r.label)}</text>`);
      return;
    }
    if (r.kind === 'gate') {
      // A gate is drawn as a barrier across the flow, chamfered at both ends —
      // the flow cannot continue through it without a decision.
      const gx = 24, gw = BOX_R - 24, ch = 12;
      out.push(`<path class="gate" d="M${gx + ch},${yy} H${gx + gw - ch} L${gx + gw},${yy + BOX_H / 2} L${gx + gw - ch},${yy + BOX_H} H${gx + ch} L${gx},${yy + BOX_H / 2} Z"/>`);
      out.push(`<text class="gate-n" x="${gx + 30}" y="${yy + BOX_H / 2 + 5}" text-anchor="middle">G${r.gate.n}</text>`);
      out.push(`<text class="gate-code" x="${gx + 58}" y="${yy + 21}">${esc(r.code)}</text>`);
      out.push(`<text class="gate-title" x="${gx + 58}" y="${yy + 38}">${esc(r.title)}</text>`);
      return;
    }
    out.push(`<rect class="box${r.spine ? ' box-spine' : ''}${r.adapted ? ' box-adapted' : ''}" x="${BOX_X}" y="${yy}" width="${BOX_W}" height="${BOX_H}" rx="3"/>`);
    out.push(`<path class="tab" d="M${BOX_X + 3},${yy} h${TAB_W - 3} v${BOX_H} h-${TAB_W - 3} a3,3 0 0 1 -3,-3 v-${BOX_H - 6} a3,3 0 0 1 3,-3 Z"/>`);
    out.push(`<line class="tab-rule" x1="${BOX_X + TAB_W}" y1="${yy}" x2="${BOX_X + TAB_W}" y2="${yy + BOX_H}"/>`);
    out.push(`<text class="code" x="${BOX_X + TAB_W / 2}" y="${yy + BOX_H / 2 + 4}" text-anchor="middle">${esc(r.code)}</text>`);
    out.push(`<text class="title" x="${BOX_X + TAB_W + 16}" y="${yy + BOX_H / 2 + 4}">${esc(r.title)}</text>`);
    if (r.spine) out.push(`<text class="spine-note" x="${BOX_R + 10}" y="${yy + BOX_H / 2 + 4}">every later record files here</text>`);
  });

  // Phase 5's two closing returns, which make the process a cycle.
  if (p.exits) {
    const last = y(rows.length - 1) + BOX_H;
    p.exits.forEach((ex, k) => {
      const yy = last + 22 + k * 22;
      out.push(`<line class="loop" x1="${BOX_X + BOX_W / 2}" y1="${last}" x2="${BOX_X + BOX_W / 2}" y2="${yy - 8}"/>`);
      out.push(`<text class="exit-label" x="${BOX_X + BOX_W / 2}" y="${yy}" text-anchor="middle">${esc(ex.label)}</text>`);
    });
  }

  return `<svg class="flow" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`Phase ${p.n}, ${p.name}: ${p.steps.map(s => s.title).join(', ')}, ending at Gate ${p.gate.n}`)}">${out.join('\n      ')}</svg>`;
}

module.exports = { phaseChart, esc };
