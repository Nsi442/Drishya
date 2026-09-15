/**
 * Captures the screenshots that go into the Final MVP Report.
 *
 * Signs in once per role and then navigates INSIDE the application, never with
 * page.goto — the bearer token lives in a module variable and is never
 * persisted, so a full page load signs the session out and every shot would be
 * of the login screen.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'

const BASE = 'http://127.0.0.1:5173'
const OUT = process.argv[2] ?? './shots'
mkdirSync(OUT, { recursive: true })

// The driver portal is a phone app that happens to run in a browser. Shot at
// desktop width it renders a narrow column adrift in white space, which
// misrepresents it — so each role is captured at the size it is designed for.
// 1600 wide, not 1280: the rail takes 380px, and at 1280 the arrival board's
// variance column — the one that carries the whole promised-versus-predicted
// point — was clipped off the right edge.
const VIEWPORT = {
  vendor_admin: { width: 1600, height: 900 },
  fc: { width: 1600, height: 900 },
  driver: { width: 430, height: 880 },
}

// Enough pixels to stay sharp printed at 16 cm wide, without making the
// document enormous. The phone shots can afford more; they are half the width.
const SCALE = { vendor_admin: 1.5, fc: 1.5, driver: 2.5 }

const SHOTS = {
  vendor_admin: [
    ['01-vendor-dashboard', '/vendor'],
    ['02-vendor-shipments', '/vendor/shipments'],
    ['03-vendor-new-shipment', '/vendor/shipments/new'],
    ['04-vendor-shipment-detail', '/vendor/shipments/:id'],
    ['05-vendor-live-trips', '/vendor/trips'],
    ['06-vendor-documents', '/vendor/documents'],
    ['07-vendor-analytics', '/vendor/analytics'],
  ],
  driver: [
    ['08-driver-today', '/driver'],
    ['09-driver-trip', '/driver/trip/:id'],
    ['10-driver-checklist', '/driver/trip/:id/checklist'],
    ['11-driver-pod', '/driver/trip/:id/pod'],
  ],
  fc: [
    ['12-fc-dashboard', '/fc'],
    ['13-fc-arrival-board', '/fc/inbound'],
    ['14-fc-yard', '/fc/yard'],
    ['15-fc-dock-scheduler', '/fc/docks'],
    ['16-fc-receiving', '/fc/receiving'],
    ['17-fc-analytics', '/fc/analytics'],
  ],
}

async function shipmentIdFor(role) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  const { token } = await res.json()
  const list = await fetch(`${BASE}/api/shipments/all`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  if (!Array.isArray(list) || !list.length) return null
  // Prefer something moving: a live consignment makes a far better picture of
  // the product than one sitting in CREATED.
  const moving = list.find((s) => ['in_transit', 'at_gate', 'at_dock'].includes(s.status))
  return (moving ?? list[0]).id
}

const report = []

const browser = await chromium.launch()
for (const [role, shots] of Object.entries(SHOTS)) {
  const id = await shipmentIdFor(role)
  const context = await browser.newContext({
    viewport: VIEWPORT[role],
    deviceScaleFactor: SCALE[role],
    isMobile: role === 'driver',
    hasTouch: role === 'driver',
  })
  const page = await context.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const buttonFor = { vendor_admin: /vendor/i, driver: /driver/i, fc: /fulfilment|centre/i }
  await page.getByRole('button', { name: buttonFor[role] }).first().click({ timeout: 10000 })
  await page.waitForURL(/\/(vendor|driver|fc)/, { timeout: 20000 })
  await page.waitForTimeout(2500)

  for (const [name, template] of shots) {
    const route = template.replace(':id', id ?? 'none')
    await page.evaluate((r) => {
      window.history.pushState({}, '', r)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, route)
    // Long enough for the first data load, the chart animation and any map
    // tiles to settle. A chart caught mid-animation is a chart at zero height.
    await page.waitForTimeout(4000)
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}

    const landed = new URL(page.url()).pathname
    const text = (await page.locator('body').innerText()).trim().length
    const buf = await page.screenshot({ type: 'jpeg', quality: 88, fullPage: false })
    writeFileSync(`${OUT}/${name}.jpg`, buf)
    report.push({ name, route, landed, text, bytes: buf.length })
    console.log(`${name.padEnd(28)} ${String(text).padStart(6)} chars  ${(buf.length/1024).toFixed(0)} KB  ${landed}`)
  }
  await context.close()
}
await browser.close()

const thin = report.filter((r) => r.text < 300 || r.landed === '/login')
if (thin.length) {
  console.log('\nSUSPECT — too little text, or bounced to login:')
  thin.forEach((r) => console.log(`  ${r.name}  ${r.text} chars  landed ${r.landed}`))
}
console.log(`\n${report.length - thin.length}/${report.length} shots look like real pages`)
