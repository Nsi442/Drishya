import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAppState } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useTableState from '../../hooks/useTableState.js'
import useDebounce from '../../hooks/useDebounce.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { sortRows, paginate } from '../../services/client.js'
import { ACTIVE_STATUSES, SHIPMENT_STATUS } from '../../lib/constants.js'
import { formatDate, formatTime, formatNumber } from '../../lib/format.js'
import { downloadCSV } from '../../lib/csv.js'
import { refData as db } from '../../services/referenceData.js'
import Table, { TableShell, TableToolbar, BulkBar, ColumnChooser } from '../../components/ui/Table.jsx'
import Pagination from '../../components/ui/Pagination.jsx'
import Button from '../../components/ui/Button.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import { FilterSelect } from '../../components/ui/Select.jsx'
import { StatusPill, DelayPill, PriorityBadge } from '../../components/ui/Badge.jsx'
import { PageHeader, LiveIndicator } from '../../components/ui/Misc.jsx'
import Icon from '../../components/ui/Icon.jsx'

const COLUMNS = [
  { key: 'id', header: 'Shipment', sortable: true, required: true, width: 130 },
  { key: 'status', header: 'Status', sortable: true, width: 124 },
  { key: 'lane', header: 'Lane', sortable: true, width: 200 },
  { key: 'fcName', header: 'Destination', sortable: true, width: 150 },
  { key: 'carrier', header: 'Carrier', sortable: true, width: 160, defaultHidden: true },
  { key: 'vehicleReg', header: 'Vehicle', sortable: true, width: 140 },
  { key: 'driverName', header: 'Driver', sortable: true, width: 140, defaultHidden: true },
  { key: 'cartons', header: 'Cartons', sortable: true, align: 'right', width: 90 },
  { key: 'promisedAt', header: 'Promised', sortable: true, width: 140 },
  { key: 'predictedAt', header: 'Predicted ETA', sortable: true, width: 140 },
  { key: 'delayMin', header: 'Variance', sortable: true, width: 128 },
  { key: 'documents', header: 'Docs', width: 78 },
]

