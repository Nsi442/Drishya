const C = require('./cards.js');
const { detail } = require('./detail.js');
const esc = C.esc;

const W = 1100;
const GUT = 30;

/** Lay procedure cards out in a grid, arrows between consecutive cards. */
function grid(codes, cols, x0, y0, id) {
  const w = Math.floor((W - (cols - 1) * GUT) / cols);
  const o = [];
  let y = y0, maxY = y0, lastCx = x0 + w / 2;
  for (let i = 0; i < codes.length; i += cols) {
    const row = codes.slice(i, i + cols);
    const h = Math.max(...row.map((c) => C.cardHeight(detail[c], w)));
    row.forEach((code, k) => {
      const x = x0 + k * (w + GUT);
      const r = C.card(x, y, w, code, detail[code]);
      o.push(r.svg);
      if (k < row.length - 1) {
        o.push(`<line class="edge" x1="${x + w}" y1="${y + h / 2}" x2="${x + w + GUT - 4}" y2="${y + h / 2}" marker-end="url(#arw-${id})"/>`);
      }
    });
    // Wrap from the end of one row to the start of the next.
    if (i + cols < codes.length) {
      const bottom = y + h;
      o.push(`<path class="edge" d="M${x0 + (row.length - 1) * (w + GUT) + w / 2},${bottom} V${bottom + 14} H${x0 + w / 2} V${bottom + 26 - 4}" marker-end="url(#arw-${id})"/>`);
    }
    y += h + 26;
    maxY = y;
    lastCx = x0 + (row.length - 1) * (w + GUT) + w / 2;
  }
  return { svg: o.join('\n      '), bottom: maxY - 26, lastCx };
}

function phaseFigure({ id, title, codes, cols, gate, banner, only }) {
  const o = [C.defs(id)];
  let y = 34;
  o.push(`<text class="fig-title" x="0" y="20">${esc(title)}</text>`);

  let g = { bottom: y, lastCx: W / 2 };
  if (only !== 'gate') {
    g = grid(codes, cols, 0, y, id);
    o.push(g.svg);
    y = g.bottom + 26;
  }

  if (banner) {
    o.push(`<path class="edge" d="M${g.lastCx},${g.bottom} V${y - 12} H${W / 2} V${y - 4}" marker-end="url(#arw-${id})"/>`);
    const b = C.banner(0, y, W, banner, detail[banner]);
    o.push(b.svg);
    y += b.h + 26;
  }
  if (gate && only !== 'cards') {
    // The diamond's apex, so the flow visibly enters the gate instead of the
    // gate block floating below an unconnected row of cards.
    const apexX = 115, apexY = y + C.gateBlock(0, y, W, gate, detail[gate], id).h / 2 - 54;
    if (only !== 'gate') {
      const fromX = banner ? W / 2 : g.lastCx, fromY = banner ? y - 26 : g.bottom;
      o.push(`<path class="edge" d="M${fromX},${fromY} V${fromY + 14} H${apexX} V${apexY - 4}" marker-end="url(#arw-${id})"/>`);
    }
    const gb = C.gateBlock(0, y, W, gate, detail[gate], id);
    o.push(gb.svg);
    y += gb.h + 10;
    if (detail[gate].basis) {
      for (const line of C.wrap(detail[gate].basis, W + 24)) {
        y += 14;
        o.push(`<text class="basis" x="${W / 2}" y="${y}" text-anchor="middle">${esc(line)}</text>`);
      }
    }
  }
  y += 14;
  return `<svg class="flow" viewBox="0 0 ${W} ${y}" width="${W}" height="${Math.round(y)}" role="img" aria-label="${esc(title)}">${o.join('\n      ')}</svg>`;
}

