import { useMemo } from 'react'
import { APPOINTMENT_STATUS, OPERATING_START, OPERATING_END } from '../../lib/constants.js'
import { startOfWeek, sameDay } from '../../lib/dates.js'
import './schedule.css'

const HOURS = Array.from({ length: OPERATING_END - OPERATING_START }, (_, i) => OPERATING_START + i)

// Day and week views share one grid: the only difference is how many columns
// of days it has.
export default function Calendar({ view = 'week', anchor, appointments, onSelect }) {
  const days = useMemo(() => {
    if (view === 'day') return [new Date(anchor)]
    const start = startOfWeek(anchor)
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [view, anchor])

  const today = new Date()

  const byCell = useMemo(() => {
    const map = new Map()
    appointments.forEach((a) => {
      const d = new Date(a.start)
      const key = `${d.toDateString()}:${d.getHours()}`
      const bucket = map.get(key) ?? []
      bucket.push(a)
      map.set(key, bucket)
    })
    return map
  }, [appointments])

  const countFor = (day) => appointments.filter((a) => sameDay(new Date(a.start), day)).length

  return (
    <div className="cal">
      <div className="cal-scroll">
        <div className="cal-grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(120px, 1fr))` }}>
          <div className="cal-head">
            <div className="cal-corner" />
            {days.map((day) => (
              <div key={day.toDateString()} className={`cal-dayhead ${sameDay(day, today) ? 'is-today' : ''}`}>
                <p className="cal-dayname">{day.toLocaleDateString('en-IN', { weekday: 'short' })}</p>
                <p className="cal-daynum">{day.getDate()}</p>
                <p className="cal-daycount">
                  {countFor(day)} slot{countFor(day) === 1 ? '' : 's'}
                </p>
              </div>
            ))}
          </div>

          {HOURS.map((hour) => (
            <div key={hour} style={{ display: 'contents' }}>
              <div className="cal-hour">
                {String(hour).padStart(2, '0')}:00
              </div>
              {days.map((day) => {
                const key = `${day.toDateString()}:${hour}`
                const items = byCell.get(key) ?? []
                return (
                  <div key={key} className={`cal-cell ${sameDay(day, today) ? 'cal-daycol is-today' : ''}`}>
                    {items.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`cal-event is-${a.status}`}
                        onClick={() => onSelect?.(a)}
                        title={`${a.vendorName} — ${APPOINTMENT_STATUS[a.status]?.label}`}
                      >
                        <span className="cal-event-title">
                          {new Date(a.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{' '}
                          {a.shipmentId ?? a.vehicleReg}
                        </span>
                        <span className="cal-event-sub">{a.dockId.split('-').slice(-2).join(' ').replace('dock', 'Dock')}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="cal-legend">
        {Object.entries(APPOINTMENT_STATUS).map(([key, meta]) => (
          <span key={key} className="cal-legend-item">
            <span
              className="cal-legend-swatch"
              style={{
                background: `var(--${meta.tone === 'neutral' ? 'surface-sunken' : `${meta.tone}-soft`})`,
                borderLeftColor: `var(--${meta.tone === 'neutral' ? 'text-subtle' : meta.tone})`,
              }}
            />
            {meta.label}
          </span>
        ))}
      </div>
    </div>
  )
}
