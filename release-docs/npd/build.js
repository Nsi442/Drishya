const fs = require('fs');
const path = require('path');
const S = require('../generator/style.js');
const d = S.d;
const { detail } = require('./detail.js');

const IMG = (n) => path.join(__dirname, 'img', n + '.png');
const FIGS = JSON.parse(fs.readFileSync(path.join(__dirname, 'figs.json'), 'utf8'));
const TITLE = 'Flowchart on NPD Procedures Manual';
const SUBTITLE = 'Drishya — real-time transport visibility, through the IQMS New Product Development procedure set';

// Landscape throughout: these are wide card-based flowcharts, and a portrait
// column puts their body type under 6pt.
const LAND = { size: { orientation: d.PageOrientation.LANDSCAPE }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } };
// A4 LONG edge (16838 dxa), not the short one. Using 11906 here put every
// figure at portrait width on a landscape page — 3.4 inches of the drawing
// thrown away, and the body type smaller than it needed to be.
const TEXT_WIDTH_LAND = 16838 - 2880;
const TEXT_PX_LAND = Math.round((TEXT_WIDTH_LAND / 1440) * 96);

const header = () => ({ default: new d.Header({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ text: `${TITLE} — Drishya`, font: S.FONT, size: 18, color: S.MUTED })] })] }) });
const footer = () => ({ default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [
  new d.TextRun({ text: 'Page ', font: S.FONT, size: 18, color: S.MUTED }),
  new d.TextRun({ children: [d.PageNumber.CURRENT], font: S.FONT, size: 18, color: S.MUTED }),
  new d.TextRun({ text: ' of ', font: S.FONT, size: 18, color: S.MUTED }),
  new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES], font: S.FONT, size: 18, color: S.MUTED }),
] })] }) });

/** A figure at full text width, with its numbered caption beneath. */
function figure(id, n) {
  const f = FIGS.find((x) => x.id === id);
  return [
    new d.Paragraph({
      spacing: { before: 120, after: 40 }, alignment: d.AlignmentType.CENTER,
      children: [S.image(IMG(id), TEXT_PX_LAND)],
    }),
    new d.Paragraph({
      spacing: { after: 100 }, alignment: d.AlignmentType.CENTER,
      children: [new d.TextRun({ text: `Figure ${n}: ${f.cap}`, font: S.FONT, size: 18, italics: true, color: S.MUTED })],
    }),
    new d.Paragraph({ children: [new d.PageBreak()] }),
  ];
}

// Section number, figure number and page follow the figure order, so nothing
// has to be renumbered by hand when a figure is added.
const PAGES = [
  { fig: 'm1', h: '3.  NPD master flow' },
  { fig: 'p1', h: '4.  Phase 1 | Pre-Assessment' },
  { fig: 'p2', h: '5.  Phase 2 | Definition and Planning' },
  { fig: 'p2-gate' },
  { fig: 'p3a', h: '6.  Phase 3 | Product and Process Design' },
  { fig: 'p3b' },
  { fig: 'p3b-gate' },
  { fig: 'p4a', h: '7.  Phase 4 | Production Preparation and Design Validation' },
  { fig: 'p4b' },
  { fig: 'p4b-gate' },
  { fig: 'p5', h: '8.  Phase 5 | Launch and Post-Production' },
  { fig: 'guide', h: '9.  General guide to read the flow' },
];

const figureBody = PAGES.flatMap((p, i) => [
  ...(p.h ? [S.h1(p.h)] : []),
  ...figure(p.fig, i + 1),
]);

const adapted = Object.entries(detail).filter(([, v]) => v.adapted);

