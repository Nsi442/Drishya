# NPD flowcharts

Drishya mapped onto the IQMS New Product Development Procedures Manual: eight
flowcharts and, under each, a table naming the artefact that carried out every
one of the 36 procedures.

| File | What it is |
|---|---|
| `../NPD Flowcharts_Drishya.docx` | The document |
| `drishya-data.js` | The mapping — every procedure, what it was here, and the evidence. Edit this, not Word |
| `charts.js` | Flowchart geometry. One template, so all seven phase figures read as one drawing |
| `overview.js` | Figure 1 (the lifecycle) and Figure 2 (the gate decision) |
| `render.js` | Writes `render.html`, the page the figures are screenshotted from |
| `img/` | The rendered figures at 3× |
| `data.js` | The same structure without Drishya's evidence, if a generic set is ever wanted |

## Rebuilding

```bash
cd release-docs/npd
node render.js                       # writes render.html
#  screenshot each #f* element from render.html at deviceScaleFactor 3 into img/
node build.js                        # writes ../NPD Flowcharts_Drishya.docx
```

The figures are PNGs rather than drawn in Word, because the geometry is
generated from the procedure list. Changing a procedure title changes the chart
on the next render; typing it into Word would not.

## Before submitting

1. **Rename** to `NPD Flowcharts_<Team>` or `NPD Flowcharts_<Empid>_<Name>`.
2. **Replace** `<Your Name / Emp ID>` on the title page.
3. **Check Section 4** — the gate outcomes (go, conditional go, recycle, hold,
   kill) are the standard stage-gate set, not necessarily yours.

The table of contents is a Word field; it fills in when the file is opened in
Word and reads as empty until then.

## What is inferred, and what is not

Every row in the evidence tables is a real file, commit, suite or fault. The
sequence follows the manual's own numbering.

Three things are inferred from standard practice rather than from the procedure
text, which was not available: the gate outcome vocabulary, the destination of
each rework loop, and the assumption that procedures run strictly in code order
with no overlap. Section 10 covers the two procedures adapted for a software
product; the rest is stated in the document where it applies.
