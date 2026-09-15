const fs = require('fs');
const path = require('path');
const S = require('../generator/style.js');
const d = S.d;
const { phases } = require('./drishya-data.js');

const IMG = (n) => path.join(__dirname, 'img', n + '.png');
const TITLE = 'NPD Procedure Flowcharts';
const SUBTITLE = 'Drishya — mapped onto the IQMS New Product Development Procedures Manual';

// Figures in document order. Phase 3 is two figures because thirteen steps in
// one column is taller than an A4 text block.
const FIGS = [
  { id: 'f1', n: '1', cap: 'The five phases and five gates, end to end. Gate 5 sits between the two halves of Phase 5, not after it.' },
  { id: 'f2', n: '2', cap: 'The decision taken at every gate. Drawn once because the pattern is identical at all five.' },
  { id: 'f3', n: '3', cap: 'Phase 1 — Concept and Screening (NPDP1010–1030), terminating at Gate 1.' },
  { id: 'f4', n: '4', cap: 'Phase 2 — Definition and Planning (NPDP2010–2060), terminating at Gate 2.' },
  { id: 'f5a', n: '5a', cap: 'Phase 3 — Design and Development, first part (NPDP3010–3070).' },
  { id: 'f5b', n: '5b', cap: 'Phase 3 — Design and Development, second part (NPDP3080–3130), terminating at Gate 3.' },
  { id: 'f6', n: '6', cap: 'Phase 4 — Production Validation (NPDP4010–4090), terminating at Gate 4.' },
  { id: 'f7', n: '7', cap: 'Phase 5 — Launch and Feedback (NPDP5010–5050), with Gate 5 at NPDP5030.' },
];
const fig = (id) => FIGS.find((f) => f.id === id);

/** A figure sized to the text column, with its numbered caption beneath. */
function figure(id, widthPx = S.TEXT_PX) {
  const f = fig(id);
  return [
    new d.Paragraph({
      spacing: { before: 160, after: 40 }, alignment: d.AlignmentType.CENTER,
      children: [S.image(IMG(id), widthPx)],
    }),
    new d.Paragraph({
      spacing: { after: 220 }, alignment: d.AlignmentType.CENTER,
      children: [new d.TextRun({ text: `Figure ${f.n}: ${f.cap}`, font: S.FONT, size: 18, italics: true, color: S.MUTED })],
    }),
  ];
}

/** Procedure, what it was here, and the artefact that proves it. */
function evidenceTable(p) {
  return S.table(
    ['Procedure', 'In Drishya', 'Evidence'],
    p.steps.map((s) => [`${s.code}\n${s.title}`, s.was, s.ev]),
    [22, 22, 56]);
}

const phaseSections = phases.map((p) => {
  const figs = p.n === 3 ? ['f5a', 'f5b'] : [{ 1: 'f3', 2: 'f4', 4: 'f6', 5: 'f7' }[p.n]];
  return [
    S.h1(`${p.n + 4}.  Phase ${p.n} — ${p.name}`),
    S.rich([
      { text: p.range + '   ', font: S.CODE_FONT, size: 20, color: S.ACCENT },
      `${p.steps.length} procedures · terminates at Gate ${p.gate.n}`,
    ]),
    S.body(p.intent),
    ...figs.flatMap((id) => figure(id)),
    S.h2(`${p.n + 4}.1  Procedure evidence`),
    S.caption(`Table ${p.n + 2}: Every procedure in Phase ${p.n}, and what carried it out in this project.`),
    evidenceTable(p),
    new d.Paragraph({ children: [new d.PageBreak()] }),
  ];
}).flat();

const allLoops = phases.flatMap((p) => p.loops.map((l) => ({ ...l, phase: p.n })));

