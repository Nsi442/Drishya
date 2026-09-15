// An absent timestamp is a real state, not a zero.
//
// predictedAt is legitimately null whenever the ETA engine has withdrawn an
// estimate rather than serve one built on a stale position. These helpers used
// to hand null to `new Date(null)`, which is epoch 0, and rendered a confident
// "ETA 05:30 am · 20695d ago" — a arrival time in 1970 presented in the same
// typeface as a real one. Showing a dash is the honest answer.
const NO_VALUE = '—'

function isAbsent(value) {
  return value === null || value === undefined || value === '' || Number.isNaN(new Date(value).getTime())
}

/**
 * The gap between two timestamps in minutes, or null when either is absent.
 *
 * Subtraction does not know that null means "no estimate". `null - slotStart`
 * is not NaN, it is a large negative number, so the arrival board rendered
 * "497071 h 11 m early" in the variance column beside a Live ETA that had
 * correctly shown a dash. DelayPill was right to trust its input; the caller
 * had already turned an absence into a figure before handing it over.
 *
 * Returning null puts the decision back where the components already handle it.
 */
export function minutesBetween(later, earlier) {
  if (isAbsent(later) || isAbsent(earlier)) return null
  return Math.round((new Date(later).getTime() - new Date(earlier).getTime()) / 60000)
}

export function formatDate(iso, opts = {}) {
  if (isAbsent(iso)) return NO_VALUE
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...opts })
}

export function formatTime(iso) {
  if (isAbsent(iso)) return NO_VALUE
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatDateTime(iso) {
  if (isAbsent(iso)) return NO_VALUE
  return `${formatDate(iso)}, ${formatTime(iso)}`
}

export function formatRelative(iso) {
  if (isAbsent(iso)) return 'no estimate'
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
