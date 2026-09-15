// Shared house style for Drishya / TCS ILP RTTV documents.
const d = require('docx');
const fs = require('fs');

const NAVY = '1F3864';
const ACCENT = '2E75B6';
const FILL = 'EAF1F8';
const MUTED = '595959';
const RULE = 'BFBFBF';

const FONT = 'Calibri';
const CODE_FONT = 'Consolas';

// A4 (11906 dxa) less 1" margins on both sides.
const TEXT_WIDTH = 11906 - 1440 - 1440;

function body(text, opts = {}) {
  return new d.Paragraph({
    spacing: { line: 276, after: 160 },   // 1.15 lines, 8pt after
    alignment: d.AlignmentType.LEFT,
    children: [new d.TextRun({ text, font: FONT, size: 22, color: '000000', ...opts })],
  });
}

// A paragraph made of several runs, so a sentence can carry bold inline.
function rich(runs, opts = {}) {
  return new d.Paragraph({
    spacing: { line: 276, after: 160 },
    alignment: d.AlignmentType.LEFT,
    children: runs.map((r) =>
      typeof r === 'string'
        ? new d.TextRun({ text: r, font: FONT, size: 22, color: '000000' })
        : new d.TextRun({ font: FONT, size: 22, color: '000000', ...r })),
    ...opts,
  });
}

function h1(text) {
  return new d.Paragraph({
    heading: d.HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
    children: [new d.TextRun({ text, font: FONT, size: 28, bold: true, color: NAVY })],
  });
}

function h2(text) {
  return new d.Paragraph({
    heading: d.HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    children: [new d.TextRun({ text, font: FONT, size: 24, bold: true, color: ACCENT })],
  });
}

function h3(text) {
  return new d.Paragraph({
    heading: d.HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    children: [new d.TextRun({ text, font: FONT, size: 22, bold: true, italics: true, color: '000000' })],
  });
}

function bullet(text, level = 0) {
  return new d.Paragraph({
    numbering: { reference: 'house-bullets', level },
    spacing: { line: 276, after: 80 },
    children: [new d.TextRun({ text, font: FONT, size: 22, color: '000000' })],
  });
}

function numbered(text, level = 0) {
  return new d.Paragraph({
    numbering: { reference: 'house-numbers', level },
    spacing: { line: 276, after: 80 },
    children: [new d.TextRun({ text, font: FONT, size: 22, color: '000000' })],
  });
}

// One shaded block per command listing. Each line is its own paragraph;
// docx has no newline inside a run.
function code(lines) {
  const last = lines.length - 1;
  return lines.map((line, i) => new d.Paragraph({
    spacing: { line: 240, before: i === 0 ? 80 : 0, after: i === last ? 160 : 0 },
    shading: { type: d.ShadingType.CLEAR, fill: FILL, color: 'auto' },
    indent: { left: 120, right: 120 },
    children: [new d.TextRun({ text: line, font: CODE_FONT, size: 20, color: '000000' })],
  }));
}

function caption(text) {
  return new d.Paragraph({
    spacing: { before: 120, after: 60 },
    children: [new d.TextRun({ text, font: FONT, size: 18, italics: true, color: MUTED })],
  });
}

function cellPara(text, { bold = false, color = '000000', size = 20 } = {}) {
  return new d.Paragraph({
    spacing: { line: 240, before: 40, after: 40 },
    children: [new d.TextRun({ text, font: FONT, size, bold, color })],
  });
}

