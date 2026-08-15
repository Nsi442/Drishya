import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppState, useToast, useAuth } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import { useDriverQueue } from '../../components/layout/driverContext.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { reportIncident } from '../../services/shipmentService.js'
import { INCIDENT_TYPES, ACTIVE_STATUSES } from '../../lib/constants.js'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Select from '../../components/ui/Select.jsx'
import { Textarea } from '../../components/ui/Input.jsx'
import { PhotoCapture } from '../../components/ui/FileDrop.jsx'
import { Callout, DataPoint } from '../../components/ui/Misc.jsx'
import './driver.css'

const TYPE_ICON = {
  breakdown: 'alert',
  accident: 'alertCircle',
  route_block: 'navigation',
  detention: 'clock',
  other: 'info',
}

const SEVERITY_HINT = {
  breakdown: 'Dispatch will arrange recovery and tell the fulfilment centre the slot is at risk.',
  accident: 'Treated as critical. Dispatch is paged immediately — stay safe and stay with the vehicle.',
  route_block: 'A new ETA is calculated and the dock slot is renegotiated automatically.',
  detention: 'The detention clock is already running; this records why.',
  other: 'Goes to dispatch as a general note against this trip.',
}

export default function DriverIncident() {
  useDocumentTitle('Report an incident')
  const navigate = useNavigate()
  const toast = useToast()
  const state = useAppState()
  const { user } = useAuth()
  const queue = useDriverQueue()
  const [params] = useSearchParams()

  const shipments = selectShipments(state)
  const trips = useMemo(
    () => shipments.filter((s) => s.driverId === (user?.driverId ?? 'driver-1') && ACTIVE_STATUSES.includes(s.status)),
    [shipments, user],
  )

  const [form, setForm] = useState({ type: '', shipmentId: params.get('shipment') ?? '', description: '' })
  const [photos, setPhotos] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  // Both of these are derived rather than mirrored into state: the selected
  // trip falls back to the first active one, and the position comes from
  // whatever trip that resolves to. An incident report without a location is
  // much less useful to whoever has to respond to it.
  const shipmentId = form.shipmentId || trips[0]?.id || ''

  const location = useMemo(() => {
    const trip = trips.find((t) => t.id === shipmentId) ?? trips[0]
    if (!trip?.position) return null
    return { lat: trip.position.lat, lng: trip.position.lng, source: 'vehicle tracker' }
  }, [trips, shipmentId])

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!form.type) next.type = 'Choose what kind of incident this is'
    if (!form.description.trim()) next.description = 'Describe what happened'
    else if (form.description.trim().length < 12) next.description = 'Add a little more detail — dispatch acts on this'
    setErrors(next)
    if (Object.keys(next).length) return

    setSubmitting(true)
    const payload = {
      type: form.type,
      shipmentId: shipmentId || null,
      description: form.description.trim(),
      photos: photos.length,
      location,
      reportedBy: user?.name ?? 'Driver',
    }

    if (!queue.online) {
      queue.enqueue({ label: `Incident ${form.type}`, run: () => reportIncident(payload) })
      setSent(true)
      setSubmitting(false)
      toast.warn('Incident saved on this phone', { description: 'It will be sent as soon as you have signal.' })
      return
    }

    try {
      await reportIncident(payload)
      setSent(true)
      toast.success('Incident reported', { description: 'Dispatch and the fulfilment centre have been told.' })
    } catch (err) {
      toast.error('Could not send the report', { description: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="stack gap-16">
        <span className="empty-icon" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)', width: 56, height: 56, alignSelf: 'center' }}>
          <Icon name="checkCircle" size={28} />
        </span>
        <div style={{ textAlign: 'center' }}>
          <h2 className="t-xl c-strong">Report sent</h2>
          <p className="t-md c-muted mt-4">{INCIDENT_TYPES[form.type]} recorded against {shipmentId || 'your shift'}.</p>
        </div>
        <Callout tone="info" title="What happens next">
          {SEVERITY_HINT[form.type]}
        </Callout>
        <Button variant="primary" size="lg" block to="/driver">
          Back to today
        </Button>
        {shipmentId ? (
          <Button variant="secondary" size="lg" block to={`/driver/trip/${shipmentId}`}>
            Back to the trip
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="stack gap-16" noValidate>
      <Callout tone="danger" icon="phone" title="If anyone is hurt, call 112 first">
        Report it here afterwards. Your safety comes before the consignment.
      </Callout>

      <Card>
        <CardHeader title="What happened" />
        <CardBody className="stack gap-12">
          <div className="stack gap-8">
            {Object.entries(INCIDENT_TYPES).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`check-row ${form.type === value ? 'is-done' : ''}`}
                onClick={() => setForm({ ...form, type: value })}
                aria-pressed={form.type === value}
              >
                <span className="check-row-box">
                  <Icon name="check" size={15} />
                </span>
                <span className="grow">
                  <span className="row gap-8">
                    <Icon name={TYPE_ICON[value]} size={15} className="c-muted" />
                    <span className="fw-600 c-strong t-md">{label}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          {errors.type ? (
            <span className="field-error">
              <Icon name="alertCircle" size={13} />
              {errors.type}
            </span>
          ) : null}

          {form.type ? (
            <Callout tone="info" icon="info">
              {SEVERITY_HINT[form.type]}
            </Callout>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Details" />
        <CardBody className="stack gap-16">
          <Select
            label="Against which trip"
            value={shipmentId}
            onChange={(e) => setForm({ ...form, shipmentId: e.target.value })}
            placeholder="Not trip-specific"
            options={trips.map((t) => ({ value: t.id, label: `${t.id} — ${t.lane}` }))}
            hint={trips.length ? undefined : 'You have no active trips — this will be logged against your shift.'}
          />

          <Textarea
            label="Describe what happened"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            error={errors.description}
            rows={4}
            required
            placeholder="Rear left tyre blew out on NH-48 near Talegaon. Vehicle is on the hard shoulder, load is secure."
          />

          <PhotoCapture label="Photos" slots={4} photos={photos} onChange={setPhotos} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Location" subtitle="Attached automatically" />
        <CardBody>
          {location ? (
            <div className="grid grid-2 gap-12">
              <DataPoint label="Latitude" value={location.lat.toFixed(5)} mono />
              <DataPoint label="Longitude" value={location.lng.toFixed(5)} mono />
              <DataPoint label="Source" value={location.source} />
              <DataPoint label="Captured" value={new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} />
            </div>
          ) : (
            <p className="t-sm c-muted">No position available. The report will be sent without one.</p>
          )}
        </CardBody>
      </Card>

      <div className="action-bar">
        <Button type="submit" variant="danger" size="xl" block className="advance-btn" loading={submitting}>
          {queue.online ? 'Send report' : 'Save on this phone'}
        </Button>
        <Button variant="ghost" size="sm" block onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
