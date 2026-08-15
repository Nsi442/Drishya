import { Sparkline } from '../charts/Charts.jsx'
import { formatTime } from '../../lib/format.js'
import Badge from '../ui/Badge.jsx'
import Icon from '../ui/Icon.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import './shipment.css'

function latest(series) {
  return series?.length ? series[series.length - 1].value : null
}

export default function SensorPanel({ shipment }) {
  const sensors = shipment.sensors ?? {}
  const temp = latest(sensors.temperature)
  const humidity = latest(sensors.humidity)
  const shocks = (sensors.shock ?? []).filter((s) => s.value > 1.2)
  const doors = sensors.door ?? []
  const unscheduledDoors = doors.filter((d) => !d.scheduled)

  if (!sensors.temperature?.length && !doors.length) {
    return (
      <EmptyState
        icon="activity"
        title="No sensor readings yet"
        description="Telemetry starts flowing once the vehicle is loaded and the device reports its first position."
      />
    )
  }

  return (
    <div className="sensor-grid">
      <div className="sensor-tile">
        <div className="row between gap-8">
          <span className="kv-label">
            <Icon name="thermometer" size={12} /> Cargo bay temp
          </span>
          <span className="sensor-now">{temp !== null ? `${temp} °C` : '—'}</span>
        </div>
        <Sparkline data={sensors.temperature} tone="var(--chart-2)" />
        <p className="sensor-foot">Ambient — this consignment is not temperature controlled</p>
      </div>

      <div className="sensor-tile">
        <div className="row between gap-8">
          <span className="kv-label">
            <Icon name="activity" size={12} /> Humidity
          </span>
          <span className="sensor-now">{humidity !== null ? `${humidity}%` : '—'}</span>
        </div>
        <Sparkline data={sensors.humidity} tone="var(--chart-3)" />
        <p className="sensor-foot">Steady through the run</p>
      </div>

      <div className="sensor-tile">
        <div className="row between gap-8">
          <span className="kv-label">
            <Icon name="zap" size={12} /> Shock events
          </span>
          <span className="sensor-now">
            {shocks.length}
            {shocks.length ? <Badge tone="warn" size="sm" className="ml-6">peak {Math.max(...shocks.map((s) => s.value)).toFixed(1)} g</Badge> : null}
          </span>
        </div>
        <Sparkline data={sensors.shock} tone="var(--chart-4)" />
        <p className="sensor-foot">{shocks.length ? 'Flag these cartons for inspection at the dock' : 'Nothing above the 1.2 g threshold'}</p>
      </div>

      <div className="sensor-tile">
        <div className="row between gap-8">
          <span className="kv-label">
            <Icon name="package" size={12} /> Door events
          </span>
          <span className="sensor-now">{doors.length}</span>
        </div>

        {doors.length ? (
          <ul className="door-list">
            {doors.map((d) => (
              <li key={d.t}>
                <span className={`door-dot ${d.scheduled ? 'is-ok' : 'is-alert'}`} aria-hidden="true" />
                <span className="grow">
                  <strong>{formatTime(d.t)}</strong> — open {d.durationMin} min
                </span>
                <Badge tone={d.scheduled ? 'neutral' : 'danger'} size="sm">
                  {d.scheduled ? 'Scheduled stop' : 'Unscheduled'}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sensor-foot">Seal intact — no door openings recorded since pickup</p>
        )}

        {unscheduledDoors.length ? (
          <p className="sensor-foot c-danger">
            {unscheduledDoors.length} opening{unscheduledDoors.length > 1 ? 's' : ''} away from a planned stop
          </p>
        ) : null}
      </div>
    </div>
  )
}
