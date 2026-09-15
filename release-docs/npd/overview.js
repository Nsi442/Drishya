const { esc } = require('./charts.js');

// Figure 1 — the whole lifecycle, left to right, with the gates drawn as
// barriers that interrupt the flow. Phase 5 is two blocks with Gate 5 genuinely
// between them, because the manual numbers it that way: NPDP5030 approves
// readiness and NPDP5040 launch follows it.
function masterMap() {
  const TY = 80, TH = 96, GW = 26;
  const o = [];

  const blocks = [
    { n: 1, l1: 'Concept and', l2: 'Screening', range: 'NPDP1010–1030', x: 20, w: 150 },
    { n: 2, l1: 'Definition and', l2: 'Planning', range: 'NPDP2010–2060', x: 220, w: 150 },
    { n: 3, l1: 'Design and', l2: 'Development', range: 'NPDP3010–3130', x: 420, w: 150 },
    { n: 4, l1: 'Production', l2: 'Validation', range: 'NPDP4010–4090', x: 620, w: 150 },
  ];
  const p5a = { x: 820, w: 116 }, p5g = { x: 948, w: GW }, p5b = { x: 986, w: 104 };
  const gates = [{ n: 1, x: 182 }, { n: 2, x: 382 }, { n: 3, x: 582 }, { n: 4, x: 782 }, { n: 5, x: p5g.x }];

  o.push(`<defs>
      <marker id="arw-map" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path class="ah" d="M0,0 L10,5 L0,10 Z"/>
      </marker>
      <marker id="arwl-map" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path class="ah-loop" d="M0,0 L10,5 L0,10 Z"/>
      </marker>
    </defs>`);

  // The spine runs under everything, so each block and gate sits on one line.
  o.push(`<line class="edge" x1="20" y1="${TY + TH / 2}" x2="${p5b.x + p5b.w}" y2="${TY + TH / 2}"/>`);

  for (const b of blocks) {
    o.push(`<rect class="mp" x="${b.x}" y="${TY}" width="${b.w}" height="${TH}" rx="3"/>`);
    o.push(`<text class="mp-n" x="${b.x + 14}" y="${TY + 26}">PHASE ${b.n}</text>`);
    o.push(`<text class="mp-name" x="${b.x + 14}" y="${TY + 50}">${esc(b.l1)}<tspan x="${b.x + 14}" dy="15">${esc(b.l2)}</tspan></text>`);
    o.push(`<text class="mp-range" x="${b.x + 14}" y="${TY + TH - 12}">${esc(b.range)}</text>`);
  }

  for (const b of [{ ...p5a, l1: 'Prepare and', l2: 'review', range: 'NPDP5010–5020' },
                   { ...p5b, l1: 'Launch and', l2: 'feedback', range: 'NPDP5040–5050' }]) {
    o.push(`<rect class="mp" x="${b.x}" y="${TY}" width="${b.w}" height="${TH}" rx="3"/>`);
    o.push(`<text class="mp-name sm" x="${b.x + 12}" y="${TY + 34}">${esc(b.l1)}<tspan x="${b.x + 12}" dy="14">${esc(b.l2)}</tspan></text>`);
    o.push(`<text class="mp-range" x="${b.x + 12}" y="${TY + TH - 12}">${esc(b.range)}</text>`);
  }

  // The bracket that says those two blocks are one phase.
  const by = TY - 22;
  o.push(`<path class="bracket" d="M${p5a.x},${by + 8} V${by} H${p5b.x + p5b.w} V${by + 8}"/>`);
  o.push(`<text class="mp-n" x="${(p5a.x + p5b.x + p5b.w) / 2}" y="${by - 7}" text-anchor="middle">PHASE 5 · LAUNCH AND FEEDBACK</text>`);

  for (const g of gates) {
    o.push(`<rect class="mg" x="${g.x}" y="${TY - 10}" width="${GW}" height="${TH + 20}" rx="2"/>`);
    o.push(`<text class="mg-n" x="${g.x + GW / 2}" y="${TY + TH / 2}" text-anchor="middle" transform="rotate(-90 ${g.x + GW / 2} ${TY + TH / 2})">GATE ${g.n}</text>`);
  }

  // The return that makes this a cycle rather than a line.
  const ly = TY + TH + 46;
  o.push(`<path class="loop" d="M${p5b.x + p5b.w},${TY + TH / 2} V${ly} H95 V${TY + TH + 4}" marker-end="url(#arwl-map)"/>`);
  o.push(`<text class="loop-label-h" x="560" y="${ly - 9}" text-anchor="middle">NPDP5050 feedback and corrective action re-enter at NPDP4010, lessons learned at NPDP1010</text>`);

  o.push(`<text class="mp-cap" x="20" y="34">STAGE</text>`);
  o.push(`<text class="mp-cap" x="182" y="34">GATE</text>`);

  return `<svg class="flow" viewBox="0 0 1130 ${ly + 30}" width="1130" height="${ly + 30}" role="img" aria-label="The five NPD phases in sequence separated by five gates, with Gate 5 between the two halves of phase 5, and a feedback return from NPDP5050 to NPDP4010 and NPDP1010">${o.join('\n      ')}</svg>`;
}

