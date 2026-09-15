# NPD flowcharts

Drishya through all thirty-six procedures of the IQMS New Product Development
Procedures Manual, drawn in the manual's own card style: each procedure carries
the activity chain that was followed and the output it produced, and each gate
carries its three outcomes and the basis it was decided on.

Twelve figures, landscape throughout.

| File | What it is |
|---|---|
| `../NPD Flowcharts_Drishya.docx` | The document |
| `detail.js` | **The content.** Every procedure's activity chain and outputs. Edit here, not in Word |
| `cards.js` | Card, banner and gate primitives, including the text wrapping SVG does not have |
| `figures.js` | Figure composition: the master flow, each phase, and the closing guide |
| `render.js` | Writes `render.html`, the page the figures are screenshotted from |
| `build.js` | Assembles the document |
| `img/` | The rendered figures at 3x |

## Rebuilding

```bash
cd release-docs/npd
node render.js     # writes render.html
#  screenshot each #<id> element from render.html at deviceScaleFactor 3 into img/
node build.js      # writes ../NPD Flowcharts_Drishya.docx
```

## Two constraints worth knowing before editing

**Height budget.** A landscape A4 with 1in margins gives 9.69in of width and
only 6.27in of height. Less a heading and caption, a figure must come in under
about 604 css px at 1100 wide. `render.js` prints each figure's height; a phase
that outgrows the budget is split, which is why Phase 2, 3B and 4B put their
gate on a separate figure and Phase 4 is split at the preparation/verification
seam. Scaling a figure down to fit is not the answer: the body type is already
at 9.5px and lands at about 6pt on the page.

**Landscape width is 16838 dxa, not 11906.** Using the portrait figure put
every drawing at 6.27in on a 9.69in page, wasting a third of the width and
shrinking the type for no reason. `build.js` derives both the image width and
the table width from `TEXT_WIDTH_LAND`.

## Before submitting

1. **Rename** to `NPD Flowcharts_<Team>` or `NPD Flowcharts_<Empid>_<Name>`.
2. **Replace** `<Your Name / Emp ID>` on the title page.
3. **Check the gate outcomes** — approved / action items / reject-stop is the
   standard set; use your manual's wording if it differs.

The table of contents is a Word field; it fills in when the file is opened in
Word and reads as empty until then.

## What is real and what is inferred

Every activity chain and every Outputs line describes something that actually
happened: a file, a commit, a suite with its count, or a fault that was found
and fixed. The eight rework loops in Section 11 are all real findings.

Inferred from standard practice, because the procedure text itself was not
available: the gate outcome vocabulary, and the assumption that procedures run
in code order with no overlap. Section 10 covers the two procedures adapted for
a software product.
