import { get, post, patch } from './client.js'

export function listAppointments({ fcId, vendorId, status = 'all', from, to } = {}) {
  return get('/appointments', {
    label: 'loading appointments',
    params: {
      fcId,
      vendorId,
      status,
      from: from ? new Date(from).getTime() : undefined,
      to: to ? new Date(to).getTime() : undefined,
    },
  })
}

export function listDocks(fcId) {
  return get('/docks', { label: 'loading docks', params: { fcId } })
}

export function requestAppointment(payload) {
  return post(
    '/appointments',
    {
      shipmentId: payload.shipmentId,
      vendorId: payload.vendorId,
      vendorName: payload.vendorName,
      fcId: payload.fcId,
      dockId: payload.dockId,
      start: new Date(payload.start).getTime(),
      durationMin: payload.durationMin ?? 60,
      vehicleReg: payload.vehicleReg,
      cartons: payload.cartons,
      note: payload.note,
    },
    { label: 'requesting the slot' },
  )
}

export function rescheduleAppointment(id, { start, dockId }) {
  return patch(
    `/appointments/${id}/reschedule`,
    { start: new Date(start).getTime(), dockId },
    { label: 'rescheduling' },
  )
}

export function decideAppointment(id, decision, extra = {}) {
  return patch(
    `/appointments/${id}/decision`,
    {
      decision,
      by: extra.by,
      reason: extra.reason,
      proposedStart: extra.proposedStart ? new Date(extra.proposedStart).getTime() : null,
    },
    { label: 'saving the decision' },
  )
}

/**
 * Asks the API whether a window is already taken.
 *
 * <p>Returns a promise now, where the mock version answered synchronously. The
 * forms that use it await it before submitting; the check is repeated
 * server-side on the write, because two people can be booking the same bay at
 * the same moment and only the server can see both.
 */
export function checkConflict(dockId, start, durationMin = 60, ignoreId) {
  return get('/appointments/conflict', {
    label: 'checking for clashes',
    params: { dockId, start: new Date(start).getTime(), durationMin, ignoreId },
  })
}
