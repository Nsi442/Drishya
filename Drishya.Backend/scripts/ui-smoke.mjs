/**
 * Walks every page of the app in a real browser, as every role.
 *
 * The API suite proves the backend answers correctly. It proved that happily on
 * the day the frontend could not sign in at all, because the bundle was calling
 * an unprefixed path and nginx was answering 405 — a fault invisible to curl and
 * to `npm run build`, and visible in about one second to a browser.
 *
 * So this is the layer that was missing. For each route it records:
 *   - console errors (a React crash shows up here first)
 *   - failed network requests, with the status
 *   - whether the page actually rendered content or an error boundary
 *
 * Usage:  node Drishya.Backend/scripts/ui-smoke.mjs [baseUrl]
 */

import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'

/** Routes per portal. Parameterised ones get a real id substituted at run time. */
const ROUTES = {
  vendor_admin: [
    '/vendor', '/vendor/shipments', '/vendor/shipments/new', '/vendor/shipments/:id',
    '/vendor/live-map', '/vendor/trips', '/vendor/exceptions', '/vendor/documents',
    '/vendor/appointments', '/vendor/carriers', '/vendor/drivers', '/vendor/analytics',
    '/vendor/alerts', '/vendor/settings',
  ],
  driver: [
    '/driver', '/driver/trip/:id', '/driver/trip/:id/checklist', '/driver/trip/:id/pod',
    '/driver/scan', '/driver/incident', '/driver/documents', '/driver/history',
    '/driver/profile',
  ],
  fc: [
    '/fc', '/fc/inbound', '/fc/inbound/:id', '/fc/docks', '/fc/appointments',
    '/fc/yard', '/fc/receiving', '/fc/exceptions', '/fc/vendors', '/fc/analytics',
    '/fc/settings',
  ],
}

const PUBLIC = ['/login', '/signup', '/forgot-password', '/reset-password', '/no-such-page']

/** Noise that is not a fault: tile 404s, favicon, ResizeObserver chatter. */
function isNoise(text) {
  return /favicon|ResizeObserver|tile\.openstreetmap|Download the React DevTools/i.test(text)
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
  return Array.isArray(list) && list.length ? list[0].id : null
}

async function run() {
  const browser = await chromium.launch()
  const results = []

  for (const [role, routes] of Object.entries(ROUTES)) {
    const id = await shipmentIdFor(role)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()

    // Sign in once per role via the demo button, then reuse the session. The
    // token lives in memory only, so a fresh context would be signed out.
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.evaluate(async (r) => {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: r }),
      })
      window.__seed = await res.json()
    }, role)

    const buttonFor = { vendor_admin: /vendor/i, driver: /driver/i, fc: /fulfilment|centre/i }
    try {
      await page.getByRole('button', { name: buttonFor[role] }).first().click({ timeout: 8000 })
      await page.waitForURL(/\/(vendor|driver|fc)/, { timeout: 15000 })
    } catch {
      results.push({ role, route: '(sign in)', errors: ['could not sign in via the demo button'], failed: [], text: 0 })
      await context.close()
      continue
    }

    for (const template of routes) {
      const route = template.replace(':id', id ?? 'none')
      const errors = []
      const failed = []

      const onConsole = (m) => {
        if (m.type() === 'error' && !isNoise(m.text())) errors.push(m.text().slice(0, 160))
      }
      const onPageError = (e) => errors.push('UNCAUGHT: ' + String(e).slice(0, 160))
      const onResponse = (r) => {
        if (r.status() >= 400 && !isNoise(r.url())) {
          failed.push(`${r.status()} ${r.url().replace(BASE, '')}`)
        }
      }

      page.on('console', onConsole)
      page.on('pageerror', onPageError)
      page.on('response', onResponse)

      let text = 0
      let landed = ''
      try {
        // Client-side navigation, NOT page.goto. The bearer token is held in a
        // module variable and never persisted, so a full page load signs the
        // session out — an earlier version of this script used goto and every
        // single route silently rendered the login page while reporting "ok".
        // Identical character counts across 39 unrelated pages was the tell.
        await page.evaluate((r) => {
          window.history.pushState({}, '', r)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }, route)
        await page.waitForTimeout(1500)
        text = (await page.locator('body').innerText()).trim().length

        // A map that exists but has collapsed to zero height renders as a blank
        // white box while every element check passes. Counting markers said the
        // map worked; it was invisible. Presence is not visibility.
        const map = page.locator('.leaflet-container').first()
        if (await map.count() > 0) {
          const box = await map.boundingBox()
          if (!box || box.height < 50 || box.width < 50) {
            errors.push(`map container collapsed: ${box ? `${box.width}x${box.height}` : 'no box'}`)
          }
        }
        landed = new URL(page.url()).pathname
      } catch (e) {
        errors.push('NAVIGATION: ' + String(e).slice(0, 120))
      }

      // Bounced to login means the guard rejected us, which is a failure of the
      // test setup or of the route — either way not a passing page.
      if (landed === '/login' && route !== '/login') {
        errors.push('redirected to /login — session lost or route guard rejected')
      }

      page.off('console', onConsole)
      page.off('pageerror', onPageError)
      page.off('response', onResponse)

      results.push({ role, route, errors, failed, text, landed })
    }
    await context.close()
  }

  // Public pages, signed out.
  const context = await browser.newContext()
  const page = await context.newPage()
  for (const route of PUBLIC) {
    const errors = []
    const failed = []
    page.on('console', (m) => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(m.text().slice(0, 160)) })
    page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + String(e).slice(0, 160)))
    page.on('response', (r) => { if (r.status() >= 400 && !isNoise(r.url())) failed.push(`${r.status()} ${r.url().replace(BASE, '')}`) })
    let text = 0
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
      text = (await page.locator('body').innerText()).trim().length
    } catch (e) {
      errors.push('NAVIGATION: ' + String(e).slice(0, 120))
    }
    results.push({ role: 'public', route, errors, failed, text })
    page.removeAllListeners()
  }
  await context.close()
  await browser.close()

  // --- report ---------------------------------------------------------------
  let bad = 0
  let lastRole = ''
  for (const r of results) {
    if (r.role !== lastRole) { console.log(`\n--- ${r.role} ---`); lastRole = r.role }
    // Under ~120 characters of text is an error boundary or a blank render, not
    // a page. Every real screen in this app has a heading and a nav.
    const thin = r.text < 120
    const ok = r.errors.length === 0 && r.failed.length === 0 && !thin
    if (!ok) bad++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.route.padEnd(34)} ${String(r.text).padStart(6)} chars`)
    r.errors.slice(0, 2).forEach((e) => console.log(`         error: ${e}`))
    r.failed.slice(0, 3).forEach((f) => console.log(`         request: ${f}`))
    if (thin && !r.errors.length) console.log('         rendered almost nothing')
  }
  console.log(`\n${results.length - bad}/${results.length} pages clean`)
  process.exit(bad ? 1 : 0)
}

run().catch((e) => { console.error(e); process.exit(1) })
