import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppState, useDispatch, useToast } from '../../store/hooks.js'
import { selectShipment, ACTIONS } from '../../store/reducer.js'
import { useDriverQueue } from '../../components/layout/driverContext.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { advanceShipment } from '../../services/shipmentService.js'
import { DRIVER_ACTION } from '../../lib/constants.js'
import { formatTime, formatNumber, formatDateTime } from '../../lib/format.js'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import { StatusPill, DelayPill } from '../../components/ui/Badge.jsx'
import { ConfirmModal } from '../../components/ui/Modal.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import Skeleton from '../../components/ui/Skeleton.jsx'
import { DataPoint, Callout, Progress } from '../../components/ui/Misc.jsx'
import ShipmentMap from '../../components/map/ShipmentMap.jsx'
import Timeline from '../../components/shipment/Timeline.jsx'
import { TripLeg } from './DriverToday.jsx'
import './driver.css'

export default function TripDetail() {
  const { id } = useParams()
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const navigate = useNavigate()
  const queue = useDriverQueue()

  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const shipment = selectShipment(state, id)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  useDocumentTitle(shipment ? `Trip ${shipment.id}` : 'Trip')

  if (loading) {
    return (
      <div className="stack gap-12">
        <Skeleton height={40} />
        <Skeleton height={200} radius="var(--radius)" />
        <Skeleton height={160} radius="var(--radius)" />
      </div>
    )
  }

  if (!shipment) {
    return (
      <EmptyState
        tone="danger"
        icon="alertCircle"
        title="Trip not found"
        description={`No trip is assigned to you under ${id}.`}
        actionLabel="Back to today"
        actionTo="/driver"
      />
    )
  }

  const action = DRIVER_ACTION[shipment.status]
  const isDelivered = shipment.status === 'delivered'

  const advance = async () => {
    // The last step is proof of delivery, which is its own screen.
    if (action?.next === 'delivered') {
      setConfirming(false)
      navigate(`/driver/trip/${shipment.id}/pod`)
      return
    }

    setBusy(true)

    // Offline: apply locally and queue the write. The driver must never be
    // blocked by a signal they cannot control.
    if (!queue.online) {
      const optimistic = {
        ...shipment,
        status: action.next,
        events: [...shipment.events, { stage: action.next, label: action.note, detail: 'Captured offline — queued to sync', at: Date.now(), done: true }],
      }
      dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: optimistic })
      queue.enqueue({
        label: `${shipment.id} → ${action.next}`,
        run: () => advanceShipment(shipment.id, action.next, { label: action.note }),
      })
      toast.warn('Saved on this phone', { description: 'It will sync when you are back online.' })
      setBusy(false)
      setConfirming(false)
      return
    }

    try {
      const next = await advanceShipment(shipment.id, action.next, { label: action.note, detail: action.note })
      dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: next })
      toast.success(action.note)
      setConfirming(false)
    } catch (err) {
      toast.error('Could not update the trip', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack gap-16">
      <div className="row between gap-8 wrap">
        <span className="mono fw-700 c-strong t-xl">{shipment.id}</span>
        <StatusPill status={shipment.status} />
      </div>

      <div className="row gap-8 wrap">
        <DelayPill minutes={shipment.delayMin} size="sm" />
        <span className="t-sm c-muted">{shipment.vehicleReg}</span>
        <span className="t-sm c-muted">Seal {shipment.sealNumber}</span>
      </div>

      {shipment.delayReason ? (
        <Callout tone="warn" title="Running behind">
          {shipment.delayReason}
        </Callout>
      ) : null}

      <Card>
        <CardBody flush>
          <ShipmentMap shipments={[shipment]} selectedId={shipment.id} showRoutes="all" cluster={false} height={200} className="dm-map-flush" fitKey={shipment.id} />
        </CardBody>
      </Card>

      <Card padded>
        <TripLeg shipment={shipment} />

        <div className="row gap-8">
          <Button
            variant="secondary"
            block
            icon="navigation"
            href={`https://www.openstreetmap.org/directions?from=${shipment.position.lat},${shipment.position.lng}&to=${shipment.destination.lat},${shipment.destination.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Navigate
          </Button>
          <Button variant="secondary" block icon="phone" href={`tel:${shipment.driverPhone.replace(/\s/g, '')}`}>
            FC gate
          </Button>
        </div>
      </Card>

      {!isDelivered ? (
        <Card padded>
          <div className="row between t-sm c-muted mb-8">
            <span>{formatNumber(shipment.distanceKm - shipment.remainingKm)} km done</span>
            <span>{formatNumber(shipment.remainingKm)} km left</span>
          </div>
          <Progress value={shipment.progress * 100} tone={shipment.delayMin > 15 ? 'warn' : 'accent'} label="Trip progress" />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Consignment" />
        <CardBody>
          <div className="grid grid-2 gap-12">
            <DataPoint label="Cartons" value={formatNumber(shipment.cartons)} />
            <DataPoint label="Weight" value={`${formatNumber(shipment.weightKg)} kg`} />
            <DataPoint label="Commodity" value={shipment.commodity} />
            <DataPoint label="Reference" value={shipment.reference} mono />
            <DataPoint label="Dock slot" value={formatTime(shipment.slotStart)} />
            <DataPoint label="Dock" value={shipment.dockId ? shipment.dockId.split('-').slice(-2).join(' ').replace('dock', 'Dock') : 'On arrival'} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Progress" />
        <CardBody>
          <Timeline shipment={shipment} compact />
        </CardBody>
      </Card>

      <div className="row gap-8">
        <Button variant="secondary" block icon="clipboard" to={`/driver/trip/${shipment.id}/checklist`}>
          Checklist
        </Button>
        <Button variant="secondary" block icon="file" to="/driver/documents">
          Documents
        </Button>
      </div>

      {isDelivered ? (
        <Callout tone="success" title="Delivered">
          Signed for by {shipment.pod?.receiverName ?? 'the receiving desk'}
          {shipment.deliveredAt ? ` at ${formatDateTime(shipment.deliveredAt)}` : ''}.
        </Callout>
      ) : action ? (
        <div className="action-bar">
          <Button variant="primary" size="xl" block className="advance-btn" onClick={() => setConfirming(true)} loading={busy}>
            {action.label}
            <Icon name="arrowRight" size={18} />
          </Button>
          <Button variant="ghost" size="sm" block icon="alert" to="/driver/incident">
            Something is wrong — report it
          </Button>
        </div>
      ) : null}

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={advance}
        loading={busy}
        title={action?.label ?? 'Update trip'}
        description={
          action?.next === 'delivered'
            ? 'This takes you to proof of delivery — you will capture the receiver name, a signature and photos.'
            : `This records "${action?.note}" against ${shipment.id} and tells the vendor and the fulfilment centre.`
        }
        confirmLabel={action?.next === 'delivered' ? 'Capture proof of delivery' : 'Confirm'}
      />
    </div>
  )
}
