import { cn } from '../../lib/cn.js'
import { formatDuration } from '../../lib/format.js'
import Icon from './Icon.jsx'
import {
  SHIPMENT_STATUS,
  DOC_STATUS,
  ALERT_SEVERITY,
  APPOINTMENT_STATUS,
  EXCEPTION_STATUS,
  DEVICE_STATUS,
  GRN_DECISION,
} from '../../lib/constants.js'

export default function Badge({ children, tone = 'neutral', icon, size, square = false, className, ...rest }) {
  return (
    <span className={cn('badge', `badge-${tone}`, size === 'sm' && 'badge-sm', square && 'badge-square', className)} {...rest}>
      {icon ? <Icon name={icon} size={11} /> : null}
      {children}
    </span>
  )
}

// Status is a dot plus a word, always. Colour alone never carries the meaning —
// that is the rule the whole product is held to.
export function StatusPill({ status, kind = 'shipment', size, className }) {
  const table = {
    shipment: SHIPMENT_STATUS,
    document: DOC_STATUS,
    alert: ALERT_SEVERITY,
    appointment: APPOINTMENT_STATUS,
    exception: EXCEPTION_STATUS,
    device: DEVICE_STATUS,
    grn: GRN_DECISION,
  }[kind]

  const entry = table?.[status]
  if (!entry) {
    return (
      <Badge tone="neutral" size={size} className={className}>
        {String(status ?? '—').replace(/_/g, ' ')}
      </Badge>
    )
  }

  return (
    <Badge tone={entry.tone} size={size} className={className}>
      <span className="status-dot" aria-hidden="true" />
      {entry.label}
    </Badge>
  )
}

// The delta between promised and predicted arrival, coloured by how bad it is.
// Reads "on time", "12 min early" or "1 h 40 m late" — never a bare number.
export function DelayPill({ minutes, size, showEarly = true, className }) {
  const m = Math.round(minutes ?? 0)

  if (m > 15) {
    const tone = m > 90 ? 'danger' : 'warn'
    return (
      <Badge tone={tone} size={size} className={className}>
        <span className="status-dot" aria-hidden="true" />
        {formatDuration(m)} late
      </Badge>
    )
  }
  if (m < -10 && showEarly) {
    return (
      <Badge tone="info" size={size} className={className}>
        <span className="status-dot" aria-hidden="true" />
        {formatDuration(-m)} early
      </Badge>
    )
  }
  return (
    <Badge tone="success" size={size} className={className}>
      <span className="status-dot" aria-hidden="true" />
      On time
    </Badge>
  )
}

export function PriorityBadge({ priority }) {
  if (priority !== 'high') return null
  return (
    <Badge tone="warn" size="sm" icon="flag">
      Priority
    </Badge>
  )
}
