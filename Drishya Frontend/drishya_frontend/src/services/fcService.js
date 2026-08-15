import { get, post } from './client.js'

/** The arrival board, already sorted by live ETA by the API. */
export function getArrivalBoard({ fcId, search = '', status = 'all', window = 'today' } = {}) {
  return get(`/fc/${fcId}/arrivals`, {
    label: 'loading the arrival board',
    params: { window, status, search },
  })
}

export function getYard(fcId) {
  return get(`/fc/${fcId}/yard`, { label: 'loading the yard' })
}

export function gateIn(shipmentId) {
  return post(`/fc/shipments/${shipmentId}/gate-in`, null, { label: 'recording gate-in' })
}

export function gateOut(shipmentId) {
  return post(`/fc/shipments/${shipmentId}/gate-out`, null, { label: 'recording gate-out' })
}

export function getReceivingQueue(fcId) {
  return get(`/fc/${fcId}/receiving`, { label: 'loading the receiving queue' })
}

export function submitGRN(shipmentId, payload) {
  return post(
    `/fc/shipments/${shipmentId}/grn`,
    {
      decision: payload.decision,
      receivedCartons: Number(payload.receivedCartons) || 0,
      damagedCartons: Number(payload.damagedCartons) || 0,
      documentsVerified: payload.documentsVerified ?? [],
      note: payload.note,
      checkedBy: payload.checkedBy,
    },
    { label: 'submitting the goods receipt' },
  )
}

export function getDockSchedule(fcId, dayStart) {
  return get(`/fc/${fcId}/dock-schedule`, {
    label: 'loading the dock schedule',
    params: { day: dayStart },
  })
}
