// Start a trip on this consignment, and put a vehicle on it.
//
// Until this existed, `tripService.startTrip` was written and nothing in the
// app called it: the only way to create a Trip — and therefore the only way to
// get geofence events, engine predictions, an evidence pack or a row on the
// Live trips page — was to run simulator/simulate.py from a terminal. That is
// fine on a laptop and useless on a deployed URL, which is the case this is for.
//
// The vehicle is driven by the *backend*, not by this component. Closing the
// tab does not stop it. That is the difference from hooks/useLiveShipments.js,
// which animates shipments in the browser and freezes the moment nobody is
// looking — and it is why a demo left running over lunch has actually moved.

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../store/hooks.js'
import { trips as tripService } from '../../services/index.js'
import Card, { CardBody, CardHeader } from '../ui/Card.jsx'
import Button from '../ui/Button.jsx'
import Badge from '../ui/Badge.jsx'
import Skeleton from '../ui/Skeleton.jsx'
import { Progress } from '../ui/Misc.jsx'

// Matches the backend tick (drishya.simulation.tick-ms). Polling faster only
// re-renders the same numbers; slower makes the bar visibly jump.
const POLL_MS = 5000

const SIM_TONE = { running: 'info', arrived: 'success', stopped: 'neutral' }
const SIM_LABEL = { running: 'Vehicle moving', arrived: 'Arrived', stopped: 'Stopped' }

/** "2 min", "1 h 20 m" — the wait as a person would say it. */
function humanise(seconds) {
  if (seconds == null) return null
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
}

export default function TripLauncher({ shipment, onShipmentChange }) {
  const toast = useToast()

  // One object rather than four useStates: these always change together, and
  // splitting them produced a render where the trip had arrived and the
  // simulation still said running.
  const [state, setState] = useState({ status: 'loading', trip: null, simulation: null })
  const [busy, setBusy] = useState(false)

  const shipmentId = shipment?.id

  const load = useCallback(async () => {
    if (!shipmentId) return
    try {
      const all = await tripService.listTripsForShipment(shipmentId)
      const trip = all.find((t) => t.status === 'active') ?? all[0] ?? null

      let simulation = null
      if (trip) {
        try {
          simulation = await tripService.getSimulation(trip.tripId)
        } catch {
          // 404 is the ordinary answer for a trip nobody has simulated —
          // one driven by simulate.py or by a real device has no row here.
          simulation = null
        }
      }
      setState({ status: 'ready', trip, simulation })
    } catch (e) {
      setState({ status: 'error', trip: null, simulation: null, error: e.message })
    }
  }, [shipmentId])

  useEffect(() => {
    let alive = true
    let timer

    async function begin() {
      await load()
      if (!alive) return
      timer = setInterval(load, POLL_MS)
    }

    begin()
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [load])

  const { status, trip, simulation } = state
  const running = simulation?.status === 'running'

  // Everything the dispatch rules say about starting a trip, asked here too so
  // the button is absent rather than present-and-then-rejected. The backend
  // still enforces all of it — this only decides what to render.
  const closed = ['delivered', 'cancelled'].includes(shipment?.status)
  const docsPending = shipment?.status === 'docs_pending'
  const canStart = !trip && !closed && !docsPending

  async function onStart() {
    setBusy(true)
    try {
      const detail = await tripService.startTrip(shipmentId, {
        vehicleRegistration: shipment.vehicleReg,
        driverId: shipment.driverId,
      })
      const tripId = detail.trip.tripId

      // Two calls, not one. If the vehicle fails to start the trip is still
      // real and still on the road — it just has nothing feeding it, which is
      // exactly the state simulate.py expects to find and can take over.
      let sim = null
      try {
        sim = await tripService.startSimulation(tripId)
      } catch (e) {
        toast.warn('Trip started, but the vehicle did not', { description: e.message })
      }

      setState({ status: 'ready', trip: detail.trip, simulation: sim })
      // The trip flips the consignment to in_transit; the page is holding the
      // version it loaded, which would keep showing "Created" until a refresh.
      onShipmentChange?.({ ...shipment, status: 'in_transit' })

      if (sim) {
        toast.success('On the road', {
          description: `${shipment.vehicleReg} is driving ${shipment.lane}. Watch it on Live trips.`,
          to: '/vendor/trips',
          actionLabel: 'Live trips',
        })
      }
    } catch (e) {
      toast.error('Could not start the trip', { description: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function onSimulation(action) {
    setBusy(true)
    try {
      const sim = action === 'stop'
        ? await tripService.stopSimulation(trip.tripId)
        : await tripService.startSimulation(trip.tripId)
      setState((prev) => ({ ...prev, simulation: sim }))
    } catch (e) {
      toast.error(action === 'stop' ? 'Could not stop the vehicle' : 'Could not start the vehicle',
        { description: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return (
      <Card>
        <CardBody>
          <Skeleton height={72} />
        </CardBody>
      </Card>
    )
  }

  // A failed lookup must not hide the rest of the page. The trip either exists
  // or it does not; guessing which and offering the wrong button is worse than
  // saying nothing here.
  if (status === 'error') return null

  if (!trip && !canStart) return null

  return (
    <Card>
      <CardHeader
        title="Journey"
        subtitle={trip ? `Trip ${trip.tripId} · ${trip.laneCode ?? 'no lane matched'}` : shipment.lane}
        actions={simulation
          ? <Badge tone={SIM_TONE[simulation.status] ?? 'neutral'}>{SIM_LABEL[simulation.status] ?? simulation.status}</Badge>
          : null}
      />
      <CardBody>
        {canStart ? (
          <div className="stack gap-12">
            <p className="t-sm c-muted">
              Dispatches the consignment and drives {shipment.vehicleReg} along its route from
              the server. It keeps moving whether or not this page is open.
            </p>
            <Button variant="primary" icon="navigation" loading={busy} onClick={onStart}>
              Start trip
            </Button>
          </div>
        ) : null}

        {trip ? (
          <div className="stack gap-12">
            {simulation ? (
              <>
                <Progress
                  value={simulation.progress * 100}
                  tone={simulation.status === 'arrived' ? 'success' : undefined}
                  label={`${Math.round(simulation.progress * 100)}% of the route driven`}
                />
                <div className="row gap-12 wrap t-sm c-muted">
                  <span>{Math.round(simulation.travelledKm)} of {Math.round(simulation.routeKm)} km</span>
                  <span>{Math.round(simulation.speedKmph)} km/h · {Math.round(simulation.timeScale)}× time</span>
                  {running && simulation.realSecondsRemaining != null ? (
                    <span>~{humanise(simulation.realSecondsRemaining)} left</span>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="t-sm c-muted">
                This trip has no server-side vehicle. It is either being driven by
                simulator/simulate.py or waiting for one.
              </p>
            )}

            <div className="row gap-8 wrap">
              <Button variant="secondary" icon="map" to="/vendor/trips">
                Live trips
              </Button>
              {running ? (
                <Button variant="danger-soft" icon="x" loading={busy}
                  onClick={() => onSimulation('stop')}>
                  Stop vehicle
                </Button>
              ) : (
                // Restarting from the top is the "run it again" case, and it is
                // the common one in a demo.
                <Button variant="secondary" icon="navigation" loading={busy}
                  onClick={() => onSimulation('start')}>
                  {simulation ? 'Run again' : 'Start vehicle'}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
