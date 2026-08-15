import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppState, useToast } from '../../store/hooks.js'
import { selectShipment } from '../../store/reducer.js'
import { useDriverQueue } from '../../components/layout/driverContext.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { saveChecklist } from '../../services/shipmentService.js'
import { DOC_TYPES } from '../../lib/constants.js'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Input, { Textarea } from '../../components/ui/Input.jsx'
import { PhotoCapture } from '../../components/ui/FileDrop.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import Skeleton from '../../components/ui/Skeleton.jsx'
import { Callout, Progress } from '../../components/ui/Misc.jsx'
import './driver.css'

const VEHICLE_CHECKS = [
  { key: 'tyres', label: 'Tyres and pressure', hint: 'No visible cuts, bulges or under-inflation' },
  { key: 'brakes', label: 'Brakes tested', hint: 'Including the parking brake' },
  { key: 'lights', label: 'Lights and indicators', hint: 'Head, tail, brake and hazard' },
  { key: 'fuel', label: 'Fuel and fluids', hint: 'Enough for the full leg' },
  { key: 'body', label: 'Cargo body clean and dry', hint: 'No damp, no residue from the last load' },
  { key: 'load', label: 'Load secured', hint: 'Straps, dunnage and edge protection in place' },
]

const DOC_CHECKS = ['invoice', 'eway', 'lr', 'gst']

