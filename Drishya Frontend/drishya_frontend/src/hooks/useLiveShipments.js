// The simulation that makes the product feel alive.
//
// Every tick, each moving shipment advances along its polyline, its ETA is
// recomputed from the distance still to cover, and occasionally something goes
// wrong — a delay, a door left open, a device dropping off. Those raise a real
// alert and a toast, so the alert feed, the arrival board and the map are all
// describing the same event.
//
// Time is compressed: one real second is roughly forty simulated seconds, or
// nothing would appear to move while somebody is looking at it.

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useAppState, useDispatch } from '../store/hooks.js'
import { ACTIONS } from '../store/reducer.js'
import { positionAlongRoute } from '../lib/geo.js'
import { MOVING_STATUSES, DELAY_REASONS, ALERT_TYPES } from '../lib/constants.js'
import { commitLivePositions } from '../services/shipmentService.js'
import { pushAlert } from '../services/alertService.js'

const TICK_MS = 3000
const TIME_COMPRESSION = 40 // simulated seconds per real second
const MIN = 60000

// Chance per tick that the whole fleet throws up one incident.
const INCIDENT_CHANCE = 0.16

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

export default function useLiveShipments({ onEvent } = {}) {
  const state = useAppState()
  const dispatch = useDispatch()

  // The tick reads through refs so the interval is created once and never
  // resubscribes when a shipment moves.
  const shipmentsRef = useRef(state.shipments)
  const enabledRef = useRef(state.ui.liveEnabled)
  const onEventRef = useRef(onEvent)

  // Written in a layout effect rather than during render: a ref write is a side
  // effect, and this still lands before any interval callback can read it.
  useLayoutEffect(() => {
    shipmentsRef.current = state.shipments
    enabledRef.current = state.ui.liveEnabled
    onEventRef.current = onEvent
  })

  const tick = useCallback(() => {
    const { byId, ids } = shipmentsRef.current
    if (!ids.length) return

    const elapsedSimMs = TICK_MS * TIME_COMPRESSION
    const patches = []
    const movers = []

    ids.forEach((id) => {
      const s = byId[id]
      if (!s || !MOVING_STATUSES.includes(s.status)) return
      movers.push(s)

      // Speed wanders a little so the ETA is not a straight line.
      const speed = Math.max(18, Math.min(78, (s.speedKmph || 45) + (Math.random() - 0.5) * 8))
      const kmCovered = (speed * elapsedSimMs) / 3600000
      const progress = Math.min(1, s.progress + (s.distanceKm > 0 ? kmCovered / s.distanceKm : 0.01))
      const remainingKm = Math.max(0, Math.round(s.distanceKm * (1 - progress)))
      const position = positionAlongRoute(s.route, progress)

      // ETA from what is actually left to drive, not from the original plan.
      const hoursLeft = remainingKm / speed
      const predictedAt = Date.now() + hoursLeft * 3600000
      const delayMin = Math.round((predictedAt - s.promisedAt) / MIN)

      const patch = {
        id: s.id,
        progress,
        position,
        remainingKm,
        speedKmph: Math.round(speed),
        predictedAt,
        delayMin,
        updatedAt: Date.now(),
      }

      // A shipment that has run out of road has arrived.
      if (progress >= 0.995 && s.status !== 'at_gate') {
        patch.status = 'at_gate'
        patch.gateInAt = Date.now()
        patch.speedKmph = 0
        patch.events = [
          ...s.events,
          { stage: 'at_gate', label: 'Arrived at fulfilment centre gate', detail: 'Gate-in recorded automatically from vehicle position', at: Date.now(), done: true },
        ]

        const alert = pushAlert({
          type: 'arrival',
          severity: 'info',
          title: ALERT_TYPES.arrival,
          message: `${s.id} has arrived at the ${s.fcName} gate and is awaiting a dock.`,
          shipmentId: s.id,
          vendorId: s.vendorId,
          fcId: s.fcId,
        })
        dispatch({ type: ACTIONS.ALERTS_ADD, payload: alert })
        onEventRef.current?.({
          kind: 'arrival',
          tone: 'success',
          title: `${s.id} arrived at ${s.fcName}`,
          description: 'Awaiting dock assignment',
          shipmentId: s.id,
        })
      }

      // The delay reason has to appear the moment the delay does, or the at-risk
      // list shows a late shipment with nothing to explain it.
      if (delayMin > 15 && !s.delayReason) {
        patch.delayReason = randomFrom(DELAY_REASONS)
      }
      if (delayMin <= 15 && s.delayReason) {
        patch.delayReason = null
      }

      patches.push(patch)
    })

    if (patches.length) {
      dispatch({ type: ACTIONS.SHIPMENTS_TICK, payload: patches })
      // Keep the mock store in step so navigating away and back does not undo
      // the movement the user just watched.
      commitLivePositions(patches)
    }

    // --- occasional incidents ------------------------------------------
    if (movers.length && Math.random() < INCIDENT_CHANCE) {
      const s = randomFrom(movers)
      const kind = Math.random()

      if (kind < 0.45) {
        // A delay lands as an abrupt step, the way real traffic news does.
        const extraMin = 20 + Math.round(Math.random() * 70)
        const reason = randomFrom(DELAY_REASONS)
        const predictedAt = (s.predictedAt ?? s.promisedAt) + extraMin * MIN
        const delayMin = Math.round((predictedAt - s.promisedAt) / MIN)

        dispatch({
          type: ACTIONS.SHIPMENTS_TICK,
          payload: [{ id: s.id, predictedAt, delayMin, delayReason: reason, speedKmph: Math.max(8, Math.round((s.speedKmph || 40) * 0.4)) }],
        })
        commitLivePositions([{ id: s.id, predictedAt, delayMin, delayReason: reason }])

        const alert = pushAlert({
          type: 'delay',
          severity: delayMin > 90 ? 'critical' : 'warning',
          title: ALERT_TYPES.delay,
          message: `${s.id} is running ${delayMin} min behind the promised slot at ${s.fcName}. ${reason}`,
          shipmentId: s.id,
          vendorId: s.vendorId,
          fcId: s.fcId,
        })
        dispatch({ type: ACTIONS.ALERTS_ADD, payload: alert })
        onEventRef.current?.({
          kind: 'delay',
          tone: delayMin > 90 ? 'danger' : 'warn',
          title: `${s.id} delayed by ${extraMin} min`,
          description: reason,
          shipmentId: s.id,
        })
      } else if (kind < 0.72) {
        const alert = pushAlert({
          type: 'door_open',
          severity: 'critical',
          title: ALERT_TYPES.door_open,
          message: `Unscheduled door open detected on ${s.vehicleReg} while in transit to ${s.fcName}.`,
          shipmentId: s.id,
          vendorId: s.vendorId,
          fcId: s.fcId,
        })
        dispatch({ type: ACTIONS.ALERTS_ADD, payload: alert })

        // Record it on the sensor panel too, so the detail page corroborates it.
        const current = shipmentsRef.current.byId[s.id]
        if (current) {
          const door = [...(current.sensors?.door ?? []), { t: Date.now(), value: 1, state: 'open', durationMin: 1 + Math.round(Math.random() * 8), scheduled: false }]
          dispatch({ type: ACTIONS.SHIPMENTS_TICK, payload: [{ id: s.id, sensors: { ...current.sensors, door }, flash: false }] })
        }

        onEventRef.current?.({
          kind: 'door_open',
          tone: 'danger',
          title: `Door opened on ${s.vehicleReg}`,
          description: `In transit to ${s.fcName} — not at a scheduled stop`,
          shipmentId: s.id,
        })
      } else if (kind < 0.88) {
        const alert = pushAlert({
          type: 'shock',
          severity: 'warning',
          title: ALERT_TYPES.shock,
          message: `Shock of ${(1.8 + Math.random() * 1.4).toFixed(1)} g recorded on ${s.vehicleReg} — inspect cartons at receiving.`,
          shipmentId: s.id,
          vendorId: s.vendorId,
          fcId: s.fcId,
        })
        dispatch({ type: ACTIONS.ALERTS_ADD, payload: alert })
        onEventRef.current?.({
          kind: 'shock',
          tone: 'warn',
          title: `Shock event on ${s.vehicleReg}`,
          description: 'Flag cartons for inspection at the dock',
          shipmentId: s.id,
        })
      } else {
        const alert = pushAlert({
          type: 'device_offline',
          severity: 'warning',
          title: ALERT_TYPES.device_offline,
          message: `Tracking device on ${s.vehicleReg} has not reported for 38 minutes.`,
          shipmentId: s.id,
          vendorId: s.vendorId,
          fcId: s.fcId,
        })
        dispatch({ type: ACTIONS.ALERTS_ADD, payload: alert })
        onEventRef.current?.({
          kind: 'device_offline',
          tone: 'warn',
          title: `${s.vehicleReg} stopped reporting`,
          description: 'Last known position held on the map',
          shipmentId: s.id,
        })
      }
    }
  }, [dispatch])

  // The interval itself. Suspended whenever the tab is hidden — there is no
  // point simulating movement nobody is watching, and it keeps a backgrounded
  // tab from burning battery.
  useEffect(() => {
    let timer = null

    const start = () => {
      if (timer) return
      timer = setInterval(tick, TICK_MS)
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
  }, [tick, dispatch, state.ui.liveEnabled])

  // Flashed row ids are cleared shortly after a tick so the highlight is a
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
