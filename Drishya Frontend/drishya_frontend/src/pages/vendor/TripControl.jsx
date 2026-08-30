import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { trips as tripService } from '../../services/index.js'
import { listFulfilmentCentres } from '../../services/fleetService.js'
import { formatTime } from '../../lib/format.js'
import Card, { CardBody, CardHeader } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { ErrorState } from '../../components/ui/EmptyState.jsx'
import Skeleton from '../../components/ui/Skeleton.jsx'
import Table from '../../components/ui/Table.jsx'
import { PageHeader, LiveIndicator } from '../../components/ui/Misc.jsx'
import TripMap from '../../components/map/TripMap.jsx'
import './trips.css'

/**
 * Every trip currently on the road, as the backend actually recorded it.
 *
 * This page reads recorded positions, real geofences and real predictions —
 * unlike the older LiveMap, which renders the browser-side simulation in
 * hooks/useLiveShipments.js. Both are kept because they answer different
 * questions: that one shows what a busy day looks like, this one shows what
 * actually happened.
 *
 * **Polling, every 10 seconds.** A WebSocket would be tidier and was considered;
 * it needs a STOMP broker on the backend and a reconnect strategy in the
 * browser, for a feed that changes once a minute when the ETA cycle runs. Ten
 * seconds is well inside human latency for this decision, and it keeps the
 * failure mode boring: a dropped poll is retried, not a dead socket nobody
 * notices until the map silently stops moving.
 */
export default function TripControl() {
  useDocumentTitle('Live trips')

  const [state, setState] = useState({ status: 'loading', trips: [], traces: {}, centres: [] })
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async (withCentres) => {
    try {
      const active = await tripService.listActiveTrips()

      // Traces are fetched per trip. Only for trips that are actually
      // reporting — asking for the trace of a trip with no fixes is a round
      // trip for an empty array.
      const entries = await Promise.all(
        active
          .filter((t) => t.lastLat != null)
          .map(async (t) => {
            try {
              return [t.tripId, await tripService.getTripPositions(t.tripId)]
            } catch {
              // One unreadable trace must not blank the whole map.
              return [t.tripId, []]
            }
          }),
      )

      setState((prev) => ({
        status: 'ready',
        trips: active,
        traces: Object.fromEntries(entries),
        // Sites change approximately never, so they are fetched once and then
        // carried forward rather than re-requested every ten seconds.
        centres: withCentres ?? prev.centres,
      }))
      setLastUpdated(Date.now())
    } catch (e) {
      setState((prev) => ({ ...prev, status: 'error', error: e.message }))
    }
  }, [])

  useEffect(() => {
    let alive = true
    let timer

    async function begin() {
      let centres = []
      try {
        centres = await listFulfilmentCentres()
      } catch {
        // The map still works without the fences; it just cannot explain a
        // gate-in as clearly.
      }
      if (!alive) return
      await load(centres)
      timer = setInterval(() => load(), 10_000)
    }

    begin()
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [load])

  const { status, trips, traces, centres } = state

  return (
    <>
      <PageHeader
        title="Live trips"
        subtitle="Trips on the road now, from recorded positions and live predictions"
      >
        {lastUpdated && <LiveIndicator label={`Updated ${formatTime(lastUpdated)}`} />}
      </PageHeader>

      {status === 'error' ? (
        <ErrorState title="Could not load active trips" error={state.error} onRetry={() => load()} />
      ) : (
        <>
          <Card className="mb-24">
            <CardBody flush>
              {status === 'loading' ? (
                <Skeleton height={460} />
              ) : (
                <TripMap trips={trips} traces={traces} centres={centres} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Active trips"
              subtitle="Predicted dock-in against the window each consignment was booked into"
            />
            <CardBody flush>
              <TripTable trips={trips} loading={status === 'loading'} />
            </CardBody>
          </Card>
        </>
      )}
    </>
  )
}

/**
 * Predicted against booked, side by side.
 *
 * The two times are the whole product, so they sit in adjacent columns and the
 * risk state is derived from the comparison rather than asserted separately — a
 * pill that could disagree with the numbers printed next to it would be worse
 * than no pill at all.
 */
function TripTable({ trips, loading }) {
  const columns = [
    {
      key: 'shipmentReference',
      header: 'Consignment',
      width: 150,
      render: (t) => (
        <Link to={`/vendor/shipments/${t.shipmentId}`} className="mono fw-600">
          {t.shipmentReference ?? t.shipmentId}
        </Link>
      ),
    },
    {
      key: 'vehicleRegistration',
      header: 'Vehicle',
      width: 140,
      render: (t) => t.vehicleRegistration ?? '—',
    },
    {
      key: 'laneCode',
      header: 'Lane',
      width: 110,
      render: (t) =>
        t.laneCode ?? <span className="text-muted">unmatched</span>,
    },
    {
      key: 'predictedDockInAt',
      header: 'Predicted dock-in',
      width: 200,
      render: (t) =>
        t.predictedDockInAt ? (
          <span>
            {formatTime(t.predictedDockInAt)}
            {/* The band, not just the midpoint. A dispatcher deciding whether
                to rebook needs the worst case, not the best guess. */}
            {t.confidenceHighAt && (
              <span className="trip-band"> up to {formatTime(t.confidenceHighAt)}</span>
            )}
          </span>
        ) : (
          <span className="text-muted">awaiting a fix</span>
        ),
    },
    {
      key: 'slotEnd',
      header: 'Booked slot',
      width: 160,
      render: (t) =>
        t.slotStart && t.slotEnd
          ? `${formatTime(t.slotStart)} – ${formatTime(t.slotEnd)}`
          : '—',
    },
    {
      key: 'risk',
      header: 'State',
      width: 140,
      render: (t) => <RiskBadge risk={t.risk} minutesLate={t.minutesLate} />,
    },
  ]

  return (
    <Table
      columns={columns}
      rows={trips}
      getRowId={(t) => t.tripId}
      loading={loading}
      emptyIcon="truck"
      emptyTitle="Nothing on the road"
      emptyDescription="A trip appears here once a consignment is dispatched. Start one from a shipment, or run the simulator against this API."
    />
  )
}

/** Colour plus a word, never colour alone. */
function RiskBadge({ risk, minutesLate }) {
  const map = {
    on_time: { tone: 'success', label: 'On time' },
    early: { tone: 'info', label: 'Early' },
    at_risk: { tone: 'warn', label: 'At risk' },
    late: { tone: 'danger', label: 'Late' },
    unknown: { tone: 'neutral', label: 'No prediction' },
  }
  const { tone, label } = map[risk] ?? map.unknown

  // The magnitude is what decides whether anyone acts, so it goes in the badge
  // rather than being left for the reader to subtract.
  const suffix =
    risk === 'late' && minutesLate != null
      ? ` ${minutesLate} min`
      : risk === 'early' && minutesLate != null
        ? ` ${Math.abs(minutesLate)} min`
        : ''

  return <Badge tone={tone}>{label + suffix}</Badge>
}
