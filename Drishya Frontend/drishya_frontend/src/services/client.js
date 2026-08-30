// Everything in src/services/ goes through here. It is the only file that knows
// the API is reachable over HTTP, where it lives, and how it reports failure.

// Relative, so the Vite dev proxy (see vite.config.js) forwards it to the
// Spring Boot backend and the browser stays on one origin. Set VITE_API_BASE to
// point at a deployed API instead.
// Nullish coalescing is deliberately NOT used here. `??` only falls back on
// null and undefined, so an env var set to an EMPTY STRING — which is exactly
// what a Docker build arg or a blank Vercel variable produces — would leave the
// base as '' and send every request to /auth/login instead of /api/auth/login.
//
// That failure is horrible to diagnose: nginx answers the unprefixed path from
// try_files with a 405 and an HTML body, the client cannot parse it, and the
// user sees a generic "Could not complete sign in" while the API is perfectly
// healthy and curl against it succeeds.
const CONFIGURED_BASE = import.meta.env.VITE_API_BASE
const BASE = CONFIGURED_BASE && CONFIGURED_BASE.trim() !== '' ? CONFIGURED_BASE.trim() : '/api'

// Flipped by the "simulate a failure" control in Settings → Integrations so the
// error states on every page can be demonstrated without unplugging anything.
let failureRate = 0

export function setFailureRate(rate) {
  failureRate = Math.min(Math.max(rate, 0), 1)
}

export function getFailureRate() {
  return failureRate
}

// The bearer token, held in memory only. Deliberately not in localStorage: a
// token there is readable by any script that manages to run on the page.
let authToken = null

export function setAuthToken(token) {
  authToken = token
}

export function getAuthToken() {
  return authToken
}

export class ServiceError extends Error {
  constructor(message, code = 'REQUEST_FAILED', status = 0) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.status = status
  }
}

function buildUrl(path, params) {
  const url = `${BASE}${path}`
  if (!params) return url

  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    // Skip anything absent or explicitly "all" — the API treats a missing
    // filter and an "all" filter identically, so there is no point sending it.
    if (value === undefined || value === null || value === '' || value === 'all') return
    search.append(key, value)
  })
  const query = search.toString()
  return query ? `${url}?${query}` : url
}

/**
 * One request. `label` is used in the error message a page shows, so it reads
 * as "Could not complete loading shipments" rather than a status code.
 */
export async function request(path, { method = 'GET', body, params, label = 'the request' } = {}) {
  if (failureRate > 0 && Math.random() < failureRate) {
    throw new ServiceError(`Could not complete ${label}. The connection timed out.`, 'NETWORK')
  }

  let response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    // fetch only rejects when the network itself failed — the server being
    // down, DNS, an aborted connection. HTTP errors resolve normally.
    throw new ServiceError(
      `Could not reach the server. Is the backend running on port 8080?`,
      'NETWORK_UNREACHABLE',
    )
  }

  if (response.status === 204) return null

  const text = await response.text()
  const payload = text ? safeParse(text) : null

  if (!response.ok) {
    throw new ServiceError(
      payload?.message ?? `Could not complete ${label}.`,
      payload?.code ?? 'REQUEST_FAILED',
      response.status,
    )
  }
  return payload
}

function safeParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const get = (path, options) => request(path, { ...options, method: 'GET' })
export const post = (path, body, options) => request(path, { ...options, method: 'POST', body })
export const patch = (path, body, options) => request(path, { ...options, method: 'PATCH', body })

// --- client-side helpers -------------------------------------------------
// Sorting and paging are done by the API now, but several pages hold the whole
// shipment set in the store and slice it locally as the user types. These are
// kept for that.

export function paginate(rows, { page = 1, pageSize = 25 } = {}) {
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), pageCount)
  const start = (safePage - 1) * pageSize
  return { rows: rows.slice(start, start + pageSize), total, page: safePage, pageSize, pageCount }
}

export function sortRows(rows, key, direction = 'asc') {
  if (!key) return rows
  const dir = direction === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (av === bv) return 0
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv), 'en', { numeric: true }) * dir
  })
}
