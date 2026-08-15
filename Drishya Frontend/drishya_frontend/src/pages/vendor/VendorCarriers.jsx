import { useState, useMemo } from 'react'
import useAsync from '../../hooks/useAsync.js'
import useDebounce from '../../hooks/useDebounce.js'
import useTableState from '../../hooks/useTableState.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { listCarriers, listVehicles } from '../../services/fleetService.js'
import { DEVICE_STATUS } from '../../lib/constants.js'
import { formatCurrency, formatNumber, formatRelative } from '../../lib/format.js'
import { sortRows } from '../../services/client.js'
import { downloadCSV } from '../../lib/csv.js'
import Card from '../../components/ui/Card.jsx'
import Table, { TableShell, TableToolbar } from '../../components/ui/Table.jsx'
import Button from '../../components/ui/Button.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import { FilterSelect } from '../../components/ui/Select.jsx'
import Badge, { StatusPill } from '../../components/ui/Badge.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { PageHeader, Progress, DataPoint } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'

const COLUMNS = [
  { key: 'regNumber', header: 'Vehicle', sortable: true, width: 150 },
  { key: 'type', header: 'Type', sortable: true, width: 160 },
  { key: 'carrier', header: 'Carrier', sortable: true, width: 170 },
  { key: 'capacityKg', header: 'Capacity', sortable: true, align: 'right', width: 110 },
  { key: 'deviceStatus', header: 'Tracking device', sortable: true, width: 150 },
  { key: 'lastPing', header: 'Last ping', sortable: true, width: 120 },
  { key: 'currentStatus', header: 'Assignment', sortable: true, width: 200 },
]

export default function VendorCarriers() {
  useDocumentTitle('Carriers & vehicles')

  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const [deviceStatus, setDeviceStatus] = useState('all')
  const [carrier, setCarrier] = useState('all')

  const table = useTableState({ initialSort: { key: 'regNumber', direction: 'asc' }, columns: COLUMNS })
  const carriers = useAsync(() => listCarriers(), [])
  const vehicles = useAsync(() => listVehicles({}), [])

  const rows = useMemo(() => {
    const data = vehicles.data ?? []
    const q = debounced.trim().toLowerCase()
    return data.filter((v) => {
      if (deviceStatus !== 'all' && v.deviceStatus !== deviceStatus) return false
      if (carrier !== 'all' && v.carrier !== carrier) return false
      if (q && !`${v.regNumber} ${v.type} ${v.carrier}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [vehicles.data, debounced, deviceStatus, carrier])

  const sorted = useMemo(() => sortRows(rows, table.sort.key, table.sort.direction), [rows, table.sort])
  const maxOnTime = Math.max(100, ...(carriers.data ?? []).map((c) => c.onTimePct))

  const columns = useMemo(
    () =>
      COLUMNS.map((col) => {
        switch (col.key) {
          case 'regNumber':
            return { ...col, render: (row) => <span className="mono fw-600 c-strong">{row.regNumber}</span> }
          case 'capacityKg':
            return { ...col, render: (row) => `${formatNumber(row.capacityKg)} kg` }
          case 'deviceStatus':
            return {
              ...col,
              render: (row) => (
                <span className="row gap-8">
                  <StatusPill status={row.deviceStatus} kind="device" size="sm" />
                  {row.deviceStatus === 'low-battery' ? <span className="t-xs c-muted">{row.batteryPct}%</span> : null}
                </span>
              ),
            }
          case 'lastPing':
            return { ...col, render: (row) => <span className="t-sm c-muted">{formatRelative(row.lastPing)}</span> }
          case 'currentStatus':
            return {
              ...col,
              render: (row) =>
                row.currentShipmentId ? (
                  <span className="stack">
                    <span className="mono t-sm c-strong">{row.currentShipmentId}</span>
                    <span className="t-xs c-muted">{row.currentLane}</span>
                  </span>
                ) : (
                  <Badge tone="neutral" size="sm">
                    Idle
                  </Badge>
                ),
            }
          default:
            return col
        }
      }),
    [],
  )

  return (
    <div className="page page-wide">
      <PageHeader
        title="Carriers & vehicles"
        subtitle="Who moves your consignments, how reliably, and whether their tracking devices are actually reporting."
        actions={
          <Button
            variant="secondary"
            icon="download"
            onClick={() =>
              downloadCSV('drishya-vehicles.csv', sorted, [
                { header: 'Vehicle', value: (r) => r.regNumber },
                { header: 'Type', value: (r) => r.type },
                { header: 'Carrier', value: (r) => r.carrier },
                { header: 'Capacity (kg)', value: (r) => r.capacityKg },
                { header: 'Device', value: (r) => DEVICE_STATUS[r.deviceStatus]?.label ?? r.deviceStatus },
                { header: 'Current shipment', value: (r) => r.currentShipmentId ?? '' },
              ])
            }
            disabled={!sorted.length}
          >
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-auto mb-24">
        {carriers.isLoading ? (
          <SkeletonCards count={5} height={186} />
        ) : (
          (carriers.data ?? []).map((c) => (
            <Card key={c.id} padded>
              <div className="row between gap-8 mb-12">
                <div className="row gap-10">
                  <span className="doc-icon" style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                    <Icon name="truck" size={17} />
                  </span>
                  <div>
                    <p className="fw-600 c-strong">{c.name}</p>
                    <p className="t-sm c-muted">{c.activeVehicles} vehicles</p>
                  </div>
                </div>
                <Badge tone={c.onTimePct >= 85 ? 'success' : c.onTimePct >= 70 ? 'warn' : 'danger'}>{c.onTimePct}% on time</Badge>
              </div>

              <div className="mb-12">
                <Progress value={c.onTimePct} max={maxOnTime} tone={c.onTimePct >= 85 ? 'success' : c.onTimePct >= 70 ? 'warn' : 'danger'} label={`${c.name} on-time rate`} />
              </div>

              <div className="grid grid-2 gap-12">
                <DataPoint label="Cost per trip" value={formatCurrency(c.costPerTrip)} />
                <DataPoint label="Active trips" value={c.activeTrips} />
                <DataPoint label="Completed" value={c.completedTrips} />
                <DataPoint label="This month" value={c.tripsThisMonth} />
              </div>
            </Card>
          ))
        )}
      </div>

      <TableShell>
        <TableToolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search a registration or vehicle type…" className="grow" label="Search vehicles" />
          <FilterSelect
            label="Device status"
            value={deviceStatus}
            onChange={setDeviceStatus}
            options={[{ value: 'all', label: 'All devices' }, ...Object.entries(DEVICE_STATUS).map(([value, meta]) => ({ value, label: meta.label }))]}
          />
          <FilterSelect
            label="Carrier"
            value={carrier}
            onChange={setCarrier}
            options={[{ value: 'all', label: 'All carriers' }, ...(carriers.data ?? []).map((c) => ({ value: c.name, label: c.name }))]}
          />
        </TableToolbar>

        <Table
          columns={columns}
          rows={sorted}
          loading={vehicles.isLoading}
          error={vehicles.error}
          onRetry={vehicles.reload}
          sort={table.sort}
          onSort={table.toggleSort}
          variant="compact"
          caption="Vehicles across all carriers"
          emptyTitle="No vehicles match"
          emptyDescription="Try clearing the device or carrier filter."
        />
      </TableShell>
    </div>
  )
}