const doc = new d.Document({
  creator: 'Drishya', title: TITLE, description: SUBTITLE,
  styles: {
    default: {
      document: { run: { font: S.FONT, size: 22, color: '000000' }, paragraph: { spacing: { line: 276, after: 160 } } },
      title: { run: { font: S.FONT, size: 40, bold: true, color: S.NAVY } },
      heading1: { run: { font: S.FONT, size: 28, bold: true, color: S.NAVY }, paragraph: { spacing: { before: 240, after: 100 } } },
      heading2: { run: { font: S.FONT, size: 24, bold: true, color: S.ACCENT }, paragraph: { spacing: { before: 200, after: 80 } } },
      heading3: { run: { font: S.FONT, size: 22, bold: true, italics: true, color: '000000' } },
      heading4: { run: { font: S.FONT, size: 22, bold: true, color: '000000' } },
      heading5: { run: { font: S.FONT, size: 22, bold: true, color: '000000' } },
      heading6: { run: { font: S.FONT, size: 22, bold: true, color: '000000' } },
      hyperlink: { run: { font: S.FONT, size: 22, color: '000000' } },
      listParagraph: { run: { font: S.FONT, size: 22, color: '000000' } },
      strong: { run: { font: S.FONT, bold: true } },
    },
  },
  numbering: { config: [
    { reference: 'house-bullets', levels: [
      { level: 0, format: d.LevelFormat.BULLET, text: '•', alignment: d.AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 360 } }, run: { font: S.FONT, size: 22 } } },
    ] },
    { reference: 'house-numbers', levels: [
      { level: 0, format: d.LevelFormat.DECIMAL, text: '%1.', alignment: d.AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 360 } }, run: { font: S.FONT, size: 22 } } },
    ] },
  ] },
  features: { updateFields: true },
  sections: [
    { properties: { page: LAND },
      children: [
        new d.Paragraph({ spacing: { before: 900, after: 0 }, children: [] }),
        new d.Paragraph({ spacing: { after: 60 }, children: [new d.TextRun({ text: TITLE, font: S.FONT, size: 40, bold: true, color: S.NAVY })] }),
        new d.Paragraph({ spacing: { after: 100 }, children: [new d.TextRun({ text: SUBTITLE, font: S.FONT, size: 24, color: S.MUTED })] }),
        new d.Paragraph({ spacing: { after: 160 }, border: { bottom: { style: d.BorderStyle.SINGLE, size: 16, color: S.ACCENT, space: 2 } }, children: [] }),
        new d.Paragraph({ spacing: { after: 0 }, children: [new d.TextRun({ text: '<Your Name / Emp ID>  ·  15 September 2026  ·  Version 2.0', font: S.FONT, size: 18, color: S.MUTED })] }),
        new d.Paragraph({ spacing: { before: 400, after: 0 }, children: [new d.TextRun({ text: 'IQMS Enablers · New Product Development Procedures Manual', font: S.FONT, size: 18, color: S.MUTED })] }),
      ] },
    { properties: { page: LAND }, headers: header(), footers: footer(),
      children: [
        S.h1('Table of Contents'),
        new d.TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
        new d.Paragraph({ children: [new d.PageBreak()] }),

        S.h1('1.  Purpose'),
        S.body(
          'This document takes Drishya — a real-time transport visibility platform for vendors delivering into ' +
          'marketplace fulfilment centres — through all thirty-six procedures of the NPD Procedures Manual. ' +
          'Each procedure card carries the activity chain that was actually followed and the output it produced, ' +
          'and each gate carries its three outcomes and the basis on which it was decided.'),
        S.rich([
          { text: 'Nothing on these cards is written to fill a box. ', bold: true },
          'Every output names a file, a commit, a test suite with its count, or a fault that was found and fixed. ' +
          'The dashed returns and the findings quoted under Outputs are real: eight faults were caught at a review ' +
          'or a verification and sent work back to an earlier procedure.']),
        S.caption('Table 1: The project these flowcharts describe.'),
        S.table(['', ''], [
          ['Product', 'Drishya — real-time transport visibility (RTTV)'],
          ['Type', 'Software platform. Hardware is out of scope by a Phase 1 screening decision'],
          ['Development window', '15 August 2026 to 15 September 2026'],
          ['Change records', '73 commits on the main branch'],
          ['Source', '170 Java files, 124 frontend files, 13 database migrations'],
          ['Verification', '4 independent suites — 82 API assertions, a tenancy write audit, 39 pages in a browser, 26 interaction journeys'],
          ['Deployment', 'One CloudFormation stack: EC2, RDS PostgreSQL 16 with PostGIS'],
        ], [20, 80], TEXT_WIDTH_LAND),
        new d.Paragraph({ children: [new d.PageBreak()] }),

        S.h1('2.  How to read the cards'),
        S.caption('Table 2: The drawing conventions used in every figure.'),
        S.table(['Element', 'Meaning'], [
          ['Card with a coloured band', 'One procedure. The band carries its NPDP code and title; the body carries the activity chain that was followed'],
          ['Outputs line, in italic', 'What the procedure produced — named so a reviewer can go and look at it'],
          ['Card with a dashed amber edge', 'An adapted procedure: written for a physical product, carried out in the form this product takes. See Section 10'],
          ['Card with a solid violet edge', 'A spine procedure — not a step passed through once, but a record every later procedure files into'],
          ['Amber diamond', 'A gate. The flow cannot continue through it without a decision'],
          ['Green / amber / red branch', 'The three gate outcomes: approved, action items, or reject and stop'],
          ['Solid grey arrow', 'Normal forward flow, left to right then down'],
          ['Dashed red arrow', 'Rework and action closure — work returning to an earlier procedure'],
        ], [26, 74], TEXT_WIDTH_LAND),
        new d.Paragraph({ children: [new d.PageBreak()] }),

        ...figureBody,

        S.h1('10.  Adapted procedures'),
        S.body(
          'Two procedures are written for the development of a physical product. Neither was skipped. Both were ' +
          'carried out in the form this product takes, both are drawn with a dashed amber edge, and both are ' +
          'recorded here so the adaptation is visible rather than assumed.'),
        S.caption('Table 3: Procedures adapted for a software product.'),
        S.table(['Procedure', 'Why it does not apply literally', 'What was done instead'], [
          ['NPDP3090\nTooling & Equipment Planning',
           'No physical tooling to plan, no jigs, fixtures or moulds, and no equipment to install on a line.',
           'The build and deployment toolchain, planned to the same purpose: two Dockerfiles, docker-compose for the local environment, the CloudFormation template for the deployed one, and the Testcontainers and Playwright estates any build must pass before release.'],
          ['NPDP4020\nProduction Sourcing Preparation',
           'No bill of materials to source and no supplier to qualify.',
           'Cloud resources selected and sized with the same discipline: region ap-south-1, EC2 and RDS sized to the workload, and a load balancer, NAT gateway and multi-AZ database each ruled out on record because they bill hourly and none was needed.'],
        ], [22, 28, 50], TEXT_WIDTH_LAND),

        S.h1('11.  Rework and action closure'),
        S.body(
          'Eight faults were caught at a review or a verification and sent work back. Taken together they are the ' +
          'strongest evidence that the gates did their job — each was found before a user met it.'),
        S.caption('Table 4: Every rework loop, and what caused it.'),
        S.table(['Found at', 'Returned to', 'What was wrong'], [
          ['NPDP2050', 'NPDP2020', 'The wire contract was not settled; enum values and timestamp format had to be fixed before the plan could be approved'],
          ['NPDP3040', 'NPDP3030', 'Every inherited listing endpoint returned all tenants’ rows to any authenticated caller'],
          ['NPDP3070', 'NPDP3030', 'The receiving desk is cross-tenant by design, which hid that it is still bounded to one site'],
          ['NPDP3100', 'NPDP3030', 'The browser was authoring vehicle positions, so three signed-in users saw three different answers'],
          ['NPDP3110', 'NPDP3050', 'The simulator and the prediction engine kept different clocks, so the vehicle arrived before the estimate moved'],
          ['NPDP4050', 'NPDP4010', 'The routing service mislabelled its reply encoding, so every booking silently drew a straight line'],
          ['NPDP4050', 'NPDP4010', 'The instance root volume filled, and a deploy died inside a build layer reporting a disk error as a build failure'],
          ['NPDP4060', 'NPDP4010', 'The API wedged under memory pressure with no limit and no watchdog, recoverable only by reboot'],
        ], [14, 14, 72], TEXT_WIDTH_LAND),
        S.body(
          'The ninth is still running: NPDP5050 routes field feedback back to NPDP4010 as an engineering change. ' +
          'The most recent was a consignment booked through the form that never appeared on the receiving desk’s ' +
          'board, because the promised slot was a flat 36 hours from booking rather than costed from the pickup time.'),

        S.h1('12.  List of figures'),
        ...PAGES.map((p, i) => S.numbered(`Figure ${i + 1}: ${FIGS.find((x) => x.id === p.fig).cap}`)),
      ] },
  ],
});

d.Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2] || path.join(__dirname, '..', 'NPD Flowcharts_Drishya.docx');
  fs.writeFileSync(out, buf);
  console.log('wrote', out, (buf.length / 1024).toFixed(0), 'KB');
});
