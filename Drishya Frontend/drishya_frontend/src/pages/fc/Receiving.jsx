import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDispatch, useAuth, useToast, useAppState } from '../../store/hooks.js'
import { ACTIONS } from '../../store/reducer.js'
import useAsync from '../../hooks/useAsync.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { getReceivingQueue, submitGRN } from '../../services/fcService.js'
import { DOC_TYPES } from '../../lib/constants.js'
import { formatNumber, formatTime } from '../../lib/format.js'
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input, { Textarea } from '../../components/ui/Input.jsx'
import Checkbox from '../../components/ui/Checkbox.jsx'
import Badge, { StatusPill } from '../../components/ui/Badge.jsx'
import Icon from '../../components/ui/Icon.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import { ConfirmModal } from '../../components/ui/Modal.jsx'
import { PageHeader, Callout, DataPoint, Progress } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'

const DOC_CHECKS = ['invoice', 'eway', 'gst', 'lr']

// The goods-receipt form lives in its own component and is keyed on the
// consignment id by its parent. Selecting a different consignment therefore
// remounts it with fresh state — no effect is needed to reset the fields.
function GRNForm({ shipment, onSubmitted, checkedBy }) {
  const dispatch = useDispatch()
  const toast = useToast()

  const [form, setForm] = useState({ received: String(shipment.cartons), damaged: '', note: '', docs: {} })
  const [errors, setErrors] = useState({})
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)

  const received = Number(form.received || 0)
  const damaged = Number(form.damaged || 0)
  const shortfall = shipment.cartons - received
  const docsVerified = DOC_CHECKS.filter((d) => form.docs[d])

  const suggestedDecision = received === 0 ? 'rejected' : shortfall > 0 || damaged > 0 ? 'partial' : 'accepted'

  const validate = () => {
    const next = {}
    if (form.received === '') next.received = 'Enter the counted quantity'
    else if (received < 0 || received > shipment.cartons) next.received = `Must be between 0 and ${formatNumber(shipment.cartons)}`
    if (damaged > received) next.damaged = 'Damaged cannot exceed what was received'
    if (docsVerified.length < 2) next.docs = 'Verify at least the invoice and the e-way bill'
    if ((shortfall > 0 || damaged > 0) && !form.note.trim()) {
      next.note = 'Record what was wrong — this becomes the exception the vendor sees'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = (decision) => {
    if (!validate()) return
    setConfirming(decision)
  }

  const doSubmit = async () => {
    setBusy(true)
    try {
      const next = await submitGRN(shipment.id, {
        decision: confirming,
        receivedCartons: received,
        damagedCartons: damaged,
        documentsVerified: docsVerified,
        note: form.note.trim() || null,
        checkedBy,
      })
      dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: next })
      toast.success(`Goods receipt raised for ${shipment.id}`, {
        description: `${formatNumber(received)} of ${formatNumber(shipment.cartons)} cartons ${confirming}.`,
      })
      setConfirming(null)
      onSubmitted()
    } catch (err) {
      toast.error('Could not raise the goods receipt', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="row gap-10 wrap">
            <span className="mono">{shipment.id}</span>
            <StatusPill status={shipment.status} size="sm" />
          </span>
        }
        subtitle={`${shipment.vendorName} · ${shipment.vehicleReg} · arrived ${shipment.gateInAt ? formatTime(shipment.gateInAt) : '—'}`}
        actions={
          <Button variant="ghost" size="sm" to={`/fc/inbound/${shipment.id}`} iconRight="arrowRight">
            Full record
          </Button>
        }
      />

      <CardBody className="stack gap-20">
        <section>
          <h3 className="eyebrow mb-12">Quantity check</h3>
          <div className="grid grid-3">
            <DataPoint label="Expected (ASN)" value={formatNumber(shipment.cartons)} />
            <Input
              label="Counted"
              type="number"
              min="0"
              max={shipment.cartons}
              value={form.received}
              onChange={(e) => setForm({ ...form, received: e.target.value })}
              error={errors.received}
              required
            />
            <Input
              label="Of which damaged"
              type="number"
              min="0"
              value={form.damaged}
              onChange={(e) => setForm({ ...form, damaged: e.target.value })}
              error={errors.damaged}
              placeholder="0"
            />
          </div>

          <div className="mt-12">
            <div className="row between t-sm c-muted mb-8">
              <span>Counted against expected</span>
              <span className="fw-600 c-strong">
                {formatNumber(received)} / {formatNumber(shipment.cartons)}
              </span>
            </div>
            <Progress value={received} max={shipment.cartons} tone={shortfall > 0 ? 'warn' : 'success'} label="Received against expected" />
          </div>

          {shortfall > 0 ? (
            <Callout tone="warn" title={`Short by ${formatNumber(shortfall)} cartons`} className="mt-12">
              A quantity shortage exception will be raised against {shipment.vendorName} automatically.
            </Callout>
          ) : null}
          {damaged > 0 ? (
            <Callout tone="danger" title={`${formatNumber(damaged)} cartons damaged`} className="mt-12">
              Photograph these at the dock before the vehicle leaves.
            </Callout>
          ) : null}
        </section>

        <hr className="divider" />

        <section>
          <h3 className="eyebrow mb-12">Document verification</h3>
          <div className="stack gap-8">
            {DOC_CHECKS.map((type) => {
              const doc = shipment.documents.find((d) => d.type === type)
              const bad = doc && (doc.status === 'mismatch' || doc.status === 'missing')
              return (
                <label key={type} className={`verify-row ${bad ? 'is-flagged' : ''}`}>
                  <span className="row gap-10 grow" style={{ minWidth: 0 }}>
                    <Checkbox checked={Boolean(form.docs[type])} onChange={(v) => setForm({ ...form, docs: { ...form.docs, [type]: v } })} />
                    <span className="stack">
                      <span className="fw-600 c-strong t-md">{DOC_TYPES[type]}</span>
                      <span className="t-sm c-muted mono">{doc?.number ?? 'Not on record'}</span>
                    </span>
                  </span>
                  {doc ? <StatusPill status={doc.status} kind="document" size="sm" /> : null}
                </label>
              )
            })}
          </div>

          {errors.docs ? (
            <span className="field-error mt-8">
              <Icon name="alertCircle" size={13} />
              {errors.docs}
            </span>
          ) : null}
        </section>

        <Textarea
          label="Receiving note"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          error={errors.note}
          rows={3}
          placeholder="Two cartons crushed on the near-side pallet, photographed. Rest of the load is clean."
        />
      </CardBody>

      <CardFooter>
        <span className="t-sm c-muted">
          Suggested: <strong className="c-strong">{suggestedDecision}</strong> · {docsVerified.length} of {DOC_CHECKS.length} documents verified
        </span>
        <div className="row gap-8 wrap">
          <Button variant="danger-soft" icon="xCircle" onClick={() => onSubmit('rejected')}>
            Reject
          </Button>
          <Button variant="secondary" icon="alert" onClick={() => onSubmit('partial')}>
            Part-accept
          </Button>
          <Button variant="primary" icon="checkCircle" onClick={() => onSubmit('accepted')}>
            Accept
          </Button>
        </div>
      </CardFooter>

      <ConfirmModal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={doSubmit}
        loading={busy}
        tone={confirming === 'rejected' ? 'danger' : 'primary'}
        confirmLabel={confirming === 'rejected' ? 'Reject consignment' : confirming === 'partial' ? 'Part-accept' : 'Accept consignment'}
        title={`${confirming === 'rejected' ? 'Reject' : confirming === 'partial' ? 'Part-accept' : 'Accept'} ${shipment.id}?`}
        description={
          confirming === 'rejected'
            ? 'The whole load is refused. The vendor is told immediately and an exception is raised against their scorecard.'
            : `${formatNumber(received)} of ${formatNumber(shipment.cartons)} cartons will be recorded as received.${
                shortfall > 0 ? ` A shortage of ${formatNumber(shortfall)} raises an exception.` : ''
              }`
        }
      />
    </Card>
  )
}