export default function VendorShipments() {
  useDocumentTitle('Shipments')
  const state = useAppState()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)

  const [filters, setFilters] = useState(() => ({
    status: params.get('status') ?? 'all',
    fcId: params.get('fc') ?? 'all',
    carrier: params.get('carrier') ?? 'all',
    lane: 'all',
    delayed: params.get('delayed') === '1',
  }))

  const table = useTableState({ initialSort: { key: 'promisedAt', direction: 'asc' }, initialPageSize: 25, columns: COLUMNS })
  const all = selectShipments(state)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  // Keep the URL in step so a filtered view can be linked to or bookmarked.
  useEffect(() => {
    const next = new URLSearchParams()
    if (filters.status !== 'all') next.set('status', filters.status)
    if (filters.fcId !== 'all') next.set('fc', filters.fcId)
    if (filters.carrier !== 'all') next.set('carrier', filters.carrier)
    if (filters.delayed) next.set('delayed', '1')
    setParams(next, { replace: true })
  }, [filters, setParams])

  const lanes = useMemo(() => [...new Set(all.map((s) => s.lane))].sort(), [all])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return all.filter((s) => {
      if (q && !`${s.id} ${s.reference} ${s.lane} ${s.vehicleReg} ${s.driverName} ${s.carrier} ${s.fcName} ${s.invoiceNo}`.toLowerCase().includes(q)) return false
      if (filters.status === 'active' && !ACTIVE_STATUSES.includes(s.status)) return false
      if (filters.status !== 'all' && filters.status !== 'active' && s.status !== filters.status) return false
      if (filters.fcId !== 'all' && s.fcId !== filters.fcId) return false
      if (filters.carrier !== 'all' && s.carrier !== filters.carrier) return false
      if (filters.lane !== 'all' && s.lane !== filters.lane) return false
      if (filters.delayed && s.delayMin <= 15) return false
      return true
    })
  }, [all, debounced, filters])

  const sorted = useMemo(() => sortRows(filtered, table.sort.key, table.sort.direction), [filtered, table.sort])
  const page = useMemo(() => paginate(sorted, { page: table.page, pageSize: table.pageSize }), [sorted, table.page, table.pageSize])

  const hasFilters = debounced || filters.status !== 'all' || filters.fcId !== 'all' || filters.carrier !== 'all' || filters.lane !== 'all' || filters.delayed

  const resetFilters = () => {
    setSearch('')
    setFilters({ status: 'all', fcId: 'all', carrier: 'all', lane: 'all', delayed: false })
    table.resetPage()
  }

  const columns = useMemo(
    () =>
      table.visibleColumns.map((col) => {
        switch (col.key) {
          case 'id':
            return {
              ...col,
              render: (row) => (
                <span className="row gap-6">
                  <Link to={`/vendor/shipments/${row.id}`} className="mono fw-600" style={{ color: 'var(--text-strong)' }}>
                    {row.id}
                  </Link>
                  <PriorityBadge priority={row.priority} />
                </span>
              ),
            }
          case 'status':
            return { ...col, render: (row) => <StatusPill status={row.status} size="sm" /> }
          case 'delayMin':
            return { ...col, render: (row) => <DelayPill minutes={row.delayMin} size="sm" /> }
          case 'promisedAt':
          case 'predictedAt':
            return {
              ...col,
              render: (row) => (
                <span className="stack">
                  <span className="c-strong">{formatTime(row[col.key])}</span>
                  <span className="t-xs c-muted">{formatDate(row[col.key], { year: undefined })}</span>
                </span>
              ),
            }
          case 'cartons':
            return { ...col, render: (row) => formatNumber(row.cartons) }
          case 'vehicleReg':
            return { ...col, render: (row) => <span className="mono t-sm">{row.vehicleReg}</span> }
          case 'documents':
            return {
              ...col,
              render: (row) => {
                const bad = row.documents.filter((d) => d.status === 'mismatch' || d.status === 'missing').length
                const warn = row.documents.filter((d) => d.status === 'expiring').length
                if (bad) return <span className="row gap-4 c-danger t-sm fw-600"><Icon name="alertCircle" size={13} />{bad}</span>
                if (warn) return <span className="row gap-4 c-warn t-sm fw-600"><Icon name="alert" size={13} />{warn}</span>
                return <span className="row gap-4 c-success t-sm"><Icon name="checkCircle" size={13} />Clear</span>
              },
            }
          default:
            return col
        }
      }),
    [table.visibleColumns],
  )

  const exportCSV = (rows) =>
    downloadCSV(
      `drishya-shipments-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
      [
        { header: 'Shipment', value: (r) => r.id },
        { header: 'Reference', value: (r) => r.reference },
        { header: 'Status', value: (r) => SHIPMENT_STATUS[r.status]?.label ?? r.status },
        { header: 'Lane', value: (r) => r.lane },
        { header: 'Destination', value: (r) => r.fcName },
        { header: 'Carrier', value: (r) => r.carrier },
        { header: 'Vehicle', value: (r) => r.vehicleReg },
        { header: 'Driver', value: (r) => r.driverName },
        { header: 'Cartons', value: (r) => r.cartons },
        { header: 'Promised', value: (r) => new Date(r.promisedAt).toISOString() },
        { header: 'Predicted', value: (r) => new Date(r.predictedAt).toISOString() },
        { header: 'Variance (min)', value: (r) => r.delayMin },
      ],
    )

  const selectedRows = sorted.filter((s) => table.selected.has(s.id))

  return (
    <div className="page page-wide">
      <PageHeader
        title="Shipments"
        subtitle={`${formatNumber(filtered.length)} of ${formatNumber(all.length)} consignments`}
        actions={
          <>
            <LiveIndicator paused={state.ui.livePaused || !state.ui.liveEnabled} />
            <Button variant="secondary" icon="download" onClick={() => exportCSV(sorted)} disabled={!sorted.length}>
              Export CSV
            </Button>
            <Button variant="primary" to="/vendor/shipments/new" icon="plus">
              New shipment
            </Button>
          </>
        }
      />

      <TableShell>
        <TableToolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search ID, reference, vehicle, driver…" className="grow" label="Search shipments" />

          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => {
              setFilters((f) => ({ ...f, status: v }))
              table.resetPage()
            }}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'active', label: 'Active only' },
              ...Object.entries(SHIPMENT_STATUS).map(([value, meta]) => ({ value, label: meta.label })),
            ]}
          />

          <FilterSelect
            label="Destination"
            value={filters.fcId}
            onChange={(v) => {
              setFilters((f) => ({ ...f, fcId: v }))
              table.resetPage()
            }}
            options={[{ value: 'all', label: 'All centres' }, ...db.fulfilmentCentres.map((fc) => ({ value: fc.id, label: fc.name }))]}
          />

          <FilterSelect
            label="Carrier"
            value={filters.carrier}
            onChange={(v) => {
              setFilters((f) => ({ ...f, carrier: v }))
              table.resetPage()
            }}
            options={[{ value: 'all', label: 'All carriers' }, ...db.carriers.map((c) => ({ value: c.name, label: c.name }))]}
          />

          <FilterSelect
            label="Lane"
            value={filters.lane}
            onChange={(v) => {
              setFilters((f) => ({ ...f, lane: v }))
              table.resetPage()
            }}
            options={[{ value: 'all', label: 'All lanes' }, ...lanes.map((l) => ({ value: l, label: l }))]}
          />

          <Button
            variant={filters.delayed ? 'primary' : 'secondary'}
            size="sm"
            icon="alert"
            onClick={() => {
              setFilters((f) => ({ ...f, delayed: !f.delayed }))
              table.resetPage()
            }}
            aria-pressed={filters.delayed}
          >
            Delayed only
          </Button>

          <ColumnChooser columns={COLUMNS} hidden={table.hidden} onToggle={table.toggleColumn} />

          {hasFilters ? (
            <Button variant="ghost" size="sm" icon="x" onClick={resetFilters}>
              Clear
            </Button>
          ) : null}
        </TableToolbar>

        <BulkBar count={table.selected.size} onClear={table.clearSelection}>
          <Button variant="secondary" size="sm" icon="download" onClick={() => exportCSV(selectedRows)}>
            Export selection
          </Button>
          <Button variant="secondary" size="sm" icon="calendar" to="/vendor/appointments">
            Request dock slots
          </Button>
          <Button variant="secondary" size="sm" icon="file" to="/vendor/documents">
            Review documents
          </Button>
        </BulkBar>

        <Table
          columns={columns}
          rows={page.rows}
          loading={loading}
          selectable
          selected={table.selected}
          onToggleRow={table.toggleRow}
          onToggleAll={table.toggleAll}
          sort={table.sort}
          onSort={table.toggleSort}
          onRowClick={(row) => navigate(`/vendor/shipments/${row.id}`)}
          flashIds={state.shipments.flashed}
          caption="All shipments, filterable and sortable"
          emptyTitle={hasFilters ? 'No shipments match these filters' : 'No shipments yet'}
          emptyDescription={
            hasFilters
              ? 'Try widening the date range or clearing a filter to see more consignments.'
              : 'Create your first consignment and it will appear here with live tracking.'
          }
          emptyAction={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                Clear all filters
              </Button>
            ) : (
              <Button variant="primary" size="sm" to="/vendor/shipments/new" icon="plus">
                Create a shipment
              </Button>
            )
          }
        />

        <Pagination
          page={page.page}
          pageCount={page.pageCount}
          total={page.total}
          pageSize={page.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="shipments"
        />
      </TableShell>
    </div>
  )
}
