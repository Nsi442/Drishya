import { get, post, patch } from './client.js'

export function listAlerts({ severity = 'all', read = 'all', search = '', shipmentId } = {}) {
  return get('/alerts', {
    label: 'loading alerts',
    params: { severity, read, search, shipmentId },
  })
}

export function markRead(ids) {
  return post('/alerts/read', { ids: Array.isArray(ids) ? ids : [ids] }, { label: 'updating alerts' })
}

// No fcId, and no argument at all. The server scopes this from the token; the
// browser used to pass the site it wanted cleared, which made a query parameter
// the boundary. Sending it now would be sending something nothing reads.
export function markAllRead() {
  return post('/alerts/read-all', null, { label: 'updating alerts' })
}

// Likewise no `by`. The name on the record is the caller's, taken from the
// token, rather than whatever the client put in the body.
export function acknowledgeAlert(id) {
  return post(`/alerts/${id}/acknowledge`, {}, { label: 'acknowledging the alert' })
}

// pushAlert is gone with the simulation that needed it.
//
// It fabricated an alert object in the browser and never told anyone. An alert
// raised in the vendor's tab therefore did not exist in the receiving desk's,
// which made the feed the one place in the product where two people looking at
// the same consignment were guaranteed to disagree. Alerts are the backend's
// to raise; this module only reads them.

export function listExceptions({ status = 'all', type = 'all', fcId, search = '' } = {}) {
  return get('/exceptions', {
    label: 'loading exceptions',
    params: { fcId, status, type, search },
  })
}

export function updateException(id, patchBody) {
  return patch(`/exceptions/${id}`, patchBody, { label: 'updating the exception' })
}
