/**
 * Renders every figure in render.html to img/<id>.png.
 *
 * This step used to be a README instruction telling a person to screenshot
 * twelve elements by hand. An instruction is not a build step: it is slow, it
 * is easy to do for eleven of them, and a figure that silently keeps its old
 * pixels while detail.js has moved on is a document that disagrees with its
 * own source.
 *
 *   node render.js && node shots.mjs && node build.js
 *
 * Figures are drawings, not screenshots of an application, so nothing here
 * needs the API, a login or a network. It is the local file only.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const figs = JSON.parse(readFileSync(resolve(here, 'figs.json'), 'utf8'))
mkdirSync(resolve(here, 'img'), { recursive: true })

// 3x for the same reason the report's shots are 1.5x: the body type in these
// cards is 9.5px and lands near 6pt on the page, so it needs the pixels to
// stay readable in print.
const SCALE = 3

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: SCALE })
await page.goto('file://' + resolve(here, 'render.html'))
// The figures are inline SVG with web-safe type, so there is no font or image
// load to wait on — but the layout still has to settle before the first clip.
await page.waitForTimeout(300)

for (const { id } of figs) {
  const el = await page.$('#' + id)
  if (!el) {
    console.error(`  MISSING  #${id} is in figs.json but not in render.html`)
    process.exitCode = 1
    continue
  }
  const box = await el.boundingBox()
  await el.screenshot({ path: resolve(here, `img/${id}.png`) })
  console.log(`  ${id.padEnd(10)} ${Math.round(box.width)} x ${Math.round(box.height)} css px`)
}

await browser.close()
console.log(`\n${figs.length} figures written to img/ at ${SCALE}x.`)