const doc = new d.Document({
  creator: 'Drishya', title: TITLE, description: SUBTITLE,
  styles: {
    default: {
      document: { run: { font: S.FONT, size: 22, color: '000000' }, paragraph: { spacing: { line: 276, after: 160 } } },
      title: { run: { font: S.FONT, size: 40, bold: true, color: S.NAVY } },
      heading1: { run: { font: S.FONT, size: 28, bold: true, color: S.NAVY }, paragraph: { spacing: { before: 360, after: 120 } } },
      heading2: { run: { font: S.FONT, size: 24, bold: true, color: S.ACCENT }, paragraph: { spacing: { before: 240, after: 80 } } },
      heading3: { run: { font: S.FONT, size: 22, bold: true, italics: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 60 } } },
      heading4: { run: { font: S.FONT, size: 22, bold: true, color: '000000' } },
      heading5: { run: { font: S.FONT, size: 22, bold: true, color: '000000' } },
      heading6: { run: { font: S.FONT, size: 22, bold: true, color: '000000' } },
      hyperlink: { run: { font: S.FONT, size: 22, color: '000000' } },
      listParagraph: { run: { font: S.FONT, size: 22, color: '000000' } },
      strong: { run: { font: S.FONT, bold: true } },
    },
  },
  numbering: {
    config: [
      { reference: 'house-bullets', levels: [
        { level: 0, format: d.LevelFormat.BULLET, text: '•', alignment: d.AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 360 } }, run: { font: S.FONT, size: 22 } } },
        { level: 1, format: d.LevelFormat.BULLET, text: '–', alignment: d.AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: S.FONT, size: 22 } } },
      ] },
      { reference: 'house-numbers', levels: [
        { level: 0, format: d.LevelFormat.DECIMAL, text: '%1.', alignment: d.AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 360 } }, run: { font: S.FONT, size: 22 } } },
      ] },
    ],
  },
  features: { updateFields: true },
  sections: [
    // Title page — no header, no footer.
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        new d.Paragraph({ spacing: { before: 1200, after: 0 }, children: [] }),
        new d.Paragraph({ spacing: { after: 60 }, children: [new d.TextRun({ text: TITLE, font: S.FONT, size: 40, bold: true, color: S.NAVY })] }),
        new d.Paragraph({ spacing: { after: 100 }, children: [new d.TextRun({ text: SUBTITLE, font: S.FONT, size: 24, color: S.MUTED })] }),
        new d.Paragraph({ spacing: { after: 160 }, border: { bottom: { style: d.BorderStyle.SINGLE, size: 16, color: S.ACCENT, space: 2 } }, children: [] }),
        new d.Paragraph({ spacing: { after: 0 }, children: [new d.TextRun({ text: '<Your Name / Emp ID>  ·  15 September 2026  ·  Version 1.0', font: S.FONT, size: 18, color: S.MUTED })] }),
        new d.Paragraph({ spacing: { before: 600, after: 0 }, children: [new d.TextRun({ text: 'IQMS Enablers · New Product Development Procedures Manual', font: S.FONT, size: 18, color: S.MUTED })] }),
      ],
    },
    // Body, part one.
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new d.Header({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ text: `${TITLE} — Drishya`, font: S.FONT, size: 18, color: S.MUTED })] })] }) },
      footers: { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [
        new d.TextRun({ text: 'Page ', font: S.FONT, size: 18, color: S.MUTED }),
        new d.TextRun({ children: [d.PageNumber.CURRENT], font: S.FONT, size: 18, color: S.MUTED }),
        new d.TextRun({ text: ' of ', font: S.FONT, size: 18, color: S.MUTED }),
        new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES], font: S.FONT, size: 18, color: S.MUTED }),
      ] })] }) },
      children: [
        S.h1('Table of Contents'),
        new d.TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
        new d.Paragraph({ children: [new d.PageBreak()] }),

        S.h1('1.  Purpose'),
        S.body(
          'This document shows Drishya — a real-time transport visibility platform for vendors delivering ' +
          'into marketplace fulfilment centres — passing through the procedure set defined in the IQMS New ' +
          'Product Development Procedures Manual. It contains eight flowcharts and, beneath each, a table ' +
          'naming the artefact that carried out every procedure.'),
        S.rich([
          { text: 'Nothing in the evidence tables is written to fill a row. ', bold: true },
          'Every entry is a file in the repository, a commit, a test suite with a count, or a fault that was ' +
          'found and fixed. Where a procedure was written for physical product development and has no literal ' +
          'equivalent in software, it is marked as adapted and Section 10 says what carries the same weight ' +
          'instead — it is not quietly skipped.']),
        S.caption('Table 1: The project these flowcharts describe.'),
        S.table(['', ''], [
          ['Product', 'Drishya — real-time transport visibility (RTTV)'],
          ['Type', 'Software platform. Hardware is out of scope by a Phase 1 screening decision'],
          ['Development window', '15 August 2026 to 15 September 2026'],
          ['Change records', '73 commits on the main branch'],
          ['Source', '170 Java files, 124 frontend files, 13 database migrations'],
          ['Verification', '4 independent suites — 82 API assertions, a tenancy write audit, 39 pages in a browser, 26 interaction journeys'],
          ['Deployment', 'One CloudFormation stack: EC2, RDS PostgreSQL 16 with PostGIS'],
        ], [24, 76]),

        S.h1('2.  How to read the flowcharts'),
        S.caption('Table 2: The drawing conventions used in every figure.'),
        S.table(['Symbol', 'Meaning'], [
          ['Rounded pill', 'Entry or exit condition — what must be true to arrive here, or what is true on leaving'],
          ['Box with a code tab', 'One procedure. The tab carries its NPDP number, the body its title'],
          ['Box with a dashed amber edge', 'An adapted procedure — see Section 9'],
          ['Box with a solid teal edge', 'A spine procedure: not a step passed through once, but a record every later procedure files into'],
          ['Amber chevron', 'A gate. The flow cannot continue through it without a decision (Figure 2)'],
          ['Solid grey arrow', 'Normal forward flow'],
          ['Dashed red arrow', 'Rework — work returning to an earlier procedure because a review or a verification failed'],
        ], [26, 74]),
        S.rich([
          'The dashed returns are the part worth reading closely. A chart that only runs top to bottom says ' +
          'nothing the contents page does not; ',
          { text: 'the eight rework loops in this document are all real', bold: true },
          ' — each one is a fault that was found at that procedure and sent work back to the one named.',
        ]),
        new d.Paragraph({ children: [new d.PageBreak()] }),
      ],
    },
    // Figure 1 lands on its own landscape page: 1,130 points of drawing squeezed
    // into a 16 cm portrait column puts the labels below 5pt.
    {
      properties: {
        page: {
          size: { orientation: d.PageOrientation.LANDSCAPE },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: new d.Header({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ text: `${TITLE} — Drishya`, font: S.FONT, size: 18, color: S.MUTED })] })] }) },
      footers: { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [
        new d.TextRun({ text: 'Page ', font: S.FONT, size: 18, color: S.MUTED }),
        new d.TextRun({ children: [d.PageNumber.CURRENT], font: S.FONT, size: 18, color: S.MUTED }),
      ] })] }) },
      children: [
        S.h1('3.  The lifecycle'),
        S.body('Drishya passed through all five phases and all five gates. This page is landscape because the map is wider than a portrait column can carry legibly.'),
        ...figure('f1', 930),
      ],
    },
    // Body, part two.
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new d.Header({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ text: `${TITLE} — Drishya`, font: S.FONT, size: 18, color: S.MUTED })] })] }) },
      footers: { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [
        new d.TextRun({ text: 'Page ', font: S.FONT, size: 18, color: S.MUTED }),
        new d.TextRun({ children: [d.PageNumber.CURRENT], font: S.FONT, size: 18, color: S.MUTED }),
        new d.TextRun({ text: ' of ', font: S.FONT, size: 18, color: S.MUTED }),
        new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES], font: S.FONT, size: 18, color: S.MUTED }),
      ] })] }) },
      children: [
        S.h1('4.  What happens at a gate'),
        S.body(
          'The same decision is taken at all five gates, so it is drawn once. The gate keeper panel appointed ' +
          'under NPDP1020 reviews the phase deliverables against the gate checklist, with the Design History ' +
          'File current, and returns one of five outcomes.'),
        ...figure('f2'),
        S.rich([
          { text: 'Check the outcome vocabulary against your own procedure text. ', bold: true },
          'Go, conditional go, recycle, hold and kill are the standard stage-gate set; some manuals carry a ' +
          'shorter one or name them differently.',
        ]),
        new d.Paragraph({ children: [new d.PageBreak()] }),

        ...phaseSections,

        S.h1('10.  Adapted procedures'),
        S.body(
          'Two procedures in the manual are written for the development of a physical product. Neither was ' +
          'skipped. Both were carried out in the form the product actually takes, and both are marked in the ' +
          'flowcharts with a dashed amber edge.'),
        S.caption('Table 8: Procedures adapted for a software product, and what carried them.'),
        S.table(['Procedure', 'Why it does not apply literally', 'What was done instead'], [
          ['NPDP3090\nProduction Tooling and Equipment Planning',
           'There is no physical tooling to plan, no jigs, fixtures or moulds, and no equipment to install on a line.',
           'The build and deployment toolchain was planned and built to the same purpose: two Dockerfiles, docker-compose for the local environment, the CloudFormation template for the deployed one, and the Testcontainers and Playwright estates any build must pass before release.'],
          ['NPDP4020\nProduction Sourcing Preparation',
           'There is no bill of materials to source and no supplier to qualify.',
           'Cloud resources were selected and sized with the same discipline: region ap-south-1, EC2 and RDS sized to the workload, and a load balancer, NAT gateway and multi-AZ database each ruled out on record because they bill hourly and none was needed.'],
        ], [24, 30, 46]),

        S.h1('11.  Rework loops'),
        S.body(
          'Eight faults sent work back to an earlier procedure. They are collected here because, taken ' +
          'together, they are the strongest evidence that the gates did their job — each was caught at a ' +
          'review or a verification rather than by a user.'),
        S.caption('Table 9: Every rework loop in the flowcharts, and what caused it.'),
        S.table(['Found at', 'Returned to', 'What was wrong'], [
          ['NPDP2050', 'NPDP2020', 'The wire contract was not settled: enum values and timestamp format had to be fixed before the plan could be approved'],
          ['NPDP3040', 'NPDP3030', 'Every inherited listing endpoint returned all tenants’ rows to any authenticated caller'],
          ['NPDP3070', 'NPDP3030', 'The receiving desk is cross-tenant by design, which hid that it is still bounded to one site'],
          ['NPDP3100', 'NPDP3030', 'The browser was authoring vehicle positions, so three signed-in users saw three different answers'],
          ['NPDP3110', 'NPDP3050', 'The simulator and the prediction engine kept different clocks, so the vehicle arrived before the estimate moved'],
          ['NPDP4050', 'NPDP4010', 'The routing service mislabelled its reply encoding, so every booking silently drew a straight line'],
          ['NPDP4050', 'NPDP4010', 'The instance root volume filled, and a deploy died inside a build layer reporting a disk error as a build failure'],
          ['NPDP4060', 'NPDP4010', 'The API wedged under memory pressure with no limit and no watchdog, recoverable only by reboot'],
        ], [16, 16, 68]),
        S.body(
          'The closing loop in Figure 1 is the ninth and it is still running: NPDP5050 routes field feedback ' +
          'back to NPDP4010 as an engineering change. The most recent example is a consignment booked through ' +
          'the form that never appeared on the receiving desk’s board, because the promised slot was a flat ' +
          '36 hours from booking rather than costed from the pickup time.'),

        S.h1('12.  List of figures'),
        ...FIGS.map((f) => S.numbered(`Figure ${f.n}: ${f.cap}`)),
      ],
    },
  ],
});

d.Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2] || path.join(__dirname, '..', 'NPD Flowcharts_Drishya.docx');
  fs.writeFileSync(out, buf);
  console.log('wrote', out, (buf.length / 1024).toFixed(0), 'KB');
});
