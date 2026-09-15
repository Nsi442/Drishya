const fs = require('fs');
const { phases } = require('./drishya-data.js');
const { phaseChart } = require('./charts.js');
const { masterMap, gatePattern } = require('./overview.js');

// Figures, in document order. Phase 3 is two figures because thirteen steps in
// one column is taller than an A4 text block.
const figs = [
  { id: 'f1', svg: masterMap() },
  { id: 'f2', svg: gatePattern() },
  { id: 'f3', svg: phaseChart(phases[0]) },
  { id: 'f4', svg: phaseChart(phases[1]) },
  { id: 'f5a', svg: phaseChart(phases[2], { from: 0, to: 7, entry: 'Gate 2 passed' }) },
  { id: 'f5b', svg: phaseChart(phases[2], { from: 7, to: 13, entry: 'Continued from Figure 5a', last: true }) },
  { id: 'f6', svg: phaseChart(phases[3]) },
  { id: 'f7', svg: phaseChart(phases[4]) },
];

// Light theme only: these become images inside a Word document, which has a
// white page whatever the reader's OS is set to.
const css = `
  body { margin:0; background:#FFFFFF; font-family:"IBM Plex Sans","Segoe UI",sans-serif; }
  .shot { display:inline-block; background:#FFFFFF; padding:10px; }
  svg.flow { display:block; }
  .box { fill:#FFFFFF; stroke:#C7D2D9; stroke-width:1; }
  .box-spine { stroke:#0E5C73; stroke-width:1.6; }
  .box-adapted { stroke:#A8680F; stroke-dasharray:4 3; }
  .tab { fill:#E4EAEE; }
  .tab-rule { stroke:#C7D2D9; stroke-width:1; }
  .code { font-family:"IBM Plex Mono",monospace; font-size:11.5px; font-weight:600; fill:#0E5C73; }
  .title { font-size:12.5px; fill:#101A21; }
  .title.sm { font-size:11.5px; }
  .edge { stroke:#7F939F; stroke-width:1.4; fill:none; }
  .ah { fill:#7F939F; }
  .loop { stroke:#8C3A2E; stroke-width:1.3; fill:none; stroke-dasharray:5 3; }
  .ah-loop { fill:#8C3A2E; }
  .loop-label, .loop-label-h { font-size:10.5px; fill:#8C3A2E; }
  .loop-label-h { font-size:11.5px; }
  .offchart { font-size:9px; fill:#8C3A2E; font-family:"IBM Plex Mono",monospace; }
  .offchart.em { font-weight:600; }
  .exit-label { font-size:10.5px; fill:#8C3A2E; font-family:"IBM Plex Mono",monospace; }
  .term { fill:#EDF1F4; stroke:#C7D2D9; }
  .term-text { font-size:11.5px; fill:#56666F; }
  .gate { fill:#FAF1E1; stroke:#A8680F; stroke-width:1.6; }
  .gate-n { font-family:"IBM Plex Sans Condensed",sans-serif; font-size:16px; font-weight:700; fill:#A8680F; }
  .gate-code { font-family:"IBM Plex Mono",monospace; font-size:10.5px; fill:#A8680F; }
  .gate-title { font-size:12.5px; font-weight:500; fill:#6E4207; }
  .spine-note { font-size:10px; fill:#0E5C73; font-style:italic; }
  .mp { fill:#FFFFFF; stroke:#C7D2D9; }
  .mp-n { font-family:"IBM Plex Sans Condensed",sans-serif; font-size:11px; font-weight:700; letter-spacing:.1em; fill:#0E5C73; }
  .mp-name { font-family:"IBM Plex Sans Condensed",sans-serif; font-size:15px; font-weight:600; fill:#101A21; }
  .mp-name.sm { font-size:13px; }
  .mp-range { font-family:"IBM Plex Mono",monospace; font-size:10.5px; fill:#56666F; }
  .mp-cap { font-family:"IBM Plex Sans Condensed",sans-serif; font-size:10px; font-weight:700; letter-spacing:.14em; fill:#7F939F; }
  .mg { fill:#FAF1E1; stroke:#A8680F; stroke-width:1.5; }
  .mg-n { font-family:"IBM Plex Sans Condensed",sans-serif; font-size:11px; font-weight:700; letter-spacing:.09em; fill:#A8680F; }
  .bracket { stroke:#7F939F; stroke-width:1.2; fill:none; }
  .out { fill:#FFFFFF; stroke:#C7D2D9; }
  .out-go { stroke:#1F6B4A; stroke-width:1.6; }
  .out-kill { stroke:#8C3A2E; stroke-width:1.6; }
  .out-t { font-size:12px; font-weight:600; fill:#101A21; }
  .out-d { font-size:10.5px; fill:#56666F; text-anchor:end; }
`;

fs.writeFileSync('render.html', `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@450;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&display=swap">
<style>${css}</style>
${figs.map((f) => `<div class="shot" id="${f.id}">${f.svg}</div>`).join('\n')}
`);
fs.writeFileSync('figs.json', JSON.stringify(figs.map((f) => f.id)));
console.log('render.html written with', figs.length, 'figures');
