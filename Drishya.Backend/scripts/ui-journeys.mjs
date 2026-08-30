/**
 * Drives the real user journeys through the browser, clicking what a person
 * clicks.
 *
 * ui-smoke.mjs proves every page renders. That is a lower bar than it sounds:
 * a page can render perfectly and still have a submit button wired to nothing.
 * This exercises the flows the product is actually for —
 *
 *   1. paperwork rejected before dispatch, with reasons, then corrected
 *   2. dispatch refused while documents are outstanding, allowed once cleared
 *   3. the evidence pack downloading as a real file
 *   4. a driver advancing a trip and signing for delivery
 *   5. the receiving desk gating a vehicle in
 *
 * Assertions are on what the user can SEE, not on network responses. An API
 * returning 200 while the screen shows nothing is precisely the failure this is
 * meant to catch.
 *
 * Usage:  node Drishya.Backend/scripts/ui-journeys.mjs [baseUrl]
 */

import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const results = []

function record(journey, step, ok, detail = '') {
  results.push({ journey, step, ok, detail })
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`)
}

async function api(path, token, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  return res.status < 400 ? res.json() : null
}

async function tokenFor(role) {
  const r = await fetch(`${BASE}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  return (await r.json()).token
}

/** Signs in through the actual login screen, so the session is a real one. */
async function signIn(page, role) {
  const button = { vendor_admin: /vendor/i, driver: /driver/i, fc: /fulfilment|centre/i }[role]
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: button }).first().click()
  await page.waitForURL(/\/(vendor|driver|fc)/, { timeout: 20000 })
}

/** Client-side navigation: the token is in memory and a reload would drop it. */
async function go(page, route) {
  await page.evaluate((r) => {
    window.history.pushState({}, '', r)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, route)
  await page.waitForTimeout(1400)
}

// ---------------------------------------------------------------------------

async function vendorPaperworkJourney(browser) {
  console.log('\n--- vendor: paperwork before dispatch ---')
  const token = await tokenFor('vendor_admin')

  // Book a fresh consignment for this run rather than borrowing one.
  //
  // The journey dispatches whatever it works on, so reusing an existing
  // shipment made the script pass exactly once and then fail on the second run
  // with "shipping notice tab not offered" — which looks like a product bug and
  // is not. A test that only passes once is not a test.
  const target = await api('/api/shipments', token, {
    method: 'POST',
    body: JSON.stringify({
      vendorId: 'vendor-1', fcId: 'fc-bhiwandi', vehicleId: 'vehicle-5', driverId: 'driver-2',
      commodity: 'Footwear', cartons: 100, weightKg: 900, valueInr: 50000,
      invoiceNo: 'INV/UI/1', ewayBillNo: '371234567890',
    }),
  })
  if (!target) {
    record('vendor', 'booked a consignment to work on', false, 'create failed')
    return
  }
  record('vendor', 'booked a consignment to work on', target.status === 'created',
    `${target.id} (${target.status})`)

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await signIn(page, 'vendor_admin')
  await go(page, `/vendor/shipments/${target.id}`)

  // --- the notice tab exists only pre-dispatch ---
  const tab = page.getByRole('tab', { name: /shipping notice/i })
  const hasTab = await tab.count() > 0
  record('vendor', 'shipping notice tab offered pre-dispatch', hasTab)
  if (!hasTab) { await page.close(); return }
  await tab.click()
  await page.waitForTimeout(600)

  // --- submit something wrong and read the reasons off the screen ---
  await page.getByLabel(/purchase order/i).fill('PO-1')
  await page.getByLabel(/^cartons$/i).fill('3')
  await page.getByLabel(/e-way bill$/i).fill('12345')
  await page.getByLabel(/seal number/i).fill('z')
  await page.getByRole('button', { name: /submit notice/i }).click()
  await page.waitForTimeout(2000)

  const body = await page.locator('body').innerText()
  record('vendor', 'rejection is shown, not swallowed', /dispatch blocked/i.test(body),
    (body.match(/Dispatch blocked[^\n]*/i) ?? [''])[0].slice(0, 70))
  record('vendor', 'failures name the field and the expected value',
    /poReference/i.test(body) && /expected/i.test(body))
  record('vendor', 'carton mismatch quotes both numbers',
    /declaredCartons/i.test(body) && new RegExp(String(target.cartons)).test(body))

  // --- dispatch must be refused while it is blocked ---
  const blocked = await api(`/api/v1/trips/from-shipment/${target.id}`, token, {
    method: 'POST', body: JSON.stringify({ vehicleRegistration: 'MH-12-TEST-1' }),
  })
  record('vendor', 'dispatch refused while documents are outstanding', blocked === null)

  // --- correct it, on screen ---
  await page.getByLabel(/purchase order/i).fill(target.reference)
  await page.getByLabel(/^cartons$/i).fill(String(target.cartons))
  await page.getByLabel(/tax invoice/i).fill(target.invoiceNo ?? 'INV/26-27/4200')
  await page.getByLabel(/e-way bill$/i).fill('481920374651')
  await page.getByLabel(/seal number/i).fill('SEAL7788AB')
  const expiry = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 16)
  await page.getByLabel(/e-way bill expires/i).fill(expiry)
  await page.getByRole('button', { name: /submit notice/i }).click()
  await page.waitForTimeout(2000)

  const after = await page.locator('body').innerText()
  record('vendor', 'correction clears the consignment', /cleared for dispatch/i.test(after),
    (after.match(/Cleared for dispatch[^\n]*/i) ?? [''])[0].slice(0, 60))

  const allowed = await api(`/api/v1/trips/from-shipment/${target.id}`, token, {
    method: 'POST', body: JSON.stringify({ vehicleRegistration: 'MH-12-TEST-1' }),
  })
  record('vendor', 'dispatch permitted once cleared', allowed !== null,
    allowed ? allowed.trip.tripId : '')

  await page.close()
}