/** Figure 1 — the master flow: phase cards, the gate row, and the rework return. */
function masterFlow() {
  const o = [C.defs('m1')];
  const phases = [
    { n: 1, name: 'Pre-Assessment', band: 'blue', codes: ['1010 Opportunity Assessment', '1020 Gate Keepers', '1030 Gate-1'] },
    { n: 2, name: 'Definition & Planning', band: 'teal', codes: ['2010 Start-Up', '2020 PDS', '2030 DHF', '2040 Plan', '2050 Preliminary Review', '2060 Gate-2'] },
    { n: 3, name: 'Product & Process Design', band: 'purple', codes: ['3010 Concept', '3020 System', '3030 Detail', '3040 Design Reviews', '3050–3120 process,', 'prototypes & reviews', '3130 Gate-3'] },
    { n: 4, name: 'Production Prep & Design Validation', band: 'amber', codes: ['4010 ECO', '4020 Sourcing', '4030 Production Prep', '4040–4080 pre-production,', 'V&V & reviews', '4090 Gate-4'] },
    { n: 5, name: 'Launch & Post-Production', band: 'green', codes: ['5010 Publications & Training', '5020 Introduction Review', '5030 Gate-5', '5040 Launch & Full Scale', '5050 Feedback / Corrective'] },
  ];
  const cw = Math.floor((W - 4 * 22) / 5);
  const bodyLines = Math.max(...phases.map((p) => p.codes.length));
  const ch = 34 + bodyLines * 13.4 + 16;
  const top = 26;

  phases.forEach((p, i) => {
    const x = i * (cw + 22);
    o.push(`<rect class="card" x="${x}" y="${top}" width="${cw}" height="${ch}" rx="4"/>`);
    o.push(`<path class="band-${p.band}" d="M${x},${top + 4} a4,4 0 0 1 4,-4 h${cw - 8} a4,4 0 0 1 4,4 v30 h-${cw} Z"/>`);
    o.push(`<text class="mf-n" x="${x + 12}" y="${top + 14}">PHASE ${p.n}</text>`);
    o.push(`<text class="mf-name" x="${x + 12}" y="${top + 27}">${esc(p.name)}</text>`);
    p.codes.forEach((c, k) => {
      o.push(`<text class="mf-code" x="${x + 12}" y="${top + 34 + 14 + k * 13.4}">${esc(c)}</text>`);
    });
    if (i < 4) {
      o.push(`<line class="edge" x1="${x + cw}" y1="${top + ch / 2}" x2="${x + cw + 18}" y2="${top + ch / 2}" marker-end="url(#arw-m1)"/>`);
    }
  });

  // The gate row sits below the phases, each diamond under the phase it closes.
  const gy = top + ch + 54, gw = 150, gh = 56;
  for (let i = 0; i < 5; i++) {
    const cx = i * (cw + 22) + cw / 2;
    o.push(`<line class="edge" x1="${cx}" y1="${top + ch}" x2="${cx}" y2="${gy - gh / 2 - 4}" marker-end="url(#arw-m1)"/>`);
    o.push(`<path class="gate-d" d="M${cx},${gy - gh / 2} L${cx + gw / 2},${gy} L${cx},${gy + gh / 2} L${cx - gw / 2},${gy} Z"/>`);
    o.push(`<text class="gate-row" x="${cx}" y="${gy + 4}" text-anchor="middle">Gate-${i + 1}</text>`);
    if (i < 4) {
      o.push(`<line class="edge" x1="${cx + gw / 2}" y1="${gy}" x2="${(i + 1) * (cw + 22) + cw / 2 - gw / 2 - 4}" y2="${gy}" marker-end="url(#arw-m1)"/>`);
    }
  }

  // Rework / action closure: the return that makes this a cycle.
  const ry = gy + gh / 2 + 34;
  o.push(`<path class="loop" d="M${4 * (cw + 22) + cw / 2},${gy + gh / 2} V${ry} H${cw / 2 - 40} V${gy + gh / 2 + 4}" marker-end="url(#arwl-m1)"/>`);
  o.push(`<text class="rework" x="${W / 2}" y="${ry + 20}" text-anchor="middle">REWORK / ACTION CLOSURE</text>`);
  o.push(`<defs><marker id="arwl-m1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="ah-loop" d="M0,0 L10,5 L0,10 Z"/></marker></defs>`);
  o.push(`<text class="fig-title" x="0" y="14">NPD Master Flow</text>`);

  const H = ry + 34;
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="The five NPD phases with their procedure codes, the five gates beneath them, and a rework and action closure return">${o.join('\n      ')}</svg>`;
}

/** The closing page: how to read any of the flows. */
function guideFigure() {
  const o = [C.defs('gd')];
  const w3 = Math.floor((W - 2 * GUT) / 3);
  o.push(`<text class="fig-title" x="0" y="20">General guide to read the flow — decision and iteration logic</text>`);

  const y0 = 40;
  const exec = { title: 'EXECUTE APPLICABLE WORK', band: 'blue',
    act: 'Not every procedure applies to every project. Scope and the adopted process determine applicability — two procedures here are adapted rather than skipped, and say so.' };
  const e = C.card(0, y0, w3, '1', exec);
  o.push(e.svg);

  const dx = w3 + GUT, dw = w3, dcy = y0 + e.h / 2;
  o.push(`<line class="edge" x1="${w3}" y1="${dcy}" x2="${dx - 4}" y2="${dcy}" marker-end="url(#arw-gd)"/>`);
  o.push(`<path class="gate-d" d="M${dx + dw / 2},${dcy - 48} L${dx + dw},${dcy} L${dx + dw / 2},${dcy + 48} L${dx},${dcy} Z"/>`);
  o.push(`<text class="gate-name" x="${dx + dw / 2}" y="${dcy + 4}" text-anchor="middle">Acceptance / review criteria met?</text>`);

  const yes = { title: 'YES | PROGRESS', band: 'green', act: 'Proceed to the next design level, phase, or gate.' };
  const no = { title: 'NO | REWORK', band: 'red', act: 'Close review actions; revise the affected product, process, plan and traceability records; retest and re-review.' };
  const yx = dx + dw + GUT;
  const ry = C.card(yx, y0, w3, '✓', yes);
  o.push(ry.svg);
  o.push(`<line class="edge" x1="${dx + dw}" y1="${dcy}" x2="${yx - 4}" y2="${y0 + ry.h / 2}" marker-end="url(#arw-gd)"/>`);
  const noY = y0 + Math.max(e.h, ry.h) + 26;
  const rn = C.card(yx, noY, w3, '↺', no);
  o.push(rn.svg);
  o.push(`<path class="edge" d="M${dx + dw / 2},${dcy + 48} V${noY + rn.h / 2} H${yx - 4}" marker-end="url(#arw-gd)"/>`);

  const gd = { title: 'GATE DECISIONS', band: 'amber',
    act: 'Gate-1 start / stop the opportunity. Gate-2 approve plan and design inputs. Gate-3 approve the design for production preparation. Gate-4 approve the production and launch transition. Gate-5 approve full-scale production and market launch.' };
  const g = C.card(0, noY, w3 * 2 + GUT, '◇', gd);
  o.push(g.svg);

  const iterY = Math.max(noY + rn.h, noY + g.h) + 26;
  const it = { title: 'KEY ITERATION EXAMPLES — all real', band: 'purple',
    act: 'Design review returned seven leaking listing endpoints to detail design. Alpha review returned the receiving desk’s one-sided isolation. Verification and validation returned browser-authored positions. Manufacturability returned a clock mismatch between simulator and engine. Production verification returned a mislabelled routing encoding and an exhausted root volume. Pre-production validation returned an API that wedged with no memory limit. Field feedback returned a promised slot unrelated to the pickup time.' };
  const i2 = C.card(0, iterY, W, '↻', it);
  o.push(i2.svg);

  const H = iterY + i2.h + 16;
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="How to read the flow: execute applicable work, test acceptance criteria, progress or rework, the five gate decisions, and real iteration examples">${o.join('\n      ')}</svg>`;
}

