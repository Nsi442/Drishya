import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useAppState, useDispatch, useToast } from '../../store/hooks.js'
import { selectShipment, ACTIONS } from '../../store/reducer.js'
import { useDriverQueue } from '../../components/layout/driverContext.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { submitPOD } from '../../services/shipmentService.js'
import { formatNumber } from '../../lib/format.js'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Input, { Textarea } from '../../components/ui/Input.jsx'
import { PhotoCapture } from '../../components/ui/FileDrop.jsx'
import Checkbox from '../../components/ui/Checkbox.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import Skeleton from '../../components/ui/Skeleton.jsx'
import { Callout } from '../../components/ui/Misc.jsx'
import SignaturePad from './SignaturePad.jsx'
import './driver.css'

export default function TripPOD() {
  const { id } = useParams()
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const queue = useDriverQueue()
  const sigRef = useRef(null)

  const shipment = selectShipment(state, id)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  const [form, setForm] = useState({ receiverName: '', cartonsReceived: '', hasIssue: false, damageNote: '' })
  const [signed, setSigned] = useState(false)
  const [photos, setPhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [queued, setQueued] = useState(false)

  useDocumentTitle(shipment ? `Proof of delivery ${shipment.id}` : 'Proof of delivery')

  if (loading) return <Skeleton height={480} radius="var(--radius)" />
  if (!shipment) {
    return <EmptyState tone="danger" icon="alertCircle" title="Trip not found" description={`No trip under ${id}.`} actionLabel="Back to today" actionTo="/driver" />
  }

  const expected = shipment.cartons
  const received = Number(form.cartonsReceived || 0)
  const shortfall = form.cartonsReceived === '' ? 0 : expected - received

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!form.receiverName.trim()) next.receiverName = 'Enter the name of the person receiving the goods'
    if (form.cartonsReceived === '') next.cartonsReceived = 'Enter how many cartons were accepted'
    else if (received < 0 || received > expected) next.cartonsReceived = `Must be between 0 and ${expected}`
    if (!signed) next.signature = 'A signature is required before the delivery can be closed'
    if (!photos.length) next.photos = 'Capture at least one photo at the dock'
    if (shortfall > 0 && !form.damageNote.trim()) next.damageNote = 'Explain the short count — this becomes an exception at the fulfilment centre'
    setErrors(next)
    if (Object.keys(next).length) return

    setSubmitting(true)
    const payload = {
      receiverName: form.receiverName.trim(),
      cartonsReceived: received,
      photos: photos.length,
      damageNote: form.damageNote.trim() || null,
      signature: sigRef.current?.toDataURL() ?? null,
    }

    // Optimistic in both cases — the driver has done their part either way.
    const optimistic = {
      ...shipment,
      status: 'delivered',
      deliveredAt: Date.now(),
      progress: 1,
      remainingKm: 0,
      pod: { ...payload, receivedAt: Date.now(), signatureAt: Date.now() },
      events: [
        ...shipment.events.filter((ev) => ev.stage !== 'delivered'),
        { stage: 'delivered', label: 'Delivered and received', detail: `Signed by ${payload.receiverName}`, at: Date.now(), done: true },
      ],
    }
    dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: optimistic })

    if (!queue.online) {
      queue.enqueue({ label: `POD ${shipment.id}`, run: () => submitPOD(shipment.id, payload) })
      setQueued(true)
      setSubmitting(false)
      toast.warn('Delivery saved on this phone', { description: 'It will be sent the moment you are back online.' })
      return
    }

    try {
      const saved = await submitPOD(shipment.id, payload)
      dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: saved })
      setQueued(true)
      toast.success('Delivery completed', { description: `${shipment.id} signed for by ${payload.receiverName}.` })
    } catch (err) {
      toast.error('Could not submit', { description: `${err.message} Your capture is safe — try again.` })
    } finally {
      setSubmitting(false)
    }
  }

  if (queued) {
    return (
      <div className="stack gap-16">
        <span className="empty-icon" style={{ background: 'var(--success-soft)', color: 'var(--success-text)', width: 56, height: 56, alignSelf: 'center' }}>
          <Icon name="checkCircle" size={28} />
        </span>

        <div style={{ textAlign: 'center' }}>
          <h2 className="t-xl c-strong">Delivery complete</h2>
          <p className="t-md c-muted mt-4">
            {shipment.id} signed for by {form.receiverName}.
          </p>
        </div>

        <Callout tone={queue.online ? 'success' : 'warn'} title={queue.online ? 'Sent' : 'Queued on this phone'}>
          {queue.online
            ? 'The vendor and the fulfilment centre can see the proof of delivery now.'
            : `Held locally with ${queue.pending} other item${queue.pending === 1 ? '' : 's'}. It sends automatically when the signal comes back.`}
        </Callout>

        <Button variant="primary" size="lg" block to="/driver">
          Back to today
        </Button>
        <Button variant="secondary" size="lg" block to={`/driver/trip/${shipment.id}`}>
          View this trip
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="stack gap-16" noValidate>
      <div className="row between gap-8">
        <span className="mono fw-700 c-strong t-lg">{shipment.id}</span>
        <span className="t-sm c-muted">{shipment.destination.name}</span>
      </div>

      <Card>
        <CardHeader title="Who received it" />
        <CardBody className="stack gap-16">
          <Input
            label="Receiver name"
            value={form.receiverName}
            onChange={(e) => setForm({ ...form, receiverName: e.target.value })}
            error={errors.receiverName}
            required
            size="lg"
            placeholder="Name of the person at the dock"
            autoComplete="off"
          />

          <Input
            label="Cartons accepted"
            type="number"
            min="0"
            max={expected}
            value={form.cartonsReceived}
            onChange={(e) => setForm({ ...form, cartonsReceived: e.target.value })}
            error={errors.cartonsReceived}
            required
            size="lg"
            hint={`${formatNumber(expected)} cartons were loaded`}
          />

          {shortfall > 0 ? (
            <Callout tone="danger" title={`Short by ${shortfall} carton${shortfall > 1 ? 's' : ''}`}>
              This raises a quantity shortage exception at the fulfilment centre. Say what happened below.
            </Callout>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Signature" subtitle="Ask the receiver to sign" />
        <CardBody>
          <SignaturePad ref={sigRef} onChange={setSigned} label={null} />
          {errors.signature ? (
            <span className="field-error mt-8">
              <Icon name="alertCircle" size={13} />
              {errors.signature}
            </span>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Photos" subtitle="Unloaded goods, the dock, anything damaged" />
        <CardBody className="stack gap-8">
          <PhotoCapture label={null} slots={4} photos={photos} onChange={setPhotos} />
          {errors.photos ? (
            <span className="field-error">
              <Icon name="alertCircle" size={13} />
              {errors.photos}
            </span>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Damage or shortage" />
        <CardBody className="stack gap-12">
          <Checkbox
            label="There is damage or a shortage to record"
            description="Adds a note the vendor and the receiving desk both see."
            checked={form.hasIssue || shortfall > 0}
            onChange={(v) => setForm({ ...form, hasIssue: v })}
            disabled={shortfall > 0}
          />

          {form.hasIssue || shortfall > 0 ? (
            <Textarea
              label="What happened"
              value={form.damageNote}
              onChange={(e) => setForm({ ...form, damageNote: e.target.value })}
              error={errors.damageNote}
              rows={3}
              placeholder="Two cartons with corner crush, photographed at the dock."
            />
          ) : null}
        </CardBody>
      </Card>

      <div className="action-bar">
        <Button type="submit" variant="primary" size="xl" block className="advance-btn" loading={submitting}>
          {queue.online ? 'Complete delivery' : 'Save on this phone'}
        </Button>
        <Button variant="ghost" size="sm" block to={`/driver/trip/${shipment.id}`}>
          Back to trip
        </Button>
      </div>
    </form>
  )
}
