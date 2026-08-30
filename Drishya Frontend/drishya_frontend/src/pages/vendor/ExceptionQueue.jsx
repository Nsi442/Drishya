import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { trips as tripService } from '../../services/index.js'
import { formatDateTime } from '../../lib/format.js'
import Card, { CardBody, CardHeader } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { ErrorState } from '../../components/ui/EmptyState.jsx'
import Table from '../../components/ui/Table.jsx'
import { PageHeader, LiveIndicator } from '../../components/ui/Misc.jsx'
import { SegmentedControl } from '../../components/ui/Tabs.jsx'
import './exceptions.css'

/**
 * Things that need a person today.
 *
 * Two kinds, and they are the two this platform can see before anybody else
 * does. A predicted delay is raised while the vehicle is still moving and the
 * slot can still be renegotiated. A rejected notice is raised before the vehicle
 * has left at all.
 *
 * That timing is the entire argument for the product. Every row here is
 * something a vendor would otherwise have discovered at the gate, or weeks later
 * on a payment statement with the dispute window already closing.
 *
 * Rows are derived on the backend from real trip events, so each one points at a
 * trip that genuinely has that event on its timeline — clicking through always
 * lands somewhere coherent rather than at a shipment that has already docked.
 */
export default function ExceptionQueue() {
  useDocumentTitle('Exceptions')

  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [lastUpdated, setLastUpdated] = useState(null)

  /** The retry handler on the error state. Not on the polling path. */
  async function load() {
    try {
      setRows(await tripService.listExceptions())
      setStatus('ready')
      setError(null)
      setLastUpdated(Date.now())
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  useEffect(() => {
    let alive = true

    // Wrapped rather than called straight from the effect body: load() sets
    // state, and a synchronous setState inside an effect cascades an extra
    // render. The await also means a result arriving after unmount is dropped
    // instead of setting state on a gone component.
    async function begin() {
      const first = await loadOnce()
      if (alive) apply(first)
    }

    async function loadOnce() {
      try {
        return { rows: await tripService.listExceptions(), error: null }
      } catch (e) {
        return { rows: null, error: e.message }
      }
    }

    function apply({ rows: next, error: err }) {
      if (err) {
        setError(err)
        setStatus('error')
        return
      }
      setRows(next)
      setStatus('ready')
      setError(null)
      setLastUpdated(Date.now())
    }

    begin()
    const timer = setInterval(async () => {
      const res = await loadOnce()
      if (alive) apply(res)
    }, 10_000)

    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  // Derived, not mirrored into state: a filtered copy held separately is one
  // more thing that can fall out of step with the list it came from.
  const visible = rows.filter((r) => (filter === 'all' ? true : r.type === filter))

  const delays = rows.filter((r) => r.type === 'delay_predicted').length
  const rejections = rows.filter((r) => r.type === 'doc_rejected').length

  if (status === 'error') {
    return (
      <>
        <PageHeader title="Exceptions" />
        <ErrorState title="Could not load the exception queue" error={error} onRetry={load} />
      </>
    )
  }

  const columns = [
    {
      key: 'severity',
      header: '',
      width: 44,
      render: (r) => (
        <span className={`exc-dot ${r.severity}`} aria-hidden="true">
          <Icon name={r.type === 'doc_rejected' ? 'file' : 'clock'} size={14} />
        </span>
      ),
    },
    {
      key: 'label',
      header: 'Exception',
      render: (r) => (
        <div className="exc-cell">
          <span className="exc-label">{r.label}</span>
          <span className="exc-sub">
            {r.type === 'doc_rejected'
              ? 'Held at origin — dispatch is blocked until the notice passes'
              : 'Raised while the vehicle is still moving, so the slot can still be changed'}
          </span>
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Consignment',
      width: 150,
      render: (r) => (
        <Link to={`/vendor/shipments/${r.shipmentId}`} className="mono fw-600">
          {r.reference ?? r.shipmentId}
        </Link>
      ),
    },
    {
      key: 'vehicleRegistration',
      header: 'Vehicle',
      width: 140,
      render: (r) => r.vehicleRegistration ?? '—',
    },
    {
      key: 'at',
      header: 'Raised',
      width: 170,
      render: (r) => formatDateTime(r.at),
    },
    {
      key: 'impact',
      header: 'Impact',
      width: 130,
      render: (r) => <SeverityBadge severity={r.severity} lateByMinutes={r.lateByMinutes} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="Exceptions"
        subtitle="Predicted delays and rejected notices, while there is still time to act"
      >
        {lastUpdated && <LiveIndicator label="Live" />}
      </PageHeader>

      <Card>
        <CardHeader
          title={`${rows.length} open`}
          subtitle={`${delays} predicted ${delays === 1 ? 'delay' : 'delays'} · ${rejections} rejected ${rejections === 1 ? 'notice' : 'notices'}`}
          actions={
            <SegmentedControl
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'delay_predicted', label: 'Delays' },
                { value: 'doc_rejected', label: 'Documents' },
              ]}
            />
          }
        />
        <CardBody flush>
          <Table
            columns={columns}
            rows={visible}
            getRowId={(r) => r.id}
            loading={status === 'loading'}
            emptyIcon="checkCircle"
            emptyTitle="Nothing needs attention"
            emptyDescription="No consignment is predicted to miss its slot and no shipping notice has been rejected. This queue fills itself from live predictions."
          />
        </CardBody>
      </Card>
    </>
  )
}

/**
 * Severity is about consequence, not about the event type.
 *
 * Missing a slot by ten minutes is usually absorbed; by an hour it means a
 * refused delivery or a renegotiation. The magnitude goes in the badge so
 * nobody has to open the row to find out whether it matters.
 */
function SeverityBadge({ severity, lateByMinutes }) {
  const map = {
    critical: { tone: 'danger', label: 'Act now' },
    warning: { tone: 'warn', label: 'At risk' },
    info: { tone: 'info', label: 'Minor' },
  }
  const { tone, label } = map[severity] ?? map.info
  return (
    <Badge tone={tone}>
      {lateByMinutes != null ? `${label} · ${lateByMinutes} min` : label}
    </Badge>
  )
}
