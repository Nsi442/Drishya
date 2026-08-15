// Loads the shipment set, the alert feed and the reference data into the store
// once per session. The live tick reads shipments from the store, so it has to
// be populated before the simulation is useful.

import { useEffect } from 'react'
import { useAppState, useDispatch } from '../store/hooks.js'
import { ACTIONS } from '../store/reducer.js'
import { listAllShipments } from '../services/shipmentService.js'
import { listAlerts } from '../services/alertService.js'
import { loadReferenceData } from '../services/referenceData.js'

export default function useShipmentStore() {
  const state = useAppState()
  const dispatch = useDispatch()
  const { status } = state.shipments
  const alertStatus = state.alerts.status
  const user = state.auth.user

  useEffect(() => {
    if (status !== 'idle' || !user) return
    dispatch({ type: ACTIONS.SHIPMENTS_LOADING })

    // Reference data first so selects, dock names and the command palette have
    // something to show by the time the first screen paints.
    loadReferenceData()
      .catch(() => null)
      .then(() => listAllShipments())
      .then((rows) => dispatch({ type: ACTIONS.SHIPMENTS_SET, payload: rows }))
      .catch((err) => dispatch({ type: ACTIONS.SHIPMENTS_ERROR, payload: err.message }))
  }, [status, user, dispatch])

  useEffect(() => {
    if (alertStatus !== 'idle' || !user) return
    dispatch({ type: ACTIONS.ALERTS_LOADING })
    listAlerts({})
      .then((rows) => dispatch({ type: ACTIONS.ALERTS_SET, payload: rows }))
      .catch((err) => dispatch({ type: ACTIONS.ALERTS_ERROR, payload: err.message }))
  }, [alertStatus, user, dispatch])

  return {
    status,
    error: state.shipments.error,
    ready: status === 'ready',
  }
}
