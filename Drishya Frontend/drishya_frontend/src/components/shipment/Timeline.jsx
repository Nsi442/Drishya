import { SHIPMENT_FLOW, SHIPMENT_STATUS } from '../../lib/constants.js'
import { formatDateTime, formatRelative } from '../../lib/format.js'
import Icon from '../ui/Icon.jsx'
import { cn } from '../../lib/cn.js'
import './shipment.css'

const STAGE_ICON = {
  booked: 'clipboard',
  picked_up: 'package',
  in_transit: 'truck',
  at_gate: 'pin',
  unloading: 'dock',
  delivered: 'checkCircle',
}

// Shows the whole lifecycle, not just what has happened — a vendor should be
// able to see what is still to come and when it is expected.
export default function Timeline({ shipment, compact = false }) {
  const reachedIndex = SHIPMENT_STATUS[shipment.status]?.index ?? -1
  const byStage = new Map(shipment.events.map((e) => [e.stage, e]))

  const projected = {
    at_gate: shipment.predictedAt - 40 * 60000,
    unloading: shipment.predictedAt - 12 * 60000,
    delivered: shipment.predictedAt,
  }

  return (
    <ol className={cn('timeline', compact && 'timeline-compact')}>
      {SHIPMENT_FLOW.map((stage, i) => {
        const event = byStage.get(stage)
        const done = Boolean(event)
        const current = i === reachedIndex
        const upcoming = !done

        return (
          <li key={stage} className={cn('timeline-item', done && 'is-done', current && 'is-current', upcoming && 'is-upcoming')}>
            <span className="timeline-marker" aria-hidden="true">
              <Icon name={done ? STAGE_ICON[stage] : 'clock'} size={13} />
            </span>

            <div className="timeline-content">
              <div className="row gap-8 between wrap">
                <p className="timeline-label">
                  {event?.label ?? SHIPMENT_STATUS[stage].label}
                  {current ? <span className="timeline-now">now</span> : null}
                </p>
                <time className="timeline-time" dateTime={new Date(event?.at ?? projected[stage] ?? shipment.predictedAt).toISOString()}>
                  {done ? formatDateTime(event.at) : `expected ${formatRelative(projected[stage] ?? shipment.predictedAt)}`}
                </time>
              </div>
              {event?.detail && !compact ? <p className="timeline-detail">{event.detail}</p> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
