// Keeps every open portal showing what the server actually believes.
//
// This hook used to be a simulation. Each browser advanced its own copy of
// every moving consignment three times a second, recomputed its own ETA from
// its own random walk, invented its own delays and door-opens, and posted the
// result back over whatever the server had. Three people signed in meant three
// answers to "where is this lorry", all confident, none of them the platform's
// — and the alert one of them saw did not exist for the other two, because
// pushAlert only ever built an object in that tab.
//
// The server drives now. TripSimulationJob moves the vehicle, ingest records
// the fix, the geofence reads it, and the ETA engine predicts against it. All
// of that happens whether anyone is looking or not, which is what makes it
// something three portals can agree with. This polls it.
//
// The interval, the visibility pause and the "Live" indicator are unchanged —
// the same machinery, doing the opposite thing: reading instead of writing.

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useAppState, useDispatch } from '../store/hooks.js'
import { ACTIONS } from '../store/reducer.js'
import { ALERT_SEVERITY, ALERT_TYPES } from '../lib/constants.js'
import { listAllShipments } from '../services/shipmentService.js'
import { listAlerts } from '../services/alertService.js'

// Matched to drishya.simulation.tick-ms, the rate the server moves vehicles at.
// Polling faster than the thing being polled changes only the request count.
const POLL_MS = 5000

// Fields worth flashing a row for. Deliberately not every field: updatedAt
// alone changes on each accepted fix, and a table where every row flashes
// every five seconds is a table nobody can read.
const WATCHED = ['status', 'progress', 'predictedAt', 'delayMin', 'dockId', 'delayReason']

// Above this many at once, the toasts stop being information and start being a
// queue to dismiss. Happens after a tab has been asleep, or on a slow first poll.
const MAX_TOASTS_PER_POLL = 3

function changedIds(previousById, rows) {
  const flashed = []
  rows.forEach((row) => {
    const before = previousById[row.id]
    if (!before) return          // new to this caller — arrival, not a change
    if (WATCHED.some((key) => before[key] !== row[key])) flashed.push(row.id)
  })
  return flashed
}

