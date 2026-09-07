import { get, post, patch } from './client.js'

export function listShipments({ filters = {}, sort = {}, page = 1, pageSize = 25 } = {}) {
  return get('/shipments', {
    label: 'loading shipments',
    params: {
      search: filters.search,
      status: Array.isArray(filters.status) ? filters.status.join(',') : filters.status,
      fcId: filters.fcId,
      vendorId: filters.vendorId,
      carrier: filters.carrier,
      lane: filters.lane,
      priority: filters.priority,
      delayedOnly: filters.delayedOnly ? 'true' : undefined,
      sort: sort.key,
      direction: sort.direction,
      page,
      pageSize,
    },
  })
}

/** Unpaginated — for maps, boards and the live tick. */
export function listAllShipments(filters = {}) {
  return get('/shipments/all', {
    label: 'loading shipments',
    params: {
      search: filters.search,
      status: filters.status,
      fcId: filters.fcId,
      vendorId: filters.vendorId,
      delayedOnly: filters.delayedOnly ? 'true' : undefined,
    },
  })
}

export function getShipment(id) {
  return get(`/shipments/${id}`, { label: `loading ${id}` })
}

export function createShipment(payload) {
  return post(
    '/shipments',
    {
      reference: payload.reference,
      vendorId: payload.vendorId,
      fcId: payload.fcId,
      vehicleId: payload.vehicleId,
      driverId: payload.driverId,
      commodity: payload.commodity,
      cartons: Number(payload.cartons) || 0,
      weightKg: Number(payload.weightKg) || 0,
      valueInr: Number(payload.valueInr) || 0,
      priority: payload.priority,
      sealNumber: payload.sealNumber,
      invoiceNo: payload.invoiceNo,
      ewayBillNo: payload.ewayBillNo,
      // The API takes epoch millis; the forms produce ISO strings.
      pickupAt: payload.pickupAt ? new Date(payload.pickupAt).getTime() : null,
      slotStart: payload.slotStart ? new Date(payload.slotStart).getTime() : null,
      dockId: payload.dockId,
      slotNote: payload.slotNote,
      documents: payload.documents,
    },
    { label: 'creating the shipment' },
  )
}

export function advanceShipment(id, nextStatus, extra = {}) {
  return post(
    `/shipments/${id}/advance`,
    { status: nextStatus, label: extra.label, detail: extra.detail },
    { label: 'updating the shipment' },
  )
}

export function submitPOD(id, pod) {
  return post(
    `/shipments/${id}/pod`,
    {
      receiverName: pod.receiverName,
      cartonsReceived: Number(pod.cartonsReceived) || 0,
      photos: Number(pod.photos) || 0,
      damageNote: pod.damageNote,
      signature: pod.signature,
    },
    { label: 'submitting proof of delivery' },
  )
}

export function saveChecklist(id, checklist) {
  return post(
    `/shipments/${id}/checklist`,
    {
      sealNumber: checklist.sealNumber,
      notes: checklist.notes,
      photos: Number(checklist.photos) || 0,
      failures: checklist.failures ?? [],
    },
    { label: 'saving the checklist' },
  )
}

export function assignDock(id, dockId) {
  return patch(`/shipments/${id}/dock`, { dockId }, { label: 'assigning the dock' })
}

export function recordGRN(id, grn) {
  return post(`/fc/shipments/${id}/grn`, grn, { label: 'recording the goods receipt' })
}

export function cancelShipment(id, reason) {
  return post(`/shipments/${id}/cancel`, { reason }, { label: 'cancelling the shipment' })
}

export function listDriverTrips(driverId) {
  return get(`/drivers/${driverId}/trips`, { label: 'loading your trips' })
}

export function listDriverHistory(driverId) {
  return get(`/drivers/${driverId}/history`, { label: 'loading trip history' })
}

export function reportIncident(payload) {
  return post(
    '/incidents',
    {
      type: payload.type,
      shipmentId: payload.shipmentId,
      description: payload.description,
      photos: Number(payload.photos) || 0,
      lat: payload.location?.lat,
      lng: payload.location?.lng,
      locationSource: payload.location?.source,
      reportedBy: payload.reportedBy,
    },
    { label: 'reporting the incident' },
  )
}

// Nothing here posts positions any more.
//
// commitLivePositions and recomputePosition lived here to serve the browser
// simulation, and both are gone with it. Where a vehicle is, and how far along
// its route that puts it, are now written by the server alone — from ingested
// fixes and the ETA engine's own measurement — and read back by polling.
//
// The endpoint they called, POST /api/shipments/live, still exists for
// telemetry arriving from outside the browser. It is deliberately not called
// from here: a client that can author a position is a client that can disagree
// with the platform about where a lorry is, which is the whole fault this
// replaced.
