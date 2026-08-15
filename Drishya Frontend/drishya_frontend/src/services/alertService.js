import { get, post, patch } from './client.js'
import { nextId } from '../lib/id.js'

export function listAlerts({ severity = 'all', read = 'all', search = '', shipmentId } = {}) {
  return get('/alerts', {
    label: 'loading alerts',
    params: { severity, read, search, shipmentId },
  })
}

export function markRead(ids) {
  return post('/alerts/read', { ids: Array.isArray(ids) ? ids : [ids] }, { label: 'updating alerts' })
}

export function markAllRead(user) {
  return post('/alerts/read-all', null, {
    label: 'updating alerts',
    params: { fcId: user?.role === 'fc' ? user.orgId : undefined },
  })
}

export function acknowledgeAlert(id, by) {
  return post(`/alerts/${id}/acknowledge`, { by }, { label: 'acknowledging the alert' })
}

/**
 * Builds an alert for something the live simulation just invented.
 *
 * <p>Client-side only, and deliberately so. The simulation is a stand-in for
 * telemetry the backend does not yet receive, so its alerts are simulated too —
 * they appear immediately and do not survive a reload. Alerts the backend
 * raises for itself (an incident report, a short goods receipt) are persisted
 * and do come back from {@link listAlerts}.
 */
export function pushAlert(alert) {
  return {
    id: nextId('ALT'),
    read: false,
    acknowledged: false,
    acknowledgedBy: null,
    at: Date.now(),
    simulated: true,
    ...alert,
  }
}

export function listExceptions({ status = 'all', type = 'all', fcId, search = '' } = {}) {
  return get('/exceptions', {
    label: 'loading exceptions',
    params: { fcId, status, type, search },
  })
}

export function updateException(id, patchBody) {
  return patch(`/exceptions/${id}`, patchBody, { label: 'updating the exception' })
}
