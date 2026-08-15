import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAlerts, useAuth, useToast } from '../../store/hooks.js'
import useDebounce from '../../hooks/useDebounce.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { acknowledgeAlert, markRead, markAllRead as markAllReadService } from '../../services/alertService.js'
import { ALERT_SEVERITY, ALERT_TYPES } from '../../lib/constants.js'
import { formatDateTime, formatRelative } from '../../lib/format.js'
import { downloadCSV } from '../../lib/csv.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import { FilterSelect } from '../../components/ui/Select.jsx'
import { SegmentedControl } from '../../components/ui/Tabs.jsx'
import Badge, { StatusPill } from '../../components/ui/Badge.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import Icon from '../../components/ui/Icon.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { PageHeader } from '../../components/ui/Misc.jsx'
import Pagination from '../../components/ui/Pagination.jsx'

const SEVERITY_ICON = { critical: 'alertCircle', warning: 'alert', info: 'info' }
const PAGE_SIZE = 20

export default function VendorAlerts() {
  useDocumentTitle('Alerts')
  const { items, unread, markRead: markReadLocal, markAllRead, acknowledge } = useAlerts()
  const { user } = useAuth()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const [severity, setSeverity] = useState('all')
  const [type, setType] = useState('all')
  const [readState, setReadState] = useState('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return items.filter((a) => {
      if (severity !== 'all' && a.severity !== severity) return false
      if (type !== 'all' && a.type !== type) return false
      if (readState === 'unread' && a.read) return false
      if (readState === 'read' && !a.read) return false
      if (q && !`${a.title} ${a.message} ${a.shipmentId ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, debounced, severity, type, readState])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const counts = useMemo(
    () => ({
      critical: items.filter((a) => a.severity === 'critical').length,
      warning: items.filter((a) => a.severity === 'warning').length,
      acknowledged: items.filter((a) => a.acknowledged).length,
    }),
    [items],
  )

  const hasFilters = debounced || severity !== 'all' || type !== 'all' || readState !== 'all'

  const onAcknowledge = async (alert) => {
    acknowledge(alert.id, user?.name ?? 'You')
    try {
      await acknowledgeAlert(alert.id, user?.name ?? 'You')
      toast.success('Alert acknowledged', { description: `${alert.title} on ${alert.shipmentId ?? 'this consignment'}.` })
    } catch (err) {
      toast.error('Could not acknowledge', { description: err.message })
    }
  }

  const onOpen = (alert) => {
    if (!alert.read) {
      markReadLocal(alert.id)
      markRead(alert.id)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Alerts"
        subtitle="Everything the platform has flagged, newest first. Acknowledging one records who took it on."
        actions={
          <>
            <Button
              variant="secondary"
              icon="download"
              disabled={!filtered.length}
              onClick={() =>
                downloadCSV('drishya-alerts.csv', filtered, [
                  { header: 'Raised', value: (r) => new Date(r.at).toISOString() },
                  { header: 'Severity', value: (r) => ALERT_SEVERITY[r.severity]?.label ?? r.severity },
                  { header: 'Type', value: (r) => r.title },
                  { header: 'Shipment', value: (r) => r.shipmentId ?? '' },
                  { header: 'Message', value: (r) => r.message },
                  { header: 'Acknowledged', value: (r) => (r.acknowledged ? r.acknowledgedBy ?? 'Yes' : 'No') },
                ])
              }
            >
              Export
            </Button>
            <Button
              variant="primary"
              icon="check"
              disabled={!unread}
              onClick={() => {
                markAllRead()
                markAllReadService(user)
                toast.info('All alerts marked read')
              }}
            >
              Mark all read
            </Button>
          </>
        }
      />

      <div className="grid grid-4 mb-24">
        <StatCard label="Unread" value={unread} icon="bell" accent={unread ? 'accent' : undefined} onClick={() => setReadState('unread')} />
        <StatCard label="Critical" value={counts.critical} icon="alertCircle" accent={counts.critical ? 'danger' : undefined} onClick={() => setSeverity('critical')} />
        <StatCard label="Warnings" value={counts.warning} icon="alert" accent="warn" onClick={() => setSeverity('warning')} />
        <StatCard label="Acknowledged" value={counts.acknowledged} icon="checkCircle" accent="success" hint="Someone has taken these on" />
      </div>

      <Card>
        <CardHeader title={`${filtered.length} alerts`}>
          <div className="row gap-8 wrap mt-8">
            <SearchInput value={search} onChange={setSearch} placeholder="Search alerts…" className="grow" label="Search alerts" />
            <FilterSelect
              label="Severity"
              value={severity}
              onChange={(v) => {
                setSeverity(v)
                setPage(1)
              }}
              options={[{ value: 'all', label: 'All severities' }, ...Object.entries(ALERT_SEVERITY).map(([value, meta]) => ({ value, label: meta.label }))]}
            />
            <FilterSelect
              label="Type"
              value={type}
              onChange={(v) => {
                setType(v)
                setPage(1)
              }}
              options={[{ value: 'all', label: 'All types' }, ...Object.entries(ALERT_TYPES).map(([value, label]) => ({ value, label }))]}
            />
            <SegmentedControl
              label="Read state"
              value={readState}
              onChange={(v) => {
                setReadState(v)
                setPage(1)
              }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'unread', label: 'Unread' },
                { value: 'read', label: 'Read' },
              ]}
            />
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                icon="x"
                onClick={() => {
                  setSearch('')
                  setSeverity('all')
                  setType('all')
                  setReadState('all')
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardBody flush>
          {rows.length === 0 ? (
            <EmptyState
              icon={hasFilters ? 'search' : 'bell'}
              title={hasFilters ? 'No alerts match these filters' : 'No alerts yet'}
              description={
                hasFilters
                  ? 'Try a different severity or clear the search.'
                  : 'Delay predictions, document problems and door events appear here as they are detected.'
              }
              actionLabel={hasFilters ? 'Clear filters' : undefined}
              onAction={() => {
                setSearch('')
                setSeverity('all')
                setType('all')
                setReadState('all')
              }}
            />
          ) : (
            <ul>
              {rows.map((alert) => (
                <li key={alert.id} className={`notif-item ${alert.read ? '' : 'is-unread'}`} style={{ alignItems: 'flex-start' }}>
                  <span className={`notif-icon is-${alert.severity}`}>
                    <Icon name={SEVERITY_ICON[alert.severity]} size={15} />
                  </span>

                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row gap-8 wrap">
                      <span className="notif-title">{alert.title}</span>
                      <StatusPill status={alert.severity} kind="alert" size="sm" />
                      {alert.acknowledged ? (
                        <Badge tone="success" size="sm" icon="check">
                          {alert.acknowledgedBy ?? 'Acknowledged'}
                        </Badge>
                      ) : null}
                    </div>

                    <p className="notif-message">{alert.message}</p>

                    <div className="notif-meta">
                      {alert.shipmentId ? (
                        <Link to={`/vendor/shipments/${alert.shipmentId}`} className="mono" onClick={() => onOpen(alert)}>
                          {alert.shipmentId}
                        </Link>
                      ) : null}
                      <time dateTime={new Date(alert.at).toISOString()} title={formatDateTime(alert.at)}>
                        {formatRelative(alert.at)}
                      </time>
                    </div>
                  </div>

                  <div className="row gap-6 shrink-0">
                    {!alert.acknowledged ? (
                      <Button variant="secondary" size="sm" icon="check" onClick={() => onAcknowledge(alert)}>
                        Acknowledge
                      </Button>
                    ) : null}
                    {alert.shipmentId ? (
                      <Button variant="ghost" size="sm" iconRight="arrowRight" to={`/vendor/shipments/${alert.shipmentId}`} onClick={() => onOpen(alert)}>
                        Open
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>

        {filtered.length > PAGE_SIZE ? (
          <Pagination page={safePage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="alerts" />
        ) : null}
      </Card>
    </div>
  )
}