export default function TripChecklist() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useAppState()
  const toast = useToast()
  const queue = useDriverQueue()

  const shipment = selectShipment(state, id)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  const [checks, setChecks] = useState({})
  const [docs, setDocs] = useState({})
  const [seal, setSeal] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useDocumentTitle(shipment ? `Checklist ${shipment.id}` : 'Checklist')

  if (loading) return <Skeleton height={420} radius="var(--radius)" />
  if (!shipment) {
    return <EmptyState tone="danger" icon="alertCircle" title="Trip not found" description={`No trip under ${id}.`} actionLabel="Back to today" actionTo="/driver" />
  }

  // Three states per row: unchecked → passed → failed. A fault has to be
  // recordable, not just skippable.
  const cycle = (key) =>
    setChecks((c) => ({ ...c, [key]: c[key] === 'ok' ? 'fail' : c[key] === 'fail' ? undefined : 'ok' }))

  const passed = VEHICLE_CHECKS.filter((c) => checks[c.key] === 'ok').length
  const failed = VEHICLE_CHECKS.filter((c) => checks[c.key] === 'fail')
  const docsPresent = DOC_CHECKS.filter((d) => docs[d]).length
  const totalDone = passed + docsPresent
  const totalItems = VEHICLE_CHECKS.length + DOC_CHECKS.length

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!seal.trim()) next.seal = 'Enter the seal number applied at loading'
    const unchecked = VEHICLE_CHECKS.filter((c) => !checks[c.key])
    if (unchecked.length) next.checks = `${unchecked.length} vehicle checks still need a pass or fail`
    if (docsPresent === 0) next.docs = 'Confirm at least the invoice and e-way bill are with you'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    const payload = { vehicle: checks, documents: docs, sealNumber: seal, notes, photos: photos.length, failures: failed.map((f) => f.key) }

    if (!queue.online) {
      queue.enqueue({ label: `Checklist ${shipment.id}`, run: () => saveChecklist(shipment.id, payload) })
      toast.warn('Checklist saved on this phone', { description: 'It will sync when the signal returns.' })
      setSaving(false)
      navigate(`/driver/trip/${shipment.id}`)
      return
    }

    try {
      await saveChecklist(shipment.id, payload)
      toast.success('Pre-trip checklist saved', { description: failed.length ? `${failed.length} fault${failed.length > 1 ? 's' : ''} flagged to dispatch.` : 'Vehicle cleared for the run.' })
      navigate(`/driver/trip/${shipment.id}`)
    } catch (err) {
      toast.error('Could not save the checklist', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack gap-16" noValidate>
      <div>
        <div className="row between t-sm c-muted mb-8">
          <span className="mono fw-600 c-strong">{shipment.id}</span>
          <span>
            {totalDone} of {totalItems} done
          </span>
        </div>
        <Progress value={totalDone} max={totalItems} tone={totalDone === totalItems ? 'success' : 'accent'} label="Checklist progress" />
      </div>

      {failed.length ? (
        <Callout tone="danger" title={`${failed.length} fault${failed.length > 1 ? 's' : ''} recorded`}>
          {failed.map((f) => f.label).join(', ')}. Dispatch is told as soon as you save — do not start the trip until
          this is cleared.
        </Callout>
      ) : null}

      <Card>
        <CardHeader title="Vehicle condition" subtitle="Tap once for pass, twice for fault" />
        <CardBody className="stack gap-8">
          {VEHICLE_CHECKS.map((check) => {
            const value = checks[check.key]
            return (
              <button
                key={check.key}
                type="button"
                className={`check-row ${value === 'ok' ? 'is-done' : ''} ${value === 'fail' ? 'is-failed' : ''}`}
                onClick={() => cycle(check.key)}
                aria-pressed={value === 'ok'}
              >
                <span className="check-row-box">
                  <Icon name={value === 'fail' ? 'x' : 'check'} size={15} />
                </span>
                <span className="grow">
                  <span className="fw-600 c-strong t-md" style={{ display: 'block' }}>
                    {check.label}
                  </span>
                  <span className="t-sm c-muted">{value === 'fail' ? 'Fault recorded — dispatch will be told' : check.hint}</span>
                </span>
              </button>
            )
          })}
          {errors.checks ? (
            <span className="field-error">
              <Icon name="alertCircle" size={13} />
              {errors.checks}
            </span>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Documents with you" subtitle="Physical copies in the cab" />
        <CardBody className="stack gap-8">
          {DOC_CHECKS.map((key) => (
            <button
              key={key}
              type="button"
              className={`check-row ${docs[key] ? 'is-done' : ''}`}
              onClick={() => setDocs((d) => ({ ...d, [key]: !d[key] }))}
              aria-pressed={Boolean(docs[key])}
            >
              <span className="check-row-box">
                <Icon name="check" size={15} />
              </span>
              <span className="grow">
                <span className="fw-600 c-strong t-md" style={{ display: 'block' }}>
                  {DOC_TYPES[key]}
                </span>
                <span className="t-sm c-muted">
                  {shipment.documents.find((d) => d.type === key)?.number ?? 'Not on the digital record'}
                </span>
              </span>
            </button>
          ))}
          {errors.docs ? (
            <span className="field-error">
              <Icon name="alertCircle" size={13} />
              {errors.docs}
            </span>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Seal & photos" />
        <CardBody className="stack gap-16">
          <Input
            label="Seal number applied"
            value={seal}
            onChange={(e) => setSeal(e.target.value)}
            error={errors.seal}
            required
            className="mono"
            placeholder={shipment.sealNumber}
            hint={`Booking says ${shipment.sealNumber}. Enter what is actually on the vehicle.`}
            size="lg"
          />

          {seal && seal.trim() !== shipment.sealNumber ? (
            <Callout tone="warn" title="Seal does not match the booking">
              The fulfilment centre will check this at the gate. Make sure it is right.
            </Callout>
          ) : null}

          <PhotoCapture label="Load photos" slots={4} photos={photos} onChange={setPhotos} />

          <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything dispatch should know before you set off." />
        </CardBody>
      </Card>

      <div className="action-bar">
        <Button type="submit" variant="primary" size="xl" block className="advance-btn" loading={saving}>
          {queue.online ? 'Save checklist' : 'Save on this phone'}
        </Button>
        <Button variant="ghost" size="sm" block to={`/driver/trip/${shipment.id}`}>
          Back to trip
        </Button>
      </div>
    </form>
  )
}