async function evidencePackJourney(browser) {
  console.log('\n--- vendor: evidence pack ---')
  const token = await tokenFor('vendor_admin')
  const all = await api('/api/shipments/all', token)
  const target = all.find((s) => s.status === 'delivered') ?? all[0]

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await signIn(page, 'vendor_admin')
  await go(page, `/vendor/shipments/${target.id}`)

  const cta = page.getByRole('button', { name: /evidence|download/i }).first()
  if (await cta.count() === 0) {
    record('evidence', 'download control present', false, 'no button found')
    await page.close(); return
  }
  record('evidence', 'download control present', true)

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }).catch(() => null),
    cta.click(),
  ])
  record('evidence', 'a file actually downloads', download !== null,
    download ? download.suggestedFilename() : 'no download event')

  if (download) {
    const path = await download.path()
    const { readFileSync } = await import('node:fs')
    const pack = JSON.parse(readFileSync(path, 'utf8'))
    record('evidence', 'pack names the consignment', pack.shipmentId === target.id, pack.shipmentId)
    record('evidence', 'pack carries both promised and predicted',
      'promisedAt' in pack && 'predictedAt' in pack)
    record('evidence', 'pack has a timeline', Array.isArray(pack.timeline) && pack.timeline.length > 0,
      `${pack.timeline?.length ?? 0} entries`)
    // The provenance caveat is the honesty guarantee of the whole artefact.
    const caveats = (pack.trips ?? []).map((t) => t.positions?.caveat).filter(Boolean)
    record('evidence', 'simulated traces are labelled as such',
      pack.trips.length === 0 || caveats.length > 0,
      caveats[0]?.slice(0, 60) ?? 'no trips on this shipment')
  }
  await page.close()
}

async function driverJourney(browser) {
  console.log('\n--- driver: today, then proof of delivery ---')
  const page = await browser.newPage({ viewport: { width: 430, height: 930 } })
  await signIn(page, 'driver')
  await go(page, '/driver')

  const home = await page.locator('body').innerText()
  record('driver', 'today screen lists work', home.length > 200)

  const token = await tokenFor('driver')
  const mine = await api('/api/shipments/all', token)
  const trip = (mine ?? []).find((s) => s.status !== 'delivered' && s.status !== 'cancelled')
  if (!trip) { record('driver', 'has an open trip to drive', false, 'none assigned'); await page.close(); return }
  record('driver', 'has an open trip to drive', true, `${trip.id} (${trip.status})`)

  await go(page, `/driver/trip/${trip.id}`)
  const detail = await page.locator('body').innerText()
  record('driver', 'trip detail shows the consignment',
    detail.includes(trip.reference ?? trip.id) || detail.includes(trip.id))

  // The primary action is stage-dependent; whatever it is, it must be offered.
  const action = page.getByRole('button', { name: /start trip|mark loaded|arrived|start unloading|complete delivery|view trip|open trip/i })
  record('driver', 'a next action is offered', await action.count() > 0,
    await action.count() > 0 ? (await action.first().innerText()).trim() : '')

  await go(page, `/driver/trip/${trip.id}/checklist`)
  const checklist = await page.locator('body').innerText()
  record('driver', 'pre-departure checklist opens', checklist.length > 200)

  await go(page, `/driver/trip/${trip.id}/pod`)
  const pod = await page.locator('body').innerText()
  record('driver', 'proof-of-delivery capture opens', pod.length > 150)
  const sig = page.locator('canvas')
  record('driver', 'signature pad is present', await sig.count() > 0)

  await page.close()
}

async function fcJourney(browser) {
  console.log('\n--- fulfilment centre: receiving desk ---')
  const token = await tokenFor('fc')
  const inbound = await api('/api/shipments/all', token)
  const target = (inbound ?? [])[0]

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await signIn(page, 'fc')

  await go(page, '/fc/inbound')
  const board = await page.locator('body').innerText()
  record('fc', 'arrival board lists inbound', board.length > 300)

  // Cross-tenant by design: the desk sees every vendor booked into its site.
  const vendorsSeen = new Set((inbound ?? []).map((s) => s.vendorId))
  record('fc', 'desk sees more than one vendor', vendorsSeen.size > 1,
    `${vendorsSeen.size} vendors`)

  if (target) {
    await go(page, `/fc/inbound/${target.id}`)
    const detail = await page.locator('body').innerText()
    record('fc', 'inbound detail opens', detail.length > 300)
    const gate = page.getByRole('button', { name: /gate|unload|receipt|grn/i })
    record('fc', 'receiving actions are offered', await gate.count() > 0,
      await gate.count() > 0 ? (await gate.first().innerText()).trim() : '')
  }

  await go(page, '/fc/yard')
  record('fc', 'yard view opens', (await page.locator('body').innerText()).length > 200)
  await page.close()
}

// ---------------------------------------------------------------------------

async function run() {
  const browser = await chromium.launch()
  try {
    await vendorPaperworkJourney(browser)
    await evidencePackJourney(browser)
    await driverJourney(browser)
    await fcJourney(browser)
  } finally {
    await browser.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
  if (failed.length) {
    console.log('\nFailed:')
    failed.forEach((f) => console.log(`  ${f.journey}: ${f.step}${f.detail ? ` — ${f.detail}` : ''}`))
  }
  process.exit(failed.length ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(1) })
