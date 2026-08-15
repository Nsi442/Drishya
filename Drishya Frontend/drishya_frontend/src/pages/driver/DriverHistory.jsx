import { useState, useMemo } from 'react'
import { useAppState, useAuth } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { formatDate, formatTime, formatNumber } from '../../lib/format.js'
import Icon from '../../components/ui/Icon.jsx'
import Drawer from '../../components/ui/Drawer.jsx'
import Button from '../../components/ui/Button.jsx'
import { StatusPill, DelayPill } from '../../components/ui/Badge.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { DataPoint, Callout } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import Timeline from '../../components/shipment/Timeline.jsx'
import './driver.css'

function dayKey(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dayLabel(ts) {
  const today = dayKey(Date.now())
  const yesterday = today - 86400000
  if (ts === today) return 'Today'
  if (ts === yesterday) return 'Yesterday'
  return formatDate(ts, { weekday: 'long' })
}

export default function DriverHistory() {
  useDocumentTitle('Trip history')
  const state = useAppState()
  const { user } = useAuth()
  const [selected, setSelected] = useState(null)

  const shipments = selectShipments(state)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  const past = useMemo(
    () =>
      shipments
        .filter((s) => s.driverId === (user?.driverId ?? 'driver-1') && s.status === 'delivered')
        .sort((a, b) => b.deliveredAt - a.deliveredAt),
    [shipments, user],
  )

  const grouped = useMemo(() => {
    const map = new Map()
    past.forEach((s) => {
      const key = dayKey(s.deliveredAt)
      const bucket = map.get(key) ?? []
      bucket.push(s)
      map.set(key, bucket)
    })
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [past])

  const stats = useMemo(() => {
    const onTime = past.filter((s) => s.delayMin <= 15).length
    return {
      trips: past.length,
      onTimePct: past.length ? Math.round((onTime / past.length) * 100) : 0,
      cartons: past.reduce((sum, s) => sum + s.cartons, 0),
      km: past.reduce((sum, s) => sum + s.distanceKm, 0),
    }
  }, [past])

  if (loading) {
    return (
      <div className="stack gap-12">
        <SkeletonCards count={5} height={84} />
      </div>
    )
  }

  if (!past.length) {
    return (
      <EmptyState
        icon="history"
        title="No completed trips yet"
        description="Once you deliver a consignment and capture proof of delivery, it appears here."
        actionLabel="Back to today"
        actionTo="/driver"
      />
    )
  }

  return (
    <div className="stack gap-16">
      <div className="grid grid-2 gap-12">
        <StatCard label="Trips delivered" value={formatNumber(stats.trips)} icon="checkCircle" />
        <StatCard label="On time" value={stats.onTimePct} unit="%" icon="gauge" accent={stats.onTimePct >= 85 ? 'success' : 'warn'} />
        <StatCard label="Cartons moved" value={formatNumber(stats.cartons)} icon="package" />
        <StatCard label="Distance" value={formatNumber(stats.km)} unit=" km" icon="navigation" />
      </div>

      {grouped.map(([day, trips]) => (
        <div key={day}>
          <p className="day-label">
            {dayLabel(day)} · {trips.length} trip{trips.length === 1 ? '' : 's'}
          </p>

          <div className="stack gap-8">
            {trips.map((trip) => (
              <button key={trip.id} type="button" className="trip-card" onClick={() => setSelected(trip)}>
                <div className="row between gap-8">
                  <span className="mono fw-600 c-strong">{trip.id}</span>
                  <DelayPill minutes={trip.delayMin} size="sm" />
                </div>

                <p className="t-sm c-muted mt-4">{trip.lane}</p>

                <div className="row between gap-8 mt-8 t-sm c-muted">
                  <span className="row gap-4">
                    <Icon name="package" size={12} />
                    {formatNumber(trip.cartons)} cartons
                  </span>
                  <span className="row gap-4">
                    <Icon name="clock" size={12} />
                    {formatTime(trip.deliveredAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.id}
        subtitle={selected ? `${selected.lane} · read-only` : ''}
        footer={
          <Button variant="secondary" block onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected ? (
          <div className="stack gap-16 pad">
            <div className="row gap-8 wrap">
              <StatusPill status={selected.status} />
              <DelayPill minutes={selected.delayMin} />
            </div>

            <div className="grid grid-2 gap-12">
              <DataPoint label="Delivered" value={formatTime(selected.deliveredAt)} />
              <DataPoint label="Cartons" value={formatNumber(selected.cartons)} />
              <DataPoint label="Distance" value={`${formatNumber(selected.distanceKm)} km`} />
              <DataPoint label="Vehicle" value={selected.vehicleReg} mono />
            </div>

            {selected.pod ? (
              <Callout tone="success" title={`Signed by ${selected.pod.receiverName}`}>
                {formatNumber(selected.pod.cartonsReceived ?? selected.cartons)} of {formatNumber(selected.cartons)} cartons accepted
                {selected.pod.photos ? ` · ${selected.pod.photos} photo${selected.pod.photos > 1 ? 's' : ''}` : ''}.
                {selected.pod.damageNote ? ` ${selected.pod.damageNote}` : ''}
              </Callout>
            ) : null}

            <div>
              <p className="eyebrow mb-12">Journey</p>
              <Timeline shipment={selected} compact />
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
