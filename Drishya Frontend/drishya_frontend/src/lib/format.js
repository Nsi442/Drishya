export function formatDate(iso, opts = {}) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...opts })
}

export function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatDateTime(iso) {
  return `${formatDate(iso)}, ${formatTime(iso)}`
}

export function formatRelative(iso) {
  const diffMs = new Date(iso).getTime() - Date.now()
  const diffMin = Math.round(diffMs / 60000)
  const abs = Math.abs(diffMin)
  if (abs < 1) return 'now'
  if (abs < 60) return diffMin > 0 ? `in ${abs}m` : `${abs}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (Math.abs(diffHr) < 24) return diffMin > 0 ? `in ${diffHr}h` : `${Math.abs(diffHr)}h ago`
  const diffDay = Math.round(diffHr / 24)
  return diffMin > 0 ? `in ${diffDay}d` : `${Math.abs(diffDay)}d ago`
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(value)
}

export function formatPercent(value, digits = 0) {
  return `${value.toFixed(digits)}%`
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// Reads a span of minutes as a person would say it: "45 min", "1 h 40 m".
export function formatDuration(minutes) {
  const m = Math.abs(Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest} m` : `${h} h`
}