export default function Receiving() {
  useDocumentTitle('Receiving')
  const { user } = useAuth()
  const state = useAppState()
  const [params, setParams] = useSearchParams()
  const fcId = user?.orgId ?? 'fc-bhiwandi'

  const queue = useAsync(() => getReceivingQueue(fcId), [fcId, state.shipments.lastTick])
  const [selectedId, setSelectedId] = useState(params.get('shipment') ?? '')

  const rows = useMemo(() => queue.data ?? [], [queue.data])
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? rows[0], [rows, selectedId])

  const stats = useMemo(
    () => ({
      queue: rows.length,
      cartons: rows.reduce((sum, r) => sum + r.cartons, 0),
      docIssues: rows.filter((r) => r.documents.some((d) => d.status === 'mismatch' || d.status === 'missing')).length,
    }),
    [rows],
  )

  const onSubmitted = () => {
    setSelectedId('')
    setParams({}, { replace: true })
    queue.reload()
  }

  return (
    <div className="page page-wide">
      <PageHeader
        title="Receiving"
        subtitle="Count against the advance shipping notice, verify the paperwork, then accept, part-accept or reject."
      />

      <div className="grid grid-3 mb-24">
        {queue.isLoading ? (
          <SkeletonCards count={3} height={98} />
        ) : (
          <>
            <StatCard label="Awaiting goods receipt" value={stats.queue} icon="clipboard" accent={stats.queue ? 'accent' : undefined} />
            <StatCard label="Cartons to check" value={formatNumber(stats.cartons)} icon="package" />
            <StatCard label="With document problems" value={stats.docIssues} icon="alertCircle" accent={stats.docIssues ? 'danger' : undefined} />
          </>
        )}
      </div>

      {queue.isLoading ? (
        <SkeletonCards count={2} height={280} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="checkCircle"
          title="Nothing waiting to be received"
          description="Consignments appear here once they are marked unloading at a dock."
          actionLabel="Open the arrival board"
          actionTo="/fc/inbound"
        />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', alignItems: 'start' }}>
          <Card>
            <CardHeader title="Queue" subtitle={`${rows.length} waiting`} />
            <CardBody flush>
              {rows.map((row) => {
                const issues = row.documents.filter((d) => d.status === 'mismatch' || d.status === 'missing').length
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`ship-row ${selected?.id === row.id ? 'is-active' : ''}`}
                    onClick={() => {
                      setSelectedId(row.id)
                      setParams({ shipment: row.id }, { replace: true })
                    }}
                  >
                    <span className="row between gap-8">
                      <span className="mono fw-600 c-strong t-md">{row.id}</span>
                      <StatusPill status={row.status} size="sm" />
                    </span>
                    <span className="row between gap-8 mt-4">
                      <span className="t-sm c-muted truncate">{row.vendorName}</span>
                      {issues ? (
                        <Badge tone="danger" size="sm">
                          {issues} doc
                        </Badge>
                      ) : null}
                    </span>
                    <span className="row between gap-8 mt-4 t-xs c-subtle">
                      <span>{formatNumber(row.cartons)} cartons</span>
                      <span>{row.dockName ?? 'No dock'}</span>
                    </span>
                  </button>
                )
              })}
            </CardBody>
          </Card>

          {selected ? (
            <GRNForm key={selected.id} shipment={selected} onSubmitted={onSubmitted} checkedBy={user?.name ?? 'FC receiving desk'} />
          ) : null}
        </div>
      )}
    </div>
  )
}
