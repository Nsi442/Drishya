import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import useAsync from '../../hooks/useAsync.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { useAuth, useToast } from '../../store/hooks.js'
import { listAppointments, decideAppointment } from '../../services/appointmentService.js'
import { formatDateTime, formatRelative, formatNumber } from '../../lib/format.js'
import { refData as db } from '../../services/referenceData.js'
import Card from '../../components/ui/Card.jsx'
import Tabs from '../../components/ui/Tabs.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Select from '../../components/ui/Select.jsx'
import Input, { Textarea } from '../../components/ui/Input.jsx'
import DatePicker from '../../components/ui/DatePicker.jsx'
import Badge, { StatusPill } from '../../components/ui/Badge.jsx'
import Icon from '../../components/ui/Icon.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { PageHeader, Callout, DataPoint } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'

const REJECT_REASONS = [
  'Dock at capacity for that window',
  'Outside operating hours',
  'Clashing container booking',
  'Insufficient notice for this volume',
  'Documents outstanding on the consignment',
]

const toISODate = (d) => new Date(d).toISOString().slice(0, 10)

export default function FCAppointments() {
  useDocumentTitle('Appointment requests')
  const { user } = useAuth()
  const toast = useToast()
  const fcId = user?.orgId ?? 'fc-bhiwandi'

  const [tab, setTab] = useState('requested')
  const [rejecting, setRejecting] = useState(null)
  const [proposing, setProposing] = useState(null)
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0])
  const [rejectNote, setRejectNote] = useState('')
  const [proposal, setProposal] = useState({ date: '', time: '', dockId: '' })
  const [busy, setBusy] = useState(null)

  const appts = useAsync(() => listAppointments({ fcId }), [fcId])

  const grouped = useMemo(() => {
    const rows = appts.data ?? []
    return {
      requested: rows.filter((a) => a.status === 'requested'),
      confirmed: rows.filter((a) => a.status === 'confirmed'),
      alternative: rows.filter((a) => a.status === 'alternative'),
      rejected: rows.filter((a) => a.status === 'rejected'),
    }
  }, [appts.data])

  const docks = useMemo(() => db.docks.filter((d) => d.fcId === fcId), [fcId])
  const visible = grouped[tab] ?? []

  // Which bookings overlap another on the same bay. Computed from the list
  // already loaded rather than asking the API per row — sixty comparisons in
  // the browser beats sixty round trips.
  const clashingIds = useMemo(() => {
    const rows = (appts.data ?? []).filter((a) => a.status !== 'rejected')
    const clashes = new Set()
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i]
        const b = rows[j]
        if (a.dockId !== b.dockId) continue
        if (a.start < b.end && b.start < a.end) {
          clashes.add(a.id)
          clashes.add(b.id)
        }
      }
    }
    return clashes
  }, [appts.data])

  const decide = async (appointment, decision, extra = {}) => {
    setBusy(appointment.id)
    try {
      await decideAppointment(appointment.id, decision, { by: user?.name ?? 'FC scheduling desk', ...extra })
      const label = decision === 'confirmed' ? 'confirmed' : decision === 'rejected' ? 'rejected' : 'given an alternative'
      toast.success(`Slot ${label}`, { description: `${appointment.vendorName} has been told.` })
      appts.reload()
      setRejecting(null)
      setProposing(null)
      setRejectNote('')
    } catch (err) {
      toast.error('Could not save the decision', { description: err.message })
    } finally {
      setBusy(null)
    }
  }

  // Approving into a taken bay is refused by the API with a 409, which `decide`
  // already surfaces as a toast. No pre-flight check is needed — and the server
  // is the only party that can see a booking another user made a second ago.
  const onApprove = (appointment) => decide(appointment, 'confirmed')

  const tabs = [
    { value: 'requested', label: 'Awaiting decision', icon: 'clock', count: grouped.requested.length },
    { value: 'confirmed', label: 'Confirmed', icon: 'checkCircle', count: grouped.confirmed.length },
    { value: 'alternative', label: 'Alternative sent', icon: 'refresh', count: grouped.alternative.length },
    { value: 'rejected', label: 'Rejected', icon: 'xCircle', count: grouped.rejected.length },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Appointment requests"
        subtitle="Vendors asking for a dock window. Approve, reject with a reason, or offer another time."
        actions={
          <Button variant="secondary" to="/fc/docks" icon="dock">
            Open the scheduler
          </Button>
        }
      />

      {grouped.requested.length ? (
        <Callout tone="warn" title={`${grouped.requested.length} requests waiting`} className="mb-16">
          Vendors cannot plan their dispatch until these are decided. A request left open past its window is treated as
          a rejection by the vendor's own planning.
        </Callout>
      ) : null}

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Appointment queues" className="mb-16" />

      {appts.isLoading ? (
        <div className="stack gap-12">
          <SkeletonCards count={4} height={132} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={tab === 'requested' ? 'checkCircle' : 'calendar'}
          title={tab === 'requested' ? 'Nothing waiting' : `No ${tab} requests`}
          description={
            tab === 'requested'
              ? 'Every request has been decided. New ones appear here as vendors book.'
              : 'Nothing in this queue right now.'
          }
        />
      ) : (
        <div className="stack gap-12">
          {visible.map((appointment) => {
            const clash = clashingIds.has(appointment.id)

            return (
              <Card key={appointment.id} padded>
                <div className="row between gap-12 wrap">
                  <div className="grow" style={{ minWidth: 240 }}>
                    <div className="row gap-8 wrap">
                      <span className="fw-600 c-strong t-lg">{appointment.vendorName}</span>
                      <StatusPill status={appointment.status} kind="appointment" size="sm" />
                      {clash && appointment.status === 'requested' ? (
                        <Badge tone="danger" size="sm" icon="alert">
                          Bay already booked
                        </Badge>
                      ) : null}
                    </div>

                    <p className="t-sm c-muted mt-4">
                      Requested {formatRelative(appointment.requestedAt)}
                      {appointment.shipmentId ? (
                        <>
                          {' · '}
                          <Link to={`/fc/inbound/${appointment.shipmentId}`} className="mono">
                            {appointment.shipmentId}
                          </Link>
                        </>
                      ) : null}
                    </p>

                    <div className="grid grid-4 gap-12 mt-12">
                      <DataPoint label="Window" value={formatDateTime(appointment.start)} />
                      <DataPoint label="Dock" value={appointment.dockId.split('-').slice(-2).join(' ').replace('dock', 'Dock')} />
                      <DataPoint label="Vehicle" value={appointment.vehicleReg} mono />
                      <DataPoint label="Cartons" value={formatNumber(appointment.cartons)} />
                    </div>

                    {appointment.note ? (
                      <p className="t-sm c-muted mt-12 row gap-6">
                        <Icon name="info" size={13} className="shrink-0" />
                        {appointment.note}
                      </p>
                    ) : null}

                    {appointment.rejectionReason ? (
                      <p className="t-sm c-danger mt-12">Rejected: {appointment.rejectionReason}</p>
                    ) : null}

                    {appointment.proposedStart ? (
                      <p className="t-sm c-accent mt-12">Alternative offered: {formatDateTime(appointment.proposedStart)}</p>
                    ) : null}
                  </div>

                  {appointment.status === 'requested' ? (
                    <div className="row gap-8 wrap shrink-0">
                      <Button
                        variant="secondary"
                        icon="refresh"
                        onClick={() => {
                          setProposal({
                            date: toISODate(appointment.start),
                            time: new Date(appointment.start + 2 * 3600000).toTimeString().slice(0, 5),
                            dockId: appointment.dockId,
                          })
                          setProposing(appointment)
                        }}
                      >
                        Propose another
                      </Button>
                      <Button variant="danger-soft" icon="x" onClick={() => setRejecting(appointment)}>
                        Reject
                      </Button>
                      <Button variant="primary" icon="check" loading={busy === appointment.id} onClick={() => onApprove(appointment)}>
                        Approve
                      </Button>
                    </div>
                  ) : appointment.decidedAt ? (
                    <div className="stack gap-4 shrink-0" style={{ textAlign: 'right' }}>
                      <span className="t-xs c-subtle">Decided {formatRelative(appointment.decidedAt)}</span>
                      <span className="t-sm c-muted">{appointment.decidedBy}</span>
                    </div>
                  ) : null}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this request"
        description="The vendor sees the reason and can rebook straight away — so make it specific."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy === rejecting?.id}
              onClick={() => decide(rejecting, 'rejected', { reason: rejectNote.trim() || rejectReason })}
            >
              Reject slot
            </Button>
          </>
        }
      >
        <div className="stack gap-16">
          {rejecting ? <DataPoint label="Request" value={`${rejecting.vendorName} — ${formatDateTime(rejecting.start)}`} /> : null}
          <Select label="Reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} options={REJECT_REASONS} required />
          <Textarea label="Add detail (optional)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} placeholder="Bay 3 is down for maintenance until Thursday." />
        </div>
      </Modal>

      <Modal
        open={Boolean(proposing)}
        onClose={() => setProposing(null)}
        title="Propose an alternative"
        description="The vendor is offered this window instead and can accept it in one tap."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProposing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy === proposing?.id}
              onClick={() =>
                decide(proposing, 'alternative', { proposedStart: new Date(`${proposal.date}T${proposal.time}:00`) })
              }
            >
              Send alternative
            </Button>
          </>
        }
      >
        <div className="stack gap-16">
          {proposing ? <DataPoint label="They asked for" value={formatDateTime(proposing.start)} /> : null}
          <div className="grid grid-2">
            <DatePicker label="New date" value={proposal.date} onChange={(v) => setProposal({ ...proposal, date: v })} min={toISODate(new Date())} required />
            <Input label="New start" type="time" value={proposal.time} onChange={(e) => setProposal({ ...proposal, time: e.target.value })} required />
          </div>
          <Select
            label="Dock"
            value={proposal.dockId}
            onChange={(e) => setProposal({ ...proposal, dockId: e.target.value })}
            options={docks.map((d) => ({ value: d.id, label: `${d.name} — ${d.type}` }))}
          />
        </div>
      </Modal>
    </div>
  )
}
