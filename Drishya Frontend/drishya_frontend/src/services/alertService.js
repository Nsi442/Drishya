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

export function markAllRead(user) {
  return post('/alerts/read-all', null, {
    label: 'updating alerts',
    params: { fcId: user?.role === 'fc' ? user.orgId : undefined },
  })
}

export function acknowledgeAlert(id, by) {
  return post(`/alerts/${id}/acknowledge`, { by }, { label: 'acknowledging the alert' })
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
