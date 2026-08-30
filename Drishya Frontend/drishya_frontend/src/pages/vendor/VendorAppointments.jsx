import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import useAsync from '../../hooks/useAsync.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { useToast } from '../../store/hooks.js'
import { listAppointments, requestAppointment, rescheduleAppointment, checkConflict } from '../../services/appointmentService.js'
import { formatDateTime, formatDate } from '../../lib/format.js'
import { refData as db } from '../../services/referenceData.js'
import Calendar from '../../components/schedule/Calendar.jsx'
import { startOfWeek } from '../../lib/dates.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button, { IconButton } from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Drawer from '../../components/ui/Drawer.jsx'
import Select from '../../components/ui/Select.jsx'
import Input, { Textarea } from '../../components/ui/Input.jsx'
import DatePicker from '../../components/ui/DatePicker.jsx'
import { SegmentedControl } from '../../components/ui/Tabs.jsx'
import { StatusPill } from '../../components/ui/Badge.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import Skeleton from '../../components/ui/Skeleton.jsx'
import { PageHeader, Callout, DataPoint } from '../../components/ui/Misc.jsx'
import { ErrorState } from '../../components/ui/EmptyState.jsx'

const toISODate = (d) => new Date(d).toISOString().slice(0, 10)

export default function VendorAppointments() {
  useDocumentTitle('Dock appointments')
  const toast = useToast()

  const [view, setView] = useState('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [fcId, setFcId] = useState('all')
  const [selected, setSelected] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [rescheduling, setRescheduling] = useState(null)
  const [busy, setBusy] = useState(false)

  const [request, setRequest] = useState({
    shipmentId: '',
    fcId: db.fulfilmentCentres[0].id,
    dockId: '',
    date: toISODate(new Date()),
    time: '10:00',
    durationMin: 60,
    note: '',
  })
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '' })
  const [errors, setErrors] = useState({})

  const appts = useAsync(() => listAppointments({}), [])

  const filtered = useMemo(() => {
    const rows = (appts.data ?? []).filter((a) => a.shipmentId)
    return fcId === 'all' ? rows : rows.filter((a) => a.fcId === fcId)
  }, [appts.data, fcId])

  const counts = useMemo(
    () => ({
      requested: filtered.filter((a) => a.status === 'requested').length,
      confirmed: filtered.filter((a) => a.status === 'confirmed').length,
      alternative: filtered.filter((a) => a.status === 'alternative').length,
      rejected: filtered.filter((a) => a.status === 'rejected').length,
    }),
    [filtered],
  )

  const rangeLabel = useMemo(() => {
    if (view === 'day') return anchor.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    const start = startOfWeek(anchor)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }, [view, anchor])

  const shift = (direction) => {
    const next = new Date(anchor)
    next.setDate(next.getDate() + direction * (view === 'day' ? 1 : 7))
    setAnchor(next)
  }

  const docks = useMemo(() => db.docks.filter((d) => d.fcId === request.fcId), [request.fcId])
  const bookableShipments = useMemo(
    () => db.shipments.filter((s) => s.status === 'created' || s.status === 'docs_pending').slice(0, 25),
    [],
  )

  const onRequest = async (e) => {
    e.preventDefault()
    const start = new Date(`${request.date}T${request.time}:00`)
    const next = {}
    if (!request.dockId) next.dockId = 'Choose which dock to request'
    if (start.getTime() < Date.now()) next.time = 'The slot must be in the future'
    const clash = request.dockId ? await checkConflict(request.dockId, start, request.durationMin) : null
    if (clash) next.dockId = `Clashes with ${clash.vendorName} at ${new Date(clash.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      const shipment = db.shipments.find((s) => s.id === request.shipmentId)
      await requestAppointment({
        shipmentId: request.shipmentId || null,
        vendorId: shipment?.vendorId ?? db.vendors[0].id,
        vendorName: shipment?.vendorName ?? db.vendors[0].name,
        fcId: request.fcId,
        dockId: request.dockId,
        start,
        durationMin: Number(request.durationMin),
        vehicleReg: shipment?.vehicleReg,
        cartons: shipment?.cartons,
        note: request.note,
      })
      toast.success('Slot requested', { description: 'The fulfilment centre has been asked to confirm this window.' })
      setRequesting(false)
      setErrors({})
      appts.reload()
    } catch (err) {
      toast.error('Could not request the slot', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const onReschedule = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await rescheduleAppointment(rescheduling.id, { start: new Date(`${rescheduleForm.date}T${rescheduleForm.time}:00`) })
      toast.success('Slot moved', { description: 'The new window has been sent to the fulfilment centre.' })
      setRescheduling(null)
      setSelected(null)
      appts.reload()
    } catch (err) {
      toast.error('Could not reschedule', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page-wide">
      <PageHeader
        title="Dock appointments"
        subtitle="Slots you have asked for and slots the fulfilment centres have confirmed."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setRequesting(true)}>
            Request a slot
          </Button>
        }
      />

      <div className="grid grid-4 mb-24">
        {appts.isLoading ? (
          <>
            <Skeleton height={98} radius="var(--radius)" />
            <Skeleton height={98} radius="var(--radius)" />
            <Skeleton height={98} radius="var(--radius)" />
            <Skeleton height={98} radius="var(--radius)" />
          </>
        ) : (
          <>
            <StatCard label="Awaiting confirmation" value={counts.requested} icon="clock" accent="warn" hint="Sent, not yet decided" />
            <StatCard label="Confirmed" value={counts.confirmed} icon="checkCircle" accent="success" hint="Locked in at the dock" />
            <StatCard label="Alternative offered" value={counts.alternative} icon="refresh" accent="accent" hint="Needs your response" />
            <StatCard label="Rejected" value={counts.rejected} icon="xCircle" accent={counts.rejected ? 'danger' : undefined} hint="Rebook these" />
          </>
        )}
      </div>

      {counts.alternative > 0 ? (
        <Callout tone="info" title={`${counts.alternative} alternative slots have been proposed`} className="mb-16">
          A fulfilment centre could not take your requested window and has offered another. Open the slot to accept or
          request a different time.
        </Callout>
      ) : null}

      <Card>
        <CardHeader
          title={rangeLabel}
          subtitle={`${filtered.length} appointments`}
          actions={
            <div className="row gap-8 wrap">
              <Select
                label={null}
                value={fcId}
                onChange={(e) => setFcId(e.target.value)}
                options={[{ value: 'all', label: 'All centres' }, ...db.fulfilmentCentres.map((fc) => ({ value: fc.id, label: fc.name }))]}
                className="t-sm"
              />
              <SegmentedControl
                label="Calendar view"
                value={view}
                onChange={setView}
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                ]}
              />
              <div className="row gap-2">
                <IconButton icon="chevronLeft" label={`Previous ${view}`} onClick={() => shift(-1)} bordered />
                <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>
                  Today
                </Button>
                <IconButton icon="chevronRight" label={`Next ${view}`} onClick={() => shift(1)} bordered />
              </div>
            </div>
          }
        />

        <CardBody flush>
          {appts.isLoading ? (
            <div className="pad">
              <Skeleton height={420} radius="var(--radius-sm)" />
            </div>
          ) : appts.isError ? (
            <ErrorState error={appts.error} onRetry={appts.reload} />
          ) : (
            <Calendar view={view} anchor={anchor} appointments={filtered} onSelect={setSelected} />
          )}
        </CardBody>
      </Card>

      {/* Slot detail */}
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Slot ${new Date(selected.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
        subtitle={selected ? formatDate(selected.start) : ''}
        footer={
          selected ? (
            <>
              <Button
                variant="secondary"
                block
                icon="calendar"
                onClick={() => {
                  setRescheduleForm({ date: toISODate(selected.start), time: new Date(selected.start).toTimeString().slice(0, 5) })
                  setRescheduling(selected)
                }}
                disabled={selected.status === 'completed'}
              >
                Reschedule
              </Button>
              {selected.shipmentId ? (
                <Button variant="primary" block to={`/vendor/shipments/${selected.shipmentId}`} onClick={() => setSelected(null)}>
                  Open shipment
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="stack gap-16 pad">
            <StatusPill status={selected.status} kind="appointment" />

            {selected.status === 'rejected' && selected.rejectionReason ? (
              <Callout tone="danger" title="Why it was rejected">
                {selected.rejectionReason}
              </Callout>
            ) : null}

            {selected.status === 'alternative' && selected.proposedStart ? (
              <Callout tone="info" title="Alternative proposed">
                {formatDateTime(selected.proposedStart)} on the same dock. Accept it, or request a different window.
              </Callout>
            ) : null}

            <dl className="dl">
              <dt>Fulfilment centre</dt>
              <dd>{selected.fcName}</dd>
              <dt>Dock</dt>
              <dd>{selected.dockId.split('-').slice(-2).join(' ').replace('dock', 'Dock')}</dd>
              <dt>Window</dt>
              <dd>
                {new Date(selected.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} –{' '}
                {new Date(selected.end).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </dd>
              <dt>Shipment</dt>
              <dd>
                {selected.shipmentId ? (
                  <Link to={`/vendor/shipments/${selected.shipmentId}`} className="mono">
                    {selected.shipmentId}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Vehicle</dt>
              <dd className="mono">{selected.vehicleReg}</dd>
              <dt>Cartons</dt>
              <dd>{selected.cartons}</dd>
              <dt>Requested</dt>
              <dd>{formatDateTime(selected.requestedAt)}</dd>
              {selected.decidedAt ? (
                <>
                  <dt>Decided</dt>
                  <dd>
                    {formatDateTime(selected.decidedAt)} by {selected.decidedBy}
                  </dd>
                </>
              ) : null}
            </dl>

            {selected.note ? (
              <Callout tone="neutral" icon="info" title="Note to the centre">
                {selected.note}
              </Callout>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      {/* Request a slot */}
      <Modal
        open={requesting}
        onClose={() => setRequesting(false)}
        title="Request a dock slot"
        description="The fulfilment centre confirms, rejects or proposes another window."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequesting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="slot-request" variant="primary" loading={busy}>
              Send request
            </Button>
          </>
        }
      >
        <form id="slot-request" onSubmit={onRequest} className="stack gap-16">
          <Select
            label="Against shipment"
            value={request.shipmentId}
            onChange={(e) => setRequest({ ...request, shipmentId: e.target.value })}
            placeholder="Choose a shipment (optional)"
            options={bookableShipments.map((s) => ({ value: s.id, label: `${s.id} — ${s.lane}` }))}
            hint="Leave blank to hold a window before the consignment is booked."
          />
          <Select
            label="Fulfilment centre"
            value={request.fcId}
            onChange={(e) => setRequest({ ...request, fcId: e.target.value, dockId: '' })}
            options={db.fulfilmentCentres.map((fc) => ({ value: fc.id, label: `${fc.name} — ${fc.city}` }))}
            required
          />
          <Select
            label="Dock"
            value={request.dockId}
            onChange={(e) => setRequest({ ...request, dockId: e.target.value })}
            placeholder="Choose a dock"
            options={docks.map((d) => ({ value: d.id, label: `${d.name} — ${d.type}` }))}
            error={errors.dockId}
            required
          />
          <div className="grid grid-3">
            <DatePicker label="Date" value={request.date} onChange={(v) => setRequest({ ...request, date: v })} min={toISODate(new Date())} required />
            <Input label="Start" type="time" value={request.time} onChange={(e) => setRequest({ ...request, time: e.target.value })} error={errors.time} required />
            <Select
              label="Duration"
              value={String(request.durationMin)}
              onChange={(e) => setRequest({ ...request, durationMin: e.target.value })}
              options={[
                { value: '60', label: '1 hour' },
                { value: '90', label: '1.5 hours' },
                { value: '120', label: '2 hours' },
              ]}
            />
          </div>
          <Textarea label="Note to the centre" value={request.note} onChange={(e) => setRequest({ ...request, note: e.target.value })} rows={3} placeholder="Tail-lift required — no forklift access on this vehicle." />
        </form>
      </Modal>

      {/* Reschedule */}
      <Modal
        open={Boolean(rescheduling)}
        onClose={() => setRescheduling(null)}
        title="Move this slot"
        description="Conflicts on the same dock are checked before the request goes through."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRescheduling(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="slot-reschedule" variant="primary" loading={busy}>
              Move slot
            </Button>
          </>
        }
      >
        <form id="slot-reschedule" onSubmit={onReschedule} className="stack gap-16">
          {rescheduling ? <DataPoint label="Currently" value={formatDateTime(rescheduling.start)} /> : null}
          <DatePicker label="New date" value={rescheduleForm.date} onChange={(v) => setRescheduleForm({ ...rescheduleForm, date: v })} min={toISODate(new Date())} required />
          <Input label="New start time" type="time" value={rescheduleForm.time} onChange={(e) => setRescheduleForm({ ...rescheduleForm, time: e.target.value })} required />
        </form>
      </Modal>
    </div>
  )
}
