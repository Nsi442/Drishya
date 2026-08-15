import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppState, useAuth } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import { useDriverQueue } from '../../components/layout/driverContext.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { DRIVER_ACTION, ACTIVE_STATUSES } from '../../lib/constants.js'
import { formatTime, formatRelative, formatNumber } from '../../lib/format.js'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { StatusPill, DelayPill } from '../../components/ui/Badge.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { DataPoint, Callout } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import './driver.css'

function TripLeg({ shipment, compact = false }) {
  return (
    <div className="leg">
      <div className="leg-rail">
        <span className="leg-dot" />
        <span className="leg-line" />
        <span className="leg-dot is-end" />
      </div>
      <div className="leg-stops">
        <div>
          <p className="leg-label">Pickup</p>
          <p className="leg-place">{shipment.origin.name}</p>
          {!compact ? <p className="leg-meta">{formatTime(shipment.pickupAt)}</p> : null}
        </div>
        <div>
          <p className="leg-label">Deliver to</p>
          <p className="leg-place">{shipment.destination.name}</p>
          {!compact ? (
            <p className="leg-meta">
              Slot {formatTime(shipment.slotStart)} · ETA {formatTime(shipment.predictedAt)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function DriverToday() {
  useDocumentTitle('Today')
  const state = useAppState()
  const { user } = useAuth()
  const queue = useDriverQueue()

  const shipments = selectShipments(state)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  // The demo driver is driver-1; if they have nothing live, fall back to the
  // fleet's active work so the screen is never empty for no good reason.
  const trips = useMemo(() => {
    const mine = shipments.filter((s) => s.driverId === (user?.driverId ?? 'driver-1') && s.status !== 'cancelled')
    const active = mine.filter((s) => ACTIVE_STATUSES.includes(s.status))
    return (active.length ? active : mine).sort((a, b) => a.promisedAt - b.promisedAt)
  }, [shipments, user])

  const [next, ...rest] = trips
  const done = trips.filter((s) => s.status === 'delivered').length

  if (loading) {
    return (
      <div className="stack gap-12">
        <SkeletonCards count={3} height={188} />
      </div>
    )
  }

  return (
    <div className="stack gap-16">
      <div className="row between gap-8">
        <div>
          <h2 className="t-lg fw-600 c-strong">
            {trips.length} trip{trips.length === 1 ? '' : 's'} today
          </h2>
          <p className="t-sm c-muted">
            {done} delivered · {trips.length - done} to go
          </p>
        </div>
        {queue.pending ? (
          <span className="badge badge-warn">
            <Icon name="clock" size={11} />
            {queue.pending} queued
          </span>
        ) : null}
      </div>

      {!queue.online ? (
        <Callout tone="warn" title="You are offline">
          Keep working — checklists, photos and proof of delivery are stored on this phone and sent the moment the
          signal comes back.
        </Callout>
      ) : null}

      {trips.length === 0 ? (
        <EmptyState
          icon="truck"
          title="No trips assigned"
          description="Nothing is scheduled for you right now. New assignments appear here as soon as dispatch books them."
          actionLabel="View past trips"
          actionTo="/driver/history"
        />
      ) : (
        <>
          {next ? (
            <article className="trip-card trip-card-next">
              <p className="trip-card-eyebrow">
                {next.status === 'delivered' ? 'Most recent' : 'Next up'}
              </p>

              <div className="row between gap-8">
                <span className="mono fw-700 c-strong t-lg">{next.id}</span>
                <StatusPill status={next.status} />
              </div>

              <TripLeg shipment={next} />

              <div className="trip-metrics">
                <DataPoint label="Cartons" value={formatNumber(next.cartons)} />
                <DataPoint label="Distance" value={`${formatNumber(next.remainingKm)} km`} />
                <DataPoint label="Arrive" value={formatRelative(next.predictedAt)} />
              </div>

              <div className="row gap-8 mt-16 wrap">
                <DelayPill minutes={next.delayMin} size="sm" />
                <span className="t-sm c-muted">{next.vehicleReg}</span>
              </div>

              <div className="stack gap-8 mt-16">
                <Button variant="primary" size="xl" block to={`/driver/trip/${next.id}`} className="advance-btn">
                  {next.status === 'delivered' ? 'View trip' : (DRIVER_ACTION[next.status]?.label ?? 'Open trip')}
                </Button>
                <div className="row gap-8">
                  <Button variant="secondary" block icon="clipboard" to={`/driver/trip/${next.id}/checklist`}>
                    Checklist
                  </Button>
                  <Button variant="secondary" block icon="phone" href={`tel:${next.driverPhone.replace(/\s/g, '')}`}>
                    Call vendor
                  </Button>
                </div>
              </div>
            </article>
          ) : null}

          {rest.length ? (
            <>
              <p className="eyebrow">Later today</p>
              <div className="stack gap-12">
                {rest.map((trip) => (
                  <Link key={trip.id} to={`/driver/trip/${trip.id}`} className="trip-card">
                    <div className="row between gap-8">
                      <span className="mono fw-600 c-strong">{trip.id}</span>
                      <StatusPill status={trip.status} size="sm" />
                    </div>

                    <TripLeg shipment={trip} compact />

                    <div className="row between gap-8 t-sm c-muted">
                      <span>
                        {formatNumber(trip.cartons)} cartons · {trip.vehicleReg}
                      </span>
                      <span className="row gap-4">
                        <Icon name="clock" size={12} />
                        {formatTime(trip.slotStart)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      <div className="row gap-8">
        <Button variant="secondary" block icon="scan" to="/driver/scan">
          Scan
        </Button>
        <Button variant="danger-soft" block icon="alert" to="/driver/incident">
          Report incident
        </Button>
      </div>
    </div>
  )
}

export { TripLeg }
