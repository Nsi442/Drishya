import { useState, useMemo } from 'react'
import { useAppState, useAuth, useToast } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { DOC_TYPES, ACTIVE_STATUSES } from '../../lib/constants.js'
import { formatDateTime } from '../../lib/format.js'
import Button, { IconButton } from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Select from '../../components/ui/Select.jsx'
import Badge, { StatusPill } from '../../components/ui/Badge.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { Callout } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import './driver.css'

export default function DriverDocuments() {
  useDocumentTitle('Documents')
  const state = useAppState()
  const { user } = useAuth()
  const toast = useToast()

  const [tripId, setTripId] = useState('')
  const [viewing, setViewing] = useState(null)

  const shipments = selectShipments(state)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  const trips = useMemo(
    () => shipments.filter((s) => s.driverId === (user?.driverId ?? 'driver-1') && s.status !== 'cancelled'),
    [shipments, user],
  )

  const active = useMemo(() => trips.filter((s) => ACTIVE_STATUSES.includes(s.status)), [trips])
  const current = useMemo(
    () => trips.find((t) => t.id === tripId) ?? active[0] ?? trips[0],
    [trips, active, tripId],
  )

  if (loading) {
    return (
      <div className="stack gap-12">
        <SkeletonCards count={4} height={72} />
      </div>
    )
  }

  if (!current) {
    return (
      <EmptyState
        icon="file"
        title="No documents yet"
        description="Paperwork appears here once a trip is assigned to you. Everything is cached on the phone so it opens without signal."
        actionLabel="Back to today"
        actionTo="/driver"
      />
    )
  }

  const problems = current.documents.filter((d) => d.status === 'mismatch' || d.status === 'missing')

  return (
    <div className="stack gap-16">
      {trips.length > 1 ? (
        <Select
          label="Trip"
          value={current.id}
          onChange={(e) => setTripId(e.target.value)}
          options={trips.map((t) => ({ value: t.id, label: `${t.id} — ${t.lane}` }))}
        />
      ) : null}

      <Callout tone="success" icon="download" title="Available offline">
        All four documents for {current.id} are stored on this phone. They open at the gate with no signal.
      </Callout>

      {problems.length ? (
        <Callout tone="danger" title={`${problems.length} document${problems.length > 1 ? 's' : ''} will be questioned at the gate`}>
          {problems.map((d) => DOC_TYPES[d.type]).join(', ')}. Call dispatch before you arrive.
        </Callout>
      ) : null}

      <Card>
        <CardHeader title={`Documents for ${current.id}`} subtitle={current.lane} />
        <CardBody className="stack gap-8">
          {current.documents.map((doc) => (
            <button key={doc.id} type="button" className="doc-tile" onClick={() => setViewing(doc)}>
              <span className={`doc-icon is-${doc.status}`}>
                <Icon name={doc.status === 'valid' ? 'checkCircle' : doc.status === 'missing' ? 'alertCircle' : 'file'} size={16} />
              </span>

              <span className="grow" style={{ minWidth: 0 }}>
                <span className="row between gap-8">
                  <span className="fw-600 c-strong t-md">{DOC_TYPES[doc.type]}</span>
                  <StatusPill status={doc.status} kind="document" size="sm" />
                </span>
                <span className="t-sm c-muted mono truncate" style={{ display: 'block' }}>
                  {doc.number ?? 'Not uploaded'}
                </span>
              </span>

              <Icon name="maximize" size={16} className="c-subtle" />
            </button>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Consignment card" subtitle="Show this at the gate" />
        <CardBody>
          <dl className="dl">
            <dt>Consignment</dt>
            <dd className="mono">{current.id}</dd>
            <dt>Vendor</dt>
            <dd>{current.vendorName}</dd>
            <dt>Destination</dt>
            <dd>{current.destination.name}</dd>
            <dt>Vehicle</dt>
            <dd className="mono">{current.vehicleReg}</dd>
            <dt>Seal</dt>
            <dd className="mono">{current.sealNumber}</dd>
            <dt>Cartons</dt>
            <dd>{current.cartons}</dd>
            <dt>Dock slot</dt>
            <dd>{formatDateTime(current.slotStart)}</dd>
          </dl>
        </CardBody>
      </Card>

      {viewing ? (
        <div className="doc-full" role="dialog" aria-modal="true" aria-label={`${DOC_TYPES[viewing.type]} full screen`}>
          <header className="doc-full-head">
            <IconButton icon="arrowLeft" label="Close document" onClick={() => setViewing(null)} />
            <div className="grow" style={{ minWidth: 0 }}>
              <p className="fw-600 c-strong truncate">{DOC_TYPES[viewing.type]}</p>
              <p className="t-xs c-muted mono truncate">{viewing.number ?? 'Not uploaded'}</p>
            </div>
            <Badge tone="success" size="sm" icon="download">
              Offline
            </Badge>
          </header>

          <div className="doc-full-body">
            <div className="doc-page">
              <Icon name="file" size={34} />
              <p className="fw-600 c-strong">{DOC_TYPES[viewing.type]}</p>
              <p className="t-sm c-muted mono">{viewing.number ?? '—'}</p>
              <p className="t-sm c-muted">{current.vendorName}</p>
              <p className="t-xs c-subtle mt-8" style={{ maxWidth: 260, textAlign: 'center' }}>
                Document rendering is not wired up in this build — the record, its number and its validation status are
                real.
              </p>
            </div>
          </div>

          <div className="pad-tight panel-foot">
            <Button variant="secondary" block icon="phone" onClick={() => toast.info('Calling dispatch is not wired up in this build')}>
              Something is wrong — call dispatch
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
