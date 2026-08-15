import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAppState, useAuth } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useTableState from '../../hooks/useTableState.js'
import useDebounce from '../../hooks/useDebounce.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import useNow from '../../hooks/useNow.js'
import { sortRows } from '../../services/client.js'
import { ACTIVE_STATUSES, SHIPMENT_STATUS } from '../../lib/constants.js'
import { formatTime, formatNumber } from '../../lib/format.js'
import { downloadCSV } from '../../lib/csv.js'
import { refData as db } from '../../services/referenceData.js'
import Table, { TableShell, TableToolbar } from '../../components/ui/Table.jsx'
import Button from '../../components/ui/Button.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import { FilterSelect } from '../../components/ui/Select.jsx'
import { SegmentedControl } from '../../components/ui/Tabs.jsx'
import Badge, { StatusPill, DelayPill, PriorityBadge } from '../../components/ui/Badge.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { PageHeader, LiveIndicator, Tooltip } from '../../components/ui/Misc.jsx'

const HOUR = 3600000

// The FC's core screen. Big type, sorted by live ETA, colour-coded variance —
// designed to be read across a receiving office rather than leaned into.
export default function ArrivalBoard() {
  useDocumentTitle('Arrival board')
  const state = useAppState()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const fcId = user?.orgId ?? 'fc-bhiwandi'
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const [timeWindow, setTimeWindow] = useState(params.get('window') ?? 'today')
  const [status, setStatus] = useState('all')
  const [vendorId, setVendorId] = useState('all')

  const table = useTableState({ initialSort: { key: 'predictedAt', direction: 'asc' }, initialPageSize: 100 })
  const shipments = selectShipments(state)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  // The board's "next 4 hours" window slides with the clock.
  const now = useNow(60000)

  const rows = useMemo(() => {
    const todayEnd = new Date(now).setHours(23, 59, 59, 999)
    const q = debounced.trim().toLowerCase()

    return shipments
      .filter((s) => {
        if (s.fcId !== fcId || s.status === 'cancelled') return false
        if (timeWindow === 'today' && (s.predictedAt > todayEnd || s.status === 'delivered')) return false
        if (timeWindow === '4h' && (s.predictedAt < now - HOUR || s.predictedAt > now + 4 * HOUR)) return false
        if (timeWindow === 'active' && !ACTIVE_STATUSES.includes(s.status)) return false
        if (status !== 'all' && s.status !== status) return false
        if (vendorId !== 'all' && s.vendorId !== vendorId) return false
        if (q && !`${s.id} ${s.vendorName} ${s.vehicleReg} ${s.reference} ${s.driverName}`.toLowerCase().includes(q)) return false
        return true
      })
      .map((s) => ({
        ...s,
        etaDeltaMin: Math.round((s.predictedAt - s.slotStart) / 60000),
        dockName: s.dockId ? db.docks.find((d) => d.id === s.dockId)?.name ?? null : null,
        docsClear: s.documents.every((d) => d.status === 'valid' || d.status === 'pending'),
      }))
  }, [shipments, fcId, timeWindow, status, vendorId, debounced, now])

  const sorted = useMemo(() => sortRows(rows, table.sort.key, table.sort.direction), [rows, table.sort])

  const vendors = useMemo(() => {
    const ids = [...new Set(shipments.filter((s) => s.fcId === fcId).map((s) => s.vendorId))]
    return db.vendors.filter((v) => ids.includes(v.id))
  }, [shipments, fcId])

  const summary = useMemo(
    () => ({
      late: rows.filter((r) => r.etaDeltaMin > 15).length,
      docIssues: rows.filter((r) => !r.docsClear).length,
      cartons: rows.reduce((sum, r) => sum + r.cartons, 0),
    }),
    [rows],
  )

  const columns = useMemo(
    () => [
      {
        key: 'vendorName',
        header: 'Vendor',
        sortable: true,
        width: 200,
        render: (r) => (
          <span className="row gap-8">
            <span className="fw-600 c-strong truncate">{r.vendorName}</span>
            <PriorityBadge priority={r.priority} />
          </span>
        ),
      },
      {
        key: 'id',
        header: 'Consignment',
        sortable: true,
        width: 140,
        render: (r) => (
          <Link to={`/fc/inbound/${r.id}`} className="mono fw-700" style={{ color: 'var(--text-strong)' }}>
            {r.id}
          </Link>
        ),
      },
      { key: 'vehicleReg', header: 'Vehicle', sortable: true, width: 140, render: (r) => <span className="mono">{r.vehicleReg}</span> },
      { key: 'cartons', header: 'Cartons', sortable: true, align: 'right', width: 100, render: (r) => formatNumber(r.cartons) },
      {
        key: 'slotStart',
        header: 'Promised slot',
        sortable: true,
        width: 130,
        render: (r) => <span className="fw-500">{formatTime(r.slotStart)}</span>,
      },
      {
        key: 'predictedAt',
        header: 'Live ETA',
        sortable: true,
        width: 130,
        render: (r) => <span className="fw-700 c-strong">{formatTime(r.predictedAt)}</span>,
      },
      {
        key: 'etaDeltaMin',
        header: 'Variance',
        sortable: true,
        width: 150,
        render: (r) => <DelayPill minutes={r.etaDeltaMin} />,
      },
      { key: 'status', header: 'Status', sortable: true, width: 140, render: (r) => <StatusPill status={r.status} /> },
      {
        key: 'dockName',
        header: 'Dock',
        sortable: true,
        width: 120,
        render: (r) =>
          r.dockName ? (
            <Badge tone="accent" size="sm">
              {r.dockName}
            </Badge>
          ) : (
            <span className="c-subtle t-sm">Unassigned</span>
          ),
      },
      {
        key: 'docsClear',
        header: 'Docs',
        width: 90,
        render: (r) =>
          r.docsClear ? (
            <Icon name="checkCircle" size={17} className="c-success" title="Paperwork will clear" />
          ) : (
            <Tooltip content="Document problem — check before gate-in">
              <Icon name="alertCircle" size={17} className="c-danger" title="Document problem" />
            </Tooltip>
          ),
      },
    ],
    [],
  )

  return (
    <div className="page page-wide">
      <PageHeader
        title="Arrival board"
        subtitle={`${formatNumber(rows.length)} inbound · ${formatNumber(summary.cartons)} cartons expected`}
        actions={
          <>
            <LiveIndicator paused={state.ui.livePaused || !state.ui.liveEnabled} label="Auto-refreshing" />
            <Button
              variant="secondary"
              icon="download"
              disabled={!sorted.length}
              onClick={() =>
                downloadCSV('drishya-arrival-board.csv', sorted, [
                  { header: 'Vendor', value: (r) => r.vendorName },
                  { header: 'Consignment', value: (r) => r.id },
                  { header: 'Vehicle', value: (r) => r.vehicleReg },
                  { header: 'Cartons', value: (r) => r.cartons },
                  { header: 'Promised slot', value: (r) => new Date(r.slotStart).toISOString() },
                  { header: 'Live ETA', value: (r) => new Date(r.predictedAt).toISOString() },
                  { header: 'Variance (min)', value: (r) => r.etaDeltaMin },
                  { header: 'Status', value: (r) => SHIPMENT_STATUS[r.status]?.label ?? r.status },
                  { header: 'Dock', value: (r) => r.dockName ?? '' },
                ])
              }
            >
              Export
            </Button>
          </>
        }
      />

      {summary.late || summary.docIssues ? (
        <div className="row gap-8 wrap mb-16">
          {summary.late ? (
            <Badge tone="warn" icon="clock">
              {summary.late} arriving late
            </Badge>
          ) : null}
          {summary.docIssues ? (
            <Badge tone="danger" icon="alertCircle">
              {summary.docIssues} with document problems
            </Badge>
          ) : null}
        </div>
      ) : null}

      <TableShell>
        <TableToolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search vendor, consignment or vehicle…" className="grow" label="Search the arrival board" />

          <SegmentedControl
            label="Time window"
            value={timeWindow}
            onChange={(v) => {
              setTimeWindow(v)
              setParams(v === 'today' ? {} : { window: v }, { replace: true })
            }}
            options={[
              { value: '4h', label: 'Next 4h' },
              { value: 'today', label: 'Today' },
              { value: 'active', label: 'All active' },
            ]}
          />

          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All statuses' },
              ...Object.entries(SHIPMENT_STATUS)
                .filter(([key]) => key !== 'cancelled')
                .map(([value, meta]) => ({ value, label: meta.label })),
            ]}
          />

          <FilterSelect
            label="Vendor"
            value={vendorId}
            onChange={setVendorId}
            options={[{ value: 'all', label: 'All vendors' }, ...vendors.map((v) => ({ value: v.id, label: v.name }))]}
          />
        </TableToolbar>

        <Table
          columns={columns}
          rows={sorted}
          loading={loading}
          sort={table.sort}
          onSort={table.toggleSort}
          onRowClick={(row) => navigate(`/fc/inbound/${row.id}`)}
          flashIds={state.shipments.flashed}
          variant="board"
          caption="Inbound arrivals, sorted by live ETA"
          emptyTitle="Nothing inbound in this window"
          emptyDescription="Widen the time window or clear the vendor filter to see more arrivals."
          emptyAction={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTimeWindow('active')
                setStatus('all')
                setVendorId('all')
                setSearch('')
              }}
            >
              Show all active
            </Button>
          }
        />
      </TableShell>
    </div>
  )
}