// Horizontal borders only, banded body rows, no outer box.
function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scaled = widths.map((w) => Math.round((w / total) * TEXT_WIDTH));

  const borders = {
    top: { style: d.BorderStyle.SINGLE, size: 4, color: RULE },
    bottom: { style: d.BorderStyle.SINGLE, size: 4, color: RULE },
    left: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  const headerRow = new d.TableRow({
    tableHeader: true,
    children: headers.map((text, i) => new d.TableCell({
      width: { size: scaled[i], type: d.WidthType.DXA },
      shading: { type: d.ShadingType.CLEAR, fill: ACCENT, color: 'auto' },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      borders,
      children: [cellPara(text, { bold: true, color: 'FFFFFF' })],
    })),
  });

  const bodyRows = rows.map((cells, r) => new d.TableRow({
    children: cells.map((text, i) => new d.TableCell({
      width: { size: scaled[i], type: d.WidthType.DXA },
      shading: r % 2 === 1
        ? { type: d.ShadingType.CLEAR, fill: FILL, color: 'auto' }
        : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      borders,
      children: [cellPara(text)],
    })),
  }));

  return new d.Table({
    columnWidths: scaled,
    width: { size: TEXT_WIDTH, type: d.WidthType.DXA },
    rows: [headerRow, ...bodyRows],
  });
}

/**
 * Reads a JPEG's pixel dimensions from its SOF marker.
 *
 * <p>The aspect ratio has to come from the file. Passing a height by hand means
 * every recapture at a different viewport silently stretches every figure, and
 * a stretched screenshot is the kind of thing nobody reports and everybody
 * notices.
 */
function jpegSize(file) {
  const buf = fs.readFileSync(file);
  let i = 2;                                  // past SOI
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue }
    const marker = buf[i + 1];
    // SOF0..SOF15, skipping the four that are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error(`no SOF marker in ${file}`);
}

/** The text column, in the px units docx image transformations take. */
const TEXT_PX = Math.round((TEXT_WIDTH / 1440) * 96);

/** One screenshot, scaled to a width in px, with its aspect ratio preserved. */
function image(file, widthPx = TEXT_PX) {
  const { width, height } = jpegSize(file);
  return new d.ImageRun({
    type: 'jpg',
    data: fs.readFileSync(file),
    transformation: { width: widthPx, height: Math.round(widthPx * height / width) },
  });
}

/** A full-width screenshot with its caption underneath. */
function figure(file, captionText, widthPx = TEXT_PX) {
  return [
    new d.Paragraph({
      spacing: { before: 160, after: 40 },
      alignment: d.AlignmentType.CENTER,
      children: [image(file, widthPx)],
    }),
    new d.Paragraph({
      spacing: { after: 200 },
      alignment: d.AlignmentType.CENTER,
      children: [new d.TextRun({ text: captionText, font: FONT, size: 18, italics: true, color: MUTED })],
    }),
  ];
}

/**
 * Several screenshots side by side, in a borderless table.
 *
 * <p>Phone screens are twice as tall as they are wide. Placed full width one
 * after another they would run to a page each, so they sit in a row and share
 * the column between them.
 */
function figureRow(files, captionText) {
  const each = Math.floor((TEXT_PX - 16 * (files.length - 1)) / files.length);
  const colDxa = Math.round(TEXT_WIDTH / files.length);
  const none = { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const borders = { top: none, bottom: none, left: none, right: none };
  return [
    new d.Table({
      columnWidths: files.map(() => colDxa),
      width: { size: colDxa * files.length, type: d.WidthType.DXA },
      rows: [new d.TableRow({
        children: files.map((f) => new d.TableCell({
          width: { size: colDxa, type: d.WidthType.DXA },
          borders,
          margins: { top: 40, bottom: 40, left: 40, right: 40 },
          children: [new d.Paragraph({
            alignment: d.AlignmentType.CENTER,
            spacing: { after: 0 },
            children: [image(f, each)],
          })],
        })),
      })],
    }),
    new d.Paragraph({
      spacing: { before: 60, after: 200 },
      alignment: d.AlignmentType.CENTER,
      children: [new d.TextRun({ text: captionText, font: FONT, size: 18, italics: true, color: MUTED })],
    }),
  ];
}

function spacer() {
  return new d.Paragraph({ spacing: { after: 120 }, children: [] });
}

module.exports = {
  d, NAVY, ACCENT, FILL, MUTED, FONT, CODE_FONT, TEXT_WIDTH,
  body, rich, h1, h2, h3, bullet, numbered, code, caption, table, spacer,
  image, figure, figureRow, jpegSize, TEXT_PX,
};
