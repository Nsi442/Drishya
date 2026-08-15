import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import useAsync from '../../hooks/useAsync.js'
import useDebounce from '../../hooks/useDebounce.js'
import useTableState from '../../hooks/useTableState.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { useAuth, useToast } from '../../store/hooks.js'
import { listExceptions, updateException } from '../../services/alertService.js'
import { EXCEPTION_TYPES, EXCEPTION_STATUS } from '../../lib/constants.js'
import { formatDateTime, formatRelative } from '../../lib/format.js'
import { sortRows } from '../../services/client.js'
import { downloadCSV } from '../../lib/csv.js'
import Table, { TableShell, TableToolbar } from '../../components/ui/Table.jsx'
import Drawer from '../../components/ui/Drawer.jsx'
import Button from '../../components/ui/Button.jsx'
import Select from '../../components/ui/Select.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import { FilterSelect } from '../../components/ui/Select.jsx'
import { Textarea } from '../../components/ui/Input.jsx'
import Badge, { StatusPill } from '../../components/ui/Badge.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { PageHeader, Callout, DataPoint } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'

const OWNERS = ['Unassigned', 'Priya Raghavan', 'Imran Qureshi', 'Lakshmi Nair', 'Devendra Patil']

const COLUMNS = [
  { key: 'title', header: 'Exception', sortable: true, width: 200 },
  { key: 'vendorName', header: 'Vendor', sortable: true, width: 180 },
  { key: 'shipmentId', header: 'Consignment', sortable: true, width: 130 },
  { key: 'severity', header: 'Severity', sortable: true, width: 120 },
  { key: 'status', header: 'Status', sortable: true, width: 140 },
  { key: 'owner', header: 'Owner', sortable: true, width: 160 },
  { key: 'raisedAt', header: 'Raised', sortable: true, width: 140 },
  { key: 'impactMin', header: 'Impact', sortable: true, align: 'right', width: 100 },
]