// Figure 2 — what happens at every one of the five gates. Drawn once because
// the pattern repeats; the phase charts then only name the gate.
function gatePattern() {
  const o = [];
  o.push(`<defs>
      <marker id="arw-gp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path class="ah" d="M0,0 L10,5 L0,10 Z"/>
      </marker>
    </defs>`);

  ['Phase deliverables complete', 'Gate checklist signed off', 'Design History File current']
    .forEach((t, i) => {
      const y = 38 + i * 46;
      o.push(`<rect class="box" x="14" y="${y}" width="196" height="34" rx="3"/>`);
      o.push(`<text class="title sm" x="26" y="${y + 21}">${esc(t)}</text>`);
      o.push(`<line class="edge" x1="210" y1="${y + 17}" x2="250" y2="${y + 17}" marker-end="url(#arw-gp)"/>`);
    });

  o.push(`<path class="gate" d="M268,28 H352 L366,113 L352,198 H268 L254,113 Z"/>`);
  o.push(`<text class="gate-n" x="310" y="100" text-anchor="middle">GATE</text>`);
  o.push(`<text class="gate-title" x="310" y="122" text-anchor="middle">Gate keepers review</text>`);
  o.push(`<text class="gate-code" x="310" y="142" text-anchor="middle">panel per NPDP1020</text>`);

  [
    { t: 'Go', d: 'next phase authorised', cls: 'out-go' },
    { t: 'Conditional go', d: 'proceed, actions tracked', cls: '' },
    { t: 'Recycle', d: 'rework, then re-present', cls: '' },
    { t: 'Hold', d: 'work stops, project open', cls: '' },
    { t: 'Kill', d: 'closed, learning filed', cls: 'out-kill' },
  ].forEach((r, i) => {
    const y = 14 + i * 40;
    o.push(`<path class="edge" d="M366,113 C400,113 400,${y + 15} 434,${y + 15}" marker-end="url(#arw-gp)"/>`);
    o.push(`<rect class="out ${r.cls}" x="440" y="${y}" width="216" height="30" rx="3"/>`);
    o.push(`<text class="out-t" x="452" y="${y + 19}">${esc(r.t)}</text>`);
    o.push(`<text class="out-d" x="646" y="${y + 19}">${esc(r.d)}</text>`);
  });

  return `<svg class="flow" viewBox="0 0 680 220" width="680" height="220" role="img" aria-label="The gate decision pattern: phase deliverables, gate checklist and Design History File go to the gate keeper panel, which returns go, conditional go, recycle, hold or kill">${o.join('\n      ')}</svg>`;
}

module.exports = { masterMap, gatePattern };
