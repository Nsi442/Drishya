// Card primitives for the detailed NPD figures.
//
// SVG has no text wrapping, so every body of text is broken into tspans here
// and each card's height follows from how many lines it needed. Nothing is a
// fixed height — a card that says more is taller, and the grid below it moves.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BODY_PX = 9.5;          // body type size
const CHAR_W = 4.62;          // measured average advance for IBM Plex Sans at 9.5px
const LINE_H = 12.6;
const PAD = 12;
const BAND_H = 24;

function wrap(text, widthPx) {
  const max = Math.floor((widthPx - PAD * 2) / CHAR_W);
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (next.length > max && line) { out.push(line); line = word; } else { line = next; }
  }
  if (line) out.push(line);
  return out;
}

/** How tall a card will be, without drawing it. */
function cardHeight(d, w) {
  const lines = wrap(d.act, w).length + (d.out ? wrap('Outputs: ' + d.out, w).length + 1 : 0);
  return BAND_H + PAD + lines * LINE_H + PAD;
}

/** One procedure: a coloured band carrying the code and title, then its body. */
function card(x, y, w, code, d) {
  const h = cardHeight(d, w);
  const o = [];
  const cls = 'band-' + (d.band || 'blue');
  o.push(`<rect class="card${d.adapted ? ' card-adapted' : ''}${d.spine ? ' card-spine' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`);
  o.push(`<path class="${cls}" d="M${x},${y + 4} a4,4 0 0 1 4,-4 h${w - 8} a4,4 0 0 1 4,4 v${BAND_H - 4} h-${w} Z"/>`);
  o.push(`<text class="card-code" x="${x + PAD}" y="${y + 16}">${esc(code)}</text>`);
  o.push(`<text class="card-title" x="${x + PAD + code.length * 5.6 + 12}" y="${y + 16}">| ${esc(d.title)}</text>`);

  let ty = y + BAND_H + PAD + 9;
  for (const line of wrap(d.act, w)) {
    o.push(`<text class="card-body" x="${x + PAD}" y="${ty}">${esc(line)}</text>`);
    ty += LINE_H;
  }
  if (d.out) {
    ty += LINE_H - 4;
    const outLines = wrap('Outputs: ' + d.out, w);
    outLines.forEach((line, i) => {
      o.push(`<text class="card-out${i === 0 ? ' first' : ''}" x="${x + PAD}" y="${ty}">${esc(line)}</text>`);
      ty += LINE_H;
    });
  }
  return { svg: o.join('\n      '), h };
}

/** A full-width banner — used for the design review loop that spans a stage. */
function banner(x, y, w, code, d) {
  const lines = wrap(d.act + '  ' + (d.out || ''), w);
  const h = BAND_H + PAD + lines.length * LINE_H + PAD;
  const o = [];
  o.push(`<rect class="card card-banner" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`);
  o.push(`<path class="band-amber" d="M${x},${y + 4} a4,4 0 0 1 4,-4 h${w - 8} a4,4 0 0 1 4,4 v${BAND_H - 4} h-${w} Z"/>`);
  o.push(`<text class="card-code" x="${x + PAD}" y="${y + 16}">${esc(code)}</text>`);
  o.push(`<text class="card-title" x="${x + PAD + code.length * 5.6 + 12}" y="${y + 16}">| ${esc(d.title)}</text>`);
  let ty = y + BAND_H + PAD + 9;
  for (const line of lines) {
    o.push(`<text class="card-body" x="${x + PAD}" y="${ty}">${esc(line)}</text>`);
    ty += LINE_H;
  }
  return { svg: o.join('\n      '), h };
}

/** The gate: a diamond, with its three outcomes as cards to the right. */
function gateBlock(x, y, w, code, d, arrowId) {
  const dw = 230, dh = 108, gap = 34;
  const ow = w - dw - gap;
  const outs = [
    { key: 'approved', label: 'APPROVED', cls: 'out-approved' },
    { key: 'action', label: 'ACTION ITEMS', cls: 'out-action' },
    { key: 'reject', label: 'REJECT / STOP', cls: 'out-reject' },
  ].filter((r) => d[r.key]);

  const heights = outs.map((r) => {
    const lines = wrap(d[r.key], ow).length;
    return BAND_H + PAD + lines * LINE_H + PAD;
  });
  const total = heights.reduce((a, b) => a + b, 0) + (outs.length - 1) * 14;
  const h = Math.max(total, dh);
  const o = [];

  const cx = x + dw / 2, cy = y + h / 2;
  o.push(`<path class="gate-d" d="M${cx},${cy - dh / 2} L${x + dw},${cy} L${cx},${cy + dh / 2} L${x},${cy} Z"/>`);
  o.push(`<text class="gate-code" x="${cx}" y="${cy - 8}" text-anchor="middle">${esc(code)}</text>`);
  o.push(`<text class="gate-name" x="${cx}" y="${cy + 10}" text-anchor="middle">${esc(d.title.replace(/^GATE-\d+ — /, 'GATE-' + d.gate + ' | '))}</text>`);

  let oy = y + (h - total) / 2;
  outs.forEach((r, i) => {
    const oh = heights[i];
    const my = oy + oh / 2;
    o.push(`<path class="edge" d="M${x + dw},${cy} C${x + dw + 16},${cy} ${x + dw + 16},${my} ${x + dw + gap - 4},${my}" marker-end="url(#arw-${arrowId})"/>`);
    o.push(`<rect class="card" x="${x + dw + gap}" y="${oy}" width="${ow}" height="${oh}" rx="4"/>`);
    o.push(`<path class="${r.cls}" d="M${x + dw + gap},${oy + 4} a4,4 0 0 1 4,-4 h${ow - 8} a4,4 0 0 1 4,4 v${BAND_H - 4} h-${ow} Z"/>`);
    o.push(`<text class="out-label" x="${x + dw + gap + PAD}" y="${oy + 16}">${esc(r.label)}</text>`);
    let ty = oy + BAND_H + PAD + 9;
    for (const line of wrap(d[r.key], ow)) {
      o.push(`<text class="card-body" x="${x + dw + gap + PAD}" y="${ty}">${esc(line)}</text>`);
      ty += LINE_H;
    }
    oy += oh + 14;
  });

  return { svg: o.join('\n      '), h };
}

function defs(id) {
  return `<defs>
      <marker id="arw-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path class="ah" d="M0,0 L10,5 L0,10 Z"/>
      </marker>
    </defs>`;
}

module.exports = { esc, wrap, card, cardHeight, banner, gateBlock, defs, BAND_H, PAD, LINE_H };
