# Release documentation

The deliverables for the TCS ILP batch release checklist, and the code that
builds them.

## What is here

| File | What it is |
|---|---|
| `Final MVP Report_Drishya.docx` | The Final MVP Report. Purpose, components, source code, outputs, issues and fixes, and how to stand the product up in a new environment |
| `generator/report.js` | The content of that report, as data. Edit here, not in Word — a hand-edit in Word is lost the next time this runs |
| `generator/style.js` | The house style: Calibri throughout, navy `#1F3864` headings, `#2E75B6` accents, banded tables with horizontal rules only |
| `generator/shots.mjs` | Captures the 17 screenshots, signed in as all three roles |
| `generator/shots/` | Those screenshots. The report reads them from here |

## Rebuilding it

```bash
cd release-docs/generator
npm install docx            # only the first time
node report.js "../Final MVP Report_Drishya.docx"
```

## Recapturing the screenshots

**Do this before the presentation.** The committed shots were taken where
outbound access to `tile.openstreetmap.org` is blocked, so on the four screens
that carry a map — the vendor dashboard and the consignment detail among them —
the pins and the route are drawn but the basemap behind them is blank. Every
other screen is exactly what the product looks like. Recapturing on a machine
that can reach the tile server fixes it, and the figure captions still read
correctly either way.

Start the stack, then:

```bash
node release-docs/generator/shots.mjs release-docs/generator/shots
cd release-docs/generator && node report.js "../Final MVP Report_Drishya.docx"
```

The script signs in as each role and navigates **inside** the application
rather than with `page.goto`. That is not a style preference: the bearer token
is held in a module variable and never persisted, so a full page load signs the
session out, and an earlier version of exactly this script captured 39 photographs
of the login screen and reported success.

Two screens need staging before they show anything, because a freshly seeded
database has not got there yet:

- **Receiving** lists consignments at a bay. Gate one in at FC Bhiwandi and put
  it on a dock first, or the page is an honest but unhelpful empty state.
- **Vendor analytics** plots prediction accuracy scored against actual dock-in.
  A database seeded minutes ago has no scored predictions, so it says so. It is
  left out of the report for that reason rather than because it does not work.

## Before uploading

Three things the checklist requires that this repository cannot know:

1. **Rename the file** to `Final MVP Report_<Team>` or
   `Final MVP Report_<Empid>_<Name>`, per the naming convention.
2. **Replace the author line** on the title page — it reads
   `<Your Name / Emp ID>`.
3. **Paste the Team Folder link** to the uploaded dashboard zip into §5.6. It
   is the one run in the document deliberately set in red, so it cannot be
   missed.

The table of contents is a Word field. It fills in when the document is opened
in Word — the file is marked to update fields on open — and reads as empty
until then.

## The dashboard zip

Not committed: it is built from this repository, so committing it would store a
second copy that can disagree with the first.

```bash
cd "Drishya Frontend"
zip -qr ../Drishya_WebDashboard_Source.zip drishya_frontend \
    -x "drishya_frontend/node_modules/*" "drishya_frontend/dist/*"
```

172 files, about 330 KB. `node_modules` and `dist` are excluded because
`npm install && npm run build` regenerates both.
