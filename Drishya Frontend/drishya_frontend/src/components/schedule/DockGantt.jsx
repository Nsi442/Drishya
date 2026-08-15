import { useState, useMemo, useRef } from 'react'
import { OPERATING_START, OPERATING_END } from '../../lib/constants.js'
import useNow from '../../hooks/useNow.js'
import { Progress } from '../ui/Misc.jsx'
import './schedule.css'

const HOURS = Array.from({ length: OPERATING_END - OPERATING_START }, (_, i) => OPERATING_START + i)
const HOUR_MS = 3600000

// Docks as rows, hours as columns. Blocks are absolutely positioned by their
// offset into the operating day, which keeps a 90-minute booking exactly one
// and a half columns wide rather than snapping to a grid cell.
export default function DockGantt({ docks, appointments, dayStart, utilisation = [], onSelect, onMove, conflicts = new Set() }) {
  const [dragging, setDragging] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const laneRefs = useRef({})

  const dayOpen = dayStart + OPERATING_START * HOUR_MS
  const dayLength = (OPERATING_END - OPERATING_START) * HOUR_MS

  const byDock = useMemo(() => {
    const map = new Map()
    docks.forEach((d) => map.set(d.id, []))
    appointments.forEach((a) => {
      const bucket = map.get(a.dockId)
      if (bucket) bucket.push(a)
    })
    return map
  }, [docks, appointments])

  // The now-line has to creep across the chart, so the clock is state.
  const now = useNow(60000)
  const nowOffset = useMemo(() => {
    if (now < dayOpen || now > dayOpen + dayLength) return null
    return ((now - dayOpen) / dayLength) * 100
  }, [now, dayOpen, dayLength])

  const gridTemplate = `170px repeat(${HOURS.length}, minmax(52px, 1fr))`

  // Drop position is read from where the pointer landed inside the lane, then
  // snapped to the nearest half hour — dragging to the minute helps nobody.
  const handleDrop = (dockId, e) => {
    e.preventDefault()
    setDropTarget(null)
    if (!dragging) return

    const lane = laneRefs.current[dockId]
    if (!lane) return
    const rect = lane.getBoundingClientRect()
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    const raw = dayOpen + ratio * dayLength
    const snapped = Math.round(raw / (30 * 60000)) * (30 * 60000)

    onMove?.(dragging, { dockId, start: snapped })
    setDragging(null)
  }

  return (
    <div className="gantt">
      <div className="gantt-scroll">
        <div className="gantt-inner">
          <div className="gantt-hours" style={{ gridTemplateColumns: gridTemplate }}>
            <span className="gantt-hour gantt-corner">Dock</span>
            {HOURS.map((h) => (
              <span key={h} className="gantt-hour">
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>

          {docks.map((dock) => {
            const items = byDock.get(dock.id) ?? []
            const util = utilisation.find((u) => u.dockId === dock.id)

            return (
              <div key={dock.id} className="gantt-row" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="gantt-rowhead">
                  <span className="gantt-dockname">{dock.name}</span>
                  <span className="gantt-dockmeta">
                    {dock.type} · {util ? `${util.utilisationPct}% booked` : `${items.length} slots`}
                  </span>
                </div>

                <div
                  className={`gantt-lane ${dropTarget === dock.id ? 'is-drop-target' : ''}`}
                  style={{ gridColumn: `2 / span ${HOURS.length}` }}
                  ref={(el) => {
                    laneRefs.current[dock.id] = el
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropTarget(dock.id)
                  }}
                  onDragLeave={() => setDropTarget((t) => (t === dock.id ? null : t))}
                  onDrop={(e) => handleDrop(dock.id, e)}
                >
                  <div className="gantt-lane-grid" style={{ gridTemplateColumns: `repeat(${HOURS.length}, 1fr)` }}>
                    {HOURS.map((h) => (
                      <span key={h} className="gantt-lane-cell" />
                    ))}
                  </div>

                  {items.map((a) => {
                    const left = ((a.start - dayOpen) / dayLength) * 100
                    const width = ((a.end - a.start) / dayLength) * 100
                    if (left > 100 || left + width < 0) return null

                    return (
                      <button
                        key={a.id}
                        type="button"
                        draggable
                        onDragStart={() => setDragging(a)}
                        onDragEnd={() => {
                          setDragging(null)
                          setDropTarget(null)
                        }}
                        onClick={() => onSelect?.(a)}
                        className={`gantt-block is-${a.status} ${conflicts.has(a.id) ? 'is-conflict' : ''} ${dragging?.id === a.id ? 'is-dragging' : ''}`}
                        style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(2.5, Math.min(width, 100 - Math.max(0, left)))}%` }}
                        title={`${a.vendorName} — ${new Date(a.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} to ${new Date(a.end).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}${conflicts.has(a.id) ? ' — clashes with another booking' : ''}`}
                      >
                        <span className="gantt-block-title">{a.shipmentId ?? a.vehicleReg}</span>
                        <span className="gantt-block-sub">{a.vendorName}</span>
                      </button>
                    )
                  })}

                  {nowOffset !== null ? <span className="gantt-now" style={{ left: `${nowOffset}%` }} aria-hidden="true" /> : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="gantt-util">
        <span className="eyebrow">Capacity used today</span>
        <div className="grow" style={{ maxWidth: 320 }}>
          <Progress
            value={utilisation.reduce((sum, u) => sum + u.utilisationPct, 0) / Math.max(1, utilisation.length)}
            tone={
              utilisation.reduce((sum, u) => sum + u.utilisationPct, 0) / Math.max(1, utilisation.length) > 85
                ? 'danger'
                : 'accent'
            }
            label="Average dock utilisation"
          />
        </div>
        <span className="t-sm fw-600 c-strong">
          {Math.round(utilisation.reduce((sum, u) => sum + u.utilisationPct, 0) / Math.max(1, utilisation.length))}%
        </span>
        <span className="t-sm c-muted">across {docks.length} docks</span>
      </div>
    </div>
  )
}