// The figure set. A phase whose cards and gate together exceed the height a
// landscape A4 page has is split in two rather than scaled down — a figure
// shrunk to fit is a figure nobody can read.
const PHASES = [
  { id: 'p1', title: 'Phase 1 | Pre-Assessment', codes: ['NPDP1010', 'NPDP1020'], cols: 2, gate: 'NPDP1030', split: false },
  { id: 'p2', title: 'Phase 2 | Definition and Planning', codes: ['NPDP2010', 'NPDP2020', 'NPDP2030', 'NPDP2040', 'NPDP2050'], cols: 3, gate: 'NPDP2060', split: true },
  { id: 'p3a', title: 'Phase 3A | Design progression and recurring reviews', codes: ['NPDP3010', 'NPDP3020', 'NPDP3030'], cols: 3, banner: 'NPDP3040', split: false },
  { id: 'p3b', title: 'Phase 3B | Process, prototypes, verification and validation', codes: ['NPDP3050', 'NPDP3060', 'NPDP3070', 'NPDP3080', 'NPDP3090', 'NPDP3100', 'NPDP3110', 'NPDP3120'], cols: 2, gate: 'NPDP3130', split: true },
  // Eight cards plus the gate is five pixels past what a landscape page holds,
  // and the natural seam is preparation before verification anyway.
  { id: 'p4a', title: 'Phase 4A | Production preparation', codes: ['NPDP4010', 'NPDP4020', 'NPDP4030', 'NPDP4040'], cols: 2, split: false },
  { id: 'p4b', title: 'Phase 4B | Verification, validation and release review', codes: ['NPDP4050', 'NPDP4060', 'NPDP4070', 'NPDP4080'], cols: 2, gate: 'NPDP4090', split: true },
  { id: 'p5', title: 'Phase 5 | Launch and Post-Production', codes: ['NPDP5010', 'NPDP5020', 'NPDP5040', 'NPDP5050'], cols: 2, gate: 'NPDP5030', split: false },
];