export default function useLiveShipments({ onEvent, hold = false } = {}) {
  const state = useAppState()
  const dispatch = useDispatch()

  // The poll reads through refs so the interval is created once and does not
  // resubscribe every time a shipment moves.
  const shipmentsRef = useRef(state.shipments)
  const alertIdsRef = useRef(null)
  const enabledRef = useRef(state.ui.liveEnabled)
  const holdRef = useRef(hold)
  const signedInRef = useRef(Boolean(state.auth.user))
  const loadedRef = useRef(state.shipments.status === 'ready')
  const onEventRef = useRef(onEvent)
  const inFlightRef = useRef(false)

  // Written in a layout effect rather than during render: a ref write is a side
  // effect, and this still lands before any interval callback can read it.
  useLayoutEffect(() => {
    shipmentsRef.current = state.shipments
    enabledRef.current = state.ui.liveEnabled
    signedInRef.current = Boolean(state.auth.user)
    loadedRef.current = state.shipments.status === 'ready'
    holdRef.current = hold
    onEventRef.current = onEvent
  })

  // Raises a toast for alerts that are new since the last poll.
  //
  // The first poll only records what exists; it never announces. Otherwise
  // signing in would fire a toast for every alert already in the feed, which
  // is both a wall of notifications and a lie about when they happened.
  const announce = useCallback(
    (alerts) => {
      dispatch({ type: ACTIONS.ALERTS_SET, payload: alerts })

      const seen = alertIdsRef.current
      alertIdsRef.current = new Set(alerts.map((a) => a.id))
      if (!seen) return

      alerts
        .filter((a) => !seen.has(a.id))
        .slice(0, MAX_TOASTS_PER_POLL)
        .forEach((a) =>
          onEventRef.current?.({
            kind: a.type,
            tone: ALERT_SEVERITY[a.severity]?.tone ?? 'info',
            title: a.title || ALERT_TYPES[a.type] || 'Update',
            description: a.message,
            shipmentId: a.shipmentId,
          }),
        )
    },
    [dispatch],
  )

  const poll = useCallback(async () => {
    // One request in flight at a time. On a slow connection a five-second
    // interval would otherwise stack polls until the oldest reply overwrites
    // the newest — the store would go backwards while the network caught up.
    if (inFlightRef.current) return
    // The token lives in memory only, so a poll that outruns sign-out — or
    // starts before sign-in has finished — is a guaranteed 401 and a spurious
    // error toast. Cheaper to not ask.
    if (!signedInRef.current) return

    // Nothing to keep up to date yet. useShipmentStore owns the first read —
    // the full one, routes included — and polling before it lands would race
    // it with a set the store cannot merge: every row would look new, because
    // there is nothing held to compare against, and the poll would fetch the
    // whole thing again to recover the polylines it asked not to be sent.
    if (!loadedRef.current) return

    // Held while this device has writes the server has not accepted yet — the
    // driver's offline queue. A poll would replace the store with an answer
    // that is knowably behind this screen, so the gate-in the driver just
    // recorded would vanish in front of them and reappear when the queue
    // drained. The offline toggle in the driver shell is a demo switch rather
    // than a real disconnection, so the network is usually still up and the
    // request would succeed: being offline is not what makes this unsafe,
    // having unsynced work is.
    if (holdRef.current) return

    inFlightRef.current = true

    try {
      // Without polylines. A route is fixed at booking and is most of the
      // response once it is a real road, so the poll asks for everything that
      // changes and nothing that cannot.
      const [rows, alerts] = await Promise.all([
        listAllShipments({ withRoute: false }),
        listAlerts({}).catch(() => null),
      ])

      const held = shipmentsRef.current.byId

      dispatch({
        type: ACTIONS.SHIPMENTS_SYNC,
        payload: { rows, flashed: changedIds(held, rows) },
      })

      // A consignment this client has not seen before — booked in another
      // portal, or newly in scope — arrived without the route it needs to be
      // drawn, and there is nothing held to carry forward. One full read
      // fetches every missing polyline at once. Rare by construction: it
      // happens when a consignment appears, not on the ticks in between.
      if (rows.some((row) => !row.route?.length && !held[row.id]?.route?.length)) {
        const full = await listAllShipments()
        dispatch({
          type: ACTIONS.SHIPMENTS_SYNC,
          payload: { rows: full, flashed: [] },
        })
      }

      if (alerts) announce(alerts)
    } catch {
      // A failed poll is not an error state. The store still holds the last
      // good answer, which is the right thing to keep showing — replacing a
      // working board with a message about one dropped request would be worse
      // than being five seconds stale. The next poll retries.
    } finally {
      inFlightRef.current = false
    }
  }, [dispatch, announce])

  // The interval. Suspended whenever the tab is hidden — there is no point
  // polling for a screen nobody is looking at, and it keeps a backgrounded tab
  // off the network and off the battery.
  useEffect(() => {
    let timer = null

    const start = () => {
      if (timer) return
      poll()                                  // immediately, then on the interval
      timer = setInterval(poll, POLL_MS)
      dispatch({ type: ACTIONS.UI_SET, payload: { livePaused: false } })
    }

    const stop = (paused) => {
      if (timer) clearInterval(timer)
      timer = null
      if (paused) dispatch({ type: ACTIONS.UI_SET, payload: { livePaused: true } })
    }

    const sync = () => {
      if (document.hidden || !enabledRef.current) stop(true)
      else start()
    }

    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      if (timer) clearInterval(timer)
    }
  }, [poll, dispatch, state.ui.liveEnabled, state.auth.user, state.shipments.status])

  // Flashed row ids are cleared shortly after a poll so the highlight is a
  // flash rather than a permanent state.
  useEffect(() => {
    if (!state.shipments.flashed.length) return undefined
    const t = setTimeout(() => dispatch({ type: ACTIONS.SHIPMENTS_CLEAR_FLASH }), 1400)
    return () => clearTimeout(t)
  }, [state.shipments.flashed, dispatch])

  return {
    lastTick: state.shipments.lastTick,
    paused: state.ui.livePaused,
    enabled: state.ui.liveEnabled,
  }
}