export default function Exceptions() {
  useDocumentTitle('Exceptions')
  const { user } = useAuth()
  const toast = useToast()
  const fcId = user?.orgId ?? 'fc-bhiwandi'

  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [owner, setOwner] = useState('')
  const [busy, setBusy] = useState(false)

  const table = useTableState({ initialSort: { key: 'raisedAt', direction: 'desc' }, columns: COLUMNS })
  const exceptions = useAsync(() => listExceptions({ fcId }), [fcId])

  const rows = useMemo(() => {
    const data = exceptions.data ?? []
    const q = debounced.trim().toLowerCase()
    return data.filter((e) => {
      if (status !== 'all' && e.status !== status) return false
      if (type !== 'all' && e.type !== type) return false
      if (q && !`${e.title} ${e.detail} ${e.shipmentId} ${e.vendorName}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [exceptions.data, debounced, status, type])

  const sorted = useMemo(() => sortRows(rows, table.sort.key, table.sort.direction), [rows, table.sort])

  const stats = useMemo(() => {
    const data = exceptions.data ?? []
    return {
      open: data.filter((e) => e.status === 'open').length,
      investigating: data.filter((e) => e.status === 'investigating').length,
      resolved: data.filter((e) => e.status === 'resolved').length,
      unassigned: data.filter((e) => e.status !== 'resolved' && e.owner === 'Unassigned').length,
    }
  }, [exceptions.data])

  const openDrawer = (exc) => {
    setSelected(exc)
    setNote(exc.resolutionNote ?? '')
    setOwner(exc.owner)
  }

  const save = async (nextStatus) => {
    setBusy(true)
    try {
      await updateException(selected.id, { status: nextStatus, owner, resolutionNote: note.trim() || null })
      toast.success(`Exception ${nextStatus}`, { description: `${selected.title} on ${selected.shipmentId}.` })
      setSelected(null)
      exceptions.reload()
    } catch (err) {
      toast.error('Could not update', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const columns = useMemo(
    () =>
      COLUMNS.map((col) => {
        switch (col.key) {
          case 'title':
            return {
              ...col,
              render: (r) => (
                <span className="row gap-8">
                  <span className={`doc-icon is-${r.severity === 'critical' ? 'mismatch' : 'expiring'}`} style={{ width: 24, height: 24 }}>
                    <Icon name={r.severity === 'critical' ? 'alertCircle' : 'alert'} size={13} />
                  </span>
                  <span className="fw-600 c-strong">{r.title}</span>
                </span>
              ),
            }
          case 'shipmentId':
            return {
              ...col,
              render: (r) => (
                <Link to={`/fc/inbound/${r.shipmentId}`} className="mono fw-600" style={{ color: 'var(--text-strong)' }} onClick={(e) => e.stopPropagation()}>
                  {r.shipmentId}
                </Link>
              ),
            }
          case 'severity':
            return {
              ...col,
              render: (r) => (
                <Badge tone={r.severity === 'critical' ? 'danger' : 'warn'} size="sm">
                  <span className="status-dot" aria-hidden="true" />
                  {r.severity}
                </Badge>
              ),
            }
          case 'status':
            return { ...col, render: (r) => <StatusPill status={r.status} kind="exception" size="sm" /> }
          case 'owner':
            return {
              ...col,
              render: (r) =>
                r.owner === 'Unassigned' ? (
                  <Badge tone="neutral" size="sm">
                    Unassigned
                  </Badge>
                ) : (
                  <span className="t-sm">{r.owner}</span>
                ),
            }
          case 'raisedAt':
            return { ...col, render: (r) => <span className="t-sm c-muted">{formatRelative(r.raisedAt)}</span> }
          case 'impactMin':
            return { ...col, render: (r) => (r.impactMin ? `${r.impactMin} min` : '—') }
          default:
            return col
        }
      }),
    [],
  )

  const hasFilters = debounced || status !== 'all' || type !== 'all'

  return (
    <div className="page page-wide">
      <PageHeader
        title="Exceptions"
        subtitle="Every anomaly raised at the gate or the dock, who owns it, and how it was closed."
        actions={
          <Button
            variant="secondary"
            icon="download"
            disabled={!sorted.length}
            onClick={() =>
              downloadCSV('drishya-exceptions.csv', sorted, [
                { header: 'Exception', value: (r) => r.title },
                { header: 'Vendor', value: (r) => r.vendorName },
                { header: 'Consignment', value: (r) => r.shipmentId },
                { header: 'Severity', value: (r) => r.severity },
                { header: 'Status', value: (r) => EXCEPTION_STATUS[r.status]?.label ?? r.status },
                { header: 'Owner', value: (r) => r.owner },
                { header: 'Raised', value: (r) => new Date(r.raisedAt).toISOString() },
                { header: 'Impact (min)', value: (r) => r.impactMin },
                { header: 'Resolution', value: (r) => r.resolutionNote ?? '' },
              ])
            }
          >
            Export
          </Button>
        }
      />

      <div className="grid grid-4 mb-24">
        {exceptions.isLoading ? (
          <SkeletonCards count={4} height={98} />
        ) : (
          <>
            <StatCard label="Open" value={stats.open} icon="alertCircle" accent={stats.open ? 'danger' : undefined} onClick={() => setStatus('open')} />
            <StatCard label="Being investigated" value={stats.investigating} icon="search" accent="warn" onClick={() => setStatus('investigating')} />
            <StatCard label="Resolved" value={stats.resolved} icon="checkCircle" accent="success" onClick={() => setStatus('resolved')} />
            <StatCard label="Unassigned" value={stats.unassigned} icon="user" accent={stats.unassigned ? 'warn' : undefined} hint="Nobody has picked these up" />
          </>
        )}
      </div>

      {stats.unassigned ? (
        <Callout tone="warn" title={`${stats.unassigned} exceptions have no owner`} className="mb-16">
          An exception nobody owns does not get closed. Open one and assign it.
        </Callout>
      ) : null}

      <TableShell>
        <TableToolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search exceptions, vendors or consignments…" className="grow" label="Search exceptions" />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[{ value: 'all', label: 'All statuses' }, ...Object.entries(EXCEPTION_STATUS).map(([value, meta]) => ({ value, label: meta.label }))]}
          />
          <FilterSelect
            label="Type"
            value={type}
            onChange={setType}
            options={[{ value: 'all', label: 'All types' }, ...Object.entries(EXCEPTION_TYPES).map(([value, label]) => ({ value, label }))]}
          />
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              icon="x"
              onClick={() => {
                setSearch('')
                setStatus('all')
                setType('all')
              }}
            >
              Clear
            </Button>
          ) : null}
        </TableToolbar>

        <Table
          columns={columns}
          rows={sorted}
          loading={exceptions.isLoading}
          error={exceptions.error}
          onRetry={exceptions.reload}
          sort={table.sort}
          onSort={table.toggleSort}
          onRowClick={openDrawer}
          variant="compact"
          caption="Receiving exceptions"
          emptyTitle={hasFilters ? 'No exceptions match' : 'No exceptions raised'}
          emptyDescription={hasFilters ? 'Try a different status or type.' : 'Nothing has gone wrong at receiving — nothing to work.'}
        />
      </TableShell>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title}
        subtitle={selected ? `${selected.vendorName} · ${selected.shipmentId}` : ''}
        size="lg"
        footer={
          selected ? (
            <>
              {selected.status !== 'resolved' ? (
                <Button variant="secondary" block loading={busy} onClick={() => save('investigating')}>
                  Mark investigating
                </Button>
              ) : null}
              <Button variant="primary" block loading={busy} onClick={() => save('resolved')} disabled={selected.status === 'resolved' && !note.trim()}>
                {selected.status === 'resolved' ? 'Update resolution' : 'Resolve'}
              </Button>
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="stack gap-16 pad">
            <div className="row gap-8 wrap">
              <StatusPill status={selected.status} kind="exception" />
              <Badge tone={selected.severity === 'critical' ? 'danger' : 'warn'}>
                <span className="status-dot" aria-hidden="true" />
                {selected.severity}
              </Badge>
            </div>

            <Callout tone={selected.severity === 'critical' ? 'danger' : 'warn'} title="What happened">
              {selected.detail}
            </Callout>

            <div className="grid grid-2 gap-12">
              <DataPoint label="Raised" value={formatDateTime(selected.raisedAt)} />
              <DataPoint label="Impact" value={selected.impactMin ? `${selected.impactMin} min` : '—'} />
              <DataPoint label="Vendor" value={selected.vendorName} />
              <DataPoint label="Consignment" value={selected.shipmentId} mono />
              {selected.resolvedAt ? <DataPoint label="Resolved" value={formatDateTime(selected.resolvedAt)} /> : null}
            </div>

            <Select label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} options={OWNERS} hint="Who is chasing this to a close." />

            <Textarea
              label="Resolution note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Vendor re-issued the e-way bill; consignment released to Dock 4 at 14:20."
              hint="Shared with the vendor when the exception is closed."
            />

            <Button variant="secondary" block to={`/fc/inbound/${selected.shipmentId}`} onClick={() => setSelected(null)} iconRight="arrowRight">
              Open the consignment
            </Button>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