const CAPS = {
  p1: 'Phase 1 — Pre-Assessment, and the Gate-1 decision with its three outcomes.',
  p2: 'Phase 2 — Definition and Planning. The Design History File is opened here and maintained through every later phase.',
  'p2-gate': 'Gate-2 — Plan Approval, and what happens on each outcome.',
  p3a: 'Phase 3A — concept, system and detail design, with the design review loop that spans all three.',
  p3b: 'Phase 3B — process design through to the intermediate project review.',
  'p3b-gate': 'Gate-3 — Design Approval, and what happens on each outcome.',
  p4a: 'Phase 4A — production preparation. Every rework loop in this phase returns through NPDP4010 ECO Release.',
  p4b: 'Phase 4B — verification and validation. Both procedures found faults that were invisible in the local environment.',
  'p4b-gate': 'Gate-4 — Production Approval, and what happens on each outcome.',
  p5: 'Phase 5 — Launch and Post-Production. Gate-5 approves readiness before NPDP5040 launch, not after it.',
};

const FIGURES = [
  { id: 'm1', svg: () => masterFlow(), cap: 'NPD master flow: the five phases with their procedure codes, the five gates beneath them, and the rework and action closure return.' },
];
for (const p of PHASES) {
  if (!p.split) {
    FIGURES.push({ id: p.id, svg: () => phaseFigure(p), cap: CAPS[p.id] });
  } else {
    FIGURES.push({ id: p.id, svg: () => phaseFigure({ ...p, only: 'cards' }), cap: CAPS[p.id] });
    FIGURES.push({ id: p.id + '-gate', svg: () => phaseFigure({ ...p, title: p.title + '  \u2014  gate decision', only: 'gate' }), cap: CAPS[p.id + '-gate'] });
  }
}
FIGURES.push({ id: 'guide', svg: () => guideFigure(), cap: 'How to read any of the flows: applicability, the acceptance test, progress or rework, and what each gate decides.' });

module.exports = { FIGURES, W };
