const fs = require('fs');
const { FIGURES } = require('./figures.js');

// Light only: these become images inside a Word document, whose page is white
// whatever the reader's machine is set to.
const css = `
  body { margin:0; background:#FFFFFF; font-family:"IBM Plex Sans","Segoe UI",sans-serif; }
  .shot { display:inline-block; background:#FFFFFF; padding:12px; }
  svg.flow { display:block; }

  .fig-title { font-family:"IBM Plex Sans","Segoe UI",sans-serif; font-size:15px; font-weight:600; fill:#1F3864; }
  .card { fill:#FFFFFF; stroke:#BFCAD2; stroke-width:1; }
  .card-adapted { stroke:#C8912B; stroke-dasharray:4 3; stroke-width:1.3; }
  .card-spine { stroke:#5B5BD6; stroke-width:1.5; }
  .card-banner { fill:#FFFDF6; stroke:#C8912B; }

  .band-blue   { fill:#1F6FB2; }
  .band-teal   { fill:#17627A; }
  .band-purple { fill:#5B5BD6; }
  .band-amber  { fill:#C8912B; }
  .band-green  { fill:#1E8449; }
  .band-red    { fill:#B3382C; }
  .out-approved { fill:#1E8449; }
  .out-action   { fill:#C8912B; }
  .out-reject   { fill:#B3382C; }

  .card-code  { font-family:"IBM Plex Mono",monospace; font-size:10px; font-weight:600; fill:#FFFFFF; }
  .card-title { font-size:10.5px; font-weight:600; fill:#FFFFFF; }
  .out-label  { font-size:10.5px; font-weight:700; fill:#FFFFFF; letter-spacing:.04em; }
  .card-body  { font-size:9.5px; fill:#1A2733; }
  .card-out   { font-size:9.5px; fill:#4A5A66; font-style:italic; }
  .card-out.first { fill:#17627A; }

  .edge { stroke:#7F939F; stroke-width:1.3; fill:none; }
  .ah { fill:#7F939F; }
  .loop { stroke:#B3382C; stroke-width:1.3; fill:none; stroke-dasharray:5 3; }
  .ah-loop { fill:#B3382C; }
  .rework { font-size:11px; font-weight:700; fill:#B3382C; letter-spacing:.06em; }

  .gate-d { fill:#FBF1DC; stroke:#C8912B; stroke-width:1.6; }
  .gate-code { font-family:"IBM Plex Mono",monospace; font-size:10px; font-weight:600; fill:#8A6209; }
  .gate-name { font-size:10.5px; font-weight:600; fill:#6E4207; }
  .gate-row  { font-family:"IBM Plex Sans","Segoe UI",sans-serif; font-size:12px; font-weight:700; fill:#8A6209; }
  .basis { font-size:9.5px; fill:#4A5A66; font-style:italic; }

  .mf-n    { font-family:"IBM Plex Mono",monospace; font-size:9px; font-weight:600; fill:#FFFFFF; letter-spacing:.08em; }
  .mf-name { font-size:10.5px; font-weight:600; fill:#FFFFFF; }
  .mf-code { font-size:9.5px; fill:#1A2733; }
`;

fs.writeFileSync('render.html', `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@450;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>${css}</style>
${FIGURES.map((f) => `<div class="shot" id="${f.id}">${f.svg()}</div>`).join('\n')}
`);
fs.writeFileSync('figs.json', JSON.stringify(FIGURES.map((f) => ({ id: f.id, cap: f.cap }))));
console.log('render.html written with', FIGURES.length, 'figures');
