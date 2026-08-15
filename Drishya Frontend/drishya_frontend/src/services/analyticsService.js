import { get } from './client.js'

export function getVendorSummary({ vendorId } = {}) {
  return get('/analytics/vendor/summary', { label: 'loading the dashboard', params: { vendorId } })
}

export function getWeeklyDeliveries({ vendorId } = {}) {
  return get('/analytics/vendor/weekly', { label: 'loading delivery history', params: { vendorId } })
}

export function getVendorAnalytics({ from, to, vendorId } = {}) {
  return get('/analytics/vendor', {
    label: 'loading analytics',
    params: {
      vendorId,
      from: from ? new Date(from).getTime() : undefined,
      to: to ? new Date(to).getTime() : undefined,
    },
  })
}

export function getFCSummary(fcId) {
  return get(`/analytics/fc/${fcId}/summary`, { label: 'loading the dashboard' })
}

export function getFCAnalytics(fcId) {
  return get(`/analytics/fc/${fcId}`, { label: 'loading analytics' })
}
