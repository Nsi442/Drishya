// Reference data — vendors, fulfilment centres, docks, vehicles, drivers,
// carriers — fetched once after sign-in and cached here.
//
// It exists because this data is needed synchronously by things that cannot
// wait: a select's options while a form renders, a dock name inside a table
// cell, the command palette's search index. Threading an async load through
// every one of those would add a loading state to a dozen components for data
// that changes about once a quarter.
//
// The object is mutated in place rather than replaced, so modules that imported
// it at startup see the filled version once loading completes.

import { get } from './client.js'

export const refData = {
  vendors: [],
  fulfilmentCentres: [],
  docks: [],
  vehicles: [],
  drivers: [],
  carriers: [],
  shipments: [],
  loaded: false,
  // Settings-page fixtures, defined below. Attached here so the pages that
  // render them read everything from one object.
  orgUsers: [],
  apiKeys: [],
  integrations: [],
}

/**
 * Settings-page fixtures. There is no users-and-roles, API-key or integrations
 * API — these are client-side placeholders, and the pages that render them say
 * as much. They live here rather than in the deleted mock layer so nothing
 * imports from a folder that is no longer the source of truth.
 */
export const orgUsers = [
  { id: 'ou-1', name: 'Priya Raghavan', email: 'priya@anandauto.example', role: 'Admin', status: 'active', lastActive: Date.now() - 4 * 60000 },
  { id: 'ou-2', name: 'Sanjay Gupta', email: 'sanjay@anandauto.example', role: 'Dispatcher', status: 'active', lastActive: Date.now() - 52 * 60000 },
  { id: 'ou-3', name: 'Neha Kulkarni', email: 'neha@anandauto.example', role: 'Documentation', status: 'active', lastActive: Date.now() - 3 * 3600000 },
  { id: 'ou-4', name: 'Arun Deshpande', email: 'arun@anandauto.example', role: 'Viewer', status: 'invited', lastActive: null },
  { id: 'ou-5', name: 'Meera Shah', email: 'meera@anandauto.example', role: 'Finance', status: 'active', lastActive: Date.now() - 26 * 3600000 },
  { id: 'ou-6', name: 'Vikas Rane', email: 'vikas@anandauto.example', role: 'Dispatcher', status: 'disabled', lastActive: Date.now() - 41 * 86400000 },
]

export const apiKeys = [
  { id: 'key-1', label: 'ERP integration — production', prefix: 'dk_live_7f3a', createdAt: Date.now() - 96 * 86400000, lastUsed: Date.now() - 18 * 60000, scopes: ['shipments:read', 'shipments:write'] },
  { id: 'key-2', label: 'Warehouse WMS sync', prefix: 'dk_live_b91c', createdAt: Date.now() - 41 * 86400000, lastUsed: Date.now() - 6 * 3600000, scopes: ['shipments:read', 'documents:read'] },
  { id: 'key-3', label: 'Staging sandbox', prefix: 'dk_test_2e60', createdAt: Date.now() - 12 * 86400000, lastUsed: null, scopes: ['shipments:read'] },
]

export const integrations = [
  { id: 'int-1', name: 'Tally ERP', category: 'Accounting', connected: true, detail: 'Invoices and e-way bills pulled every 15 minutes', lastSync: Date.now() - 11 * 60000 },
  { id: 'int-2', name: 'GSTN e-way bill portal', category: 'Compliance', connected: true, detail: 'Validity checked at booking and again before gate-in', lastSync: Date.now() - 3 * 60000 },
  { id: 'int-3', name: 'Marketplace vendor portal', category: 'Fulfilment', connected: true, detail: 'Appointment windows and ASN acknowledgements', lastSync: Date.now() - 27 * 60000 },
  { id: 'int-4', name: 'Telematics — Speedway fleet', category: 'Tracking', connected: true, detail: '18 devices reporting position every 30 seconds', lastSync: Date.now() - 40000 },
  { id: 'int-5', name: 'SAP Business One', category: 'ERP', connected: false, detail: 'Not connected', lastSync: null },
  { id: 'int-6', name: 'Slack', category: 'Notifications', connected: false, detail: 'Not connected', lastSync: null },
]

refData.orgUsers = orgUsers
refData.apiKeys = apiKeys
refData.integrations = integrations

let inFlight = null

/**
 * Loads everything in parallel. Safe to call repeatedly — concurrent callers
 * share one request, and a completed load is a no-op unless forced.
 */
export function loadReferenceData({ force = false } = {}) {
  if (refData.loaded && !force) return Promise.resolve(refData)
  if (inFlight) return inFlight

  inFlight = Promise.all([
    get('/vendors', { label: 'loading vendors' }),
    get('/fulfilment-centres', { label: 'loading fulfilment centres' }),
    get('/docks', { label: 'loading docks' }),
    get('/vehicles', { label: 'loading vehicles' }),
    get('/drivers', { label: 'loading drivers' }),
    get('/carriers', { label: 'loading carriers' }),
    get('/shipments/all', { label: 'loading shipments' }),
  ])
    .then(([vendors, fulfilmentCentres, docks, vehicles, drivers, carriers, shipments]) => {
      // Mutated in place: modules hold a reference to this object.
      Object.assign(refData, {
        vendors,
        fulfilmentCentres,
        docks,
        vehicles,
        drivers,
        carriers,
        shipments,
        loaded: true,
      })
      return refData
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/** Cleared on sign-out so the next account does not inherit the last one's data. */
export function clearReferenceData() {
  Object.assign(refData, {
    vendors: [],
    fulfilmentCentres: [],
    docks: [],
    vehicles: [],
    drivers: [],
    carriers: [],
    shipments: [],
    loaded: false,
  })
}

export function dockName(dockId) {
  return refData.docks.find((d) => d.id === dockId)?.name ?? null
}
