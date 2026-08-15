import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import useAsync from '../../hooks/useAsync.js'
import useDebounce from '../../hooks/useDebounce.js'
import useTableState from '../../hooks/useTableState.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import useNow from '../../hooks/useNow.js'
import { useToast } from '../../store/hooks.js'
import { listDrivers, setDriverAvailability } from '../../services/fleetService.js'
import { formatDate, formatNumber } from '../../lib/format.js'
import { sortRows } from '../../services/client.js'
import { downloadCSV } from '../../lib/csv.js'
import Table, { TableShell, TableToolbar } from '../../components/ui/Table.jsx'
import Button from '../../components/ui/Button.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import { FilterSelect } from '../../components/ui/Select.jsx'
import { Switch } from '../../components/ui/Checkbox.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Icon from '../../components/ui/Icon.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import { PageHeader, Tooltip } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'

const COLUMNS = [
  { key: 'name', header: 'Driver', sortable: true, width: 210 },
  { key: 'phone', header: 'Contact', sortable: true, width: 150 },
  { key: 'vehicleReg', header: 'Assigned vehicle', sortable: true, width: 150 },
  { key: 'currentStatus', header: 'Current trip', sortable: true, width: 200 },
  { key: 'tripsCompleted', header: 'Trips', sortable: true, align: 'right', width: 90 },
  { key: 'rating', header: 'Rating', sortable: true, align: 'right', width: 100 },
  { key: 'licenceExpiry', header: 'Licence expiry', sortable: true, width: 150 },
  { key: 'available', header: 'Available', width: 110 },
]

const DAY = 86400000

export default function VendorDrivers() {
  useDocumentTitle('Drivers')
  const toast = useToast()

  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const [availability, setAvailability] = useState('all')

  // Licence expiry counts down against a clock held in state.
  const now = useNow(600000)

  const table = useTableState({ initialSort: { key: 'name', direction: 'asc' }, columns: COLUMNS })
  const drivers = useAsync(() => listDrivers({}), [])

  const rows = useMemo(() => {
    const data = drivers.data ?? []
    const q = debounced.trim().toLowerCase()
    return data.filter((d) => {
      if (availability === 'available' && !d.available) return false
      if (availability === 'unavailable' && d.available) return false
      if (q && !`${d.name} ${d.phone} ${d.vehicleReg}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [drivers.data, debounced, availability])

  const sorted = useMemo(() => sortRows(rows, table.sort.key, table.sort.direction), [rows, table.sort])

  const stats = useMemo(() => {
    const data = drivers.data ?? []
    return {
      total: data.length,
      available: data.filter((d) => d.available).length,
      onTrip: data.filter((d) => d.currentShipmentId).length,
      expiring: data.filter((d) => new Date(d.licenceExpiry).getTime() - now < 90 * DAY).length,
    }
  }, [drivers.data, now])

  const onToggle = async (driver, next) => {
    // Optimistic — the roster should respond to a tap immediately.
    drivers.setData((prev) => prev.map((d) => (d.id === driver.id ? { ...d, available: next } : d)))
    try {
      await setDriverAvailability(driver.id, next)
      toast.info(`${driver.name} marked ${next ? 'available' : 'unavailable'}`)
    } catch (err) {
      drivers.setData((prev) => prev.map((d) => (d.id === driver.id ? { ...d, available: !next } : d)))
      toast.error('Could not update availability', { description: err.message })
    }
  }

  const columns = useMemo(
    () =>
      COLUMNS.map((col) => {
        switch (col.key) {
          case 'name':
            return {
              ...col,
              render: (row) => (
                <span className="row gap-10">
                  <Avatar name={row.name} size="sm" />
                  <span className="stack">
                    <span className="fw-600 c-strong">{row.name}</span>
                    <span className="t-xs c-muted">{row.language === 'hi' ? 'हिंदी' : 'English'}</span>
                  </span>
                </span>
              ),
            }
          case 'phone':
            return {
              ...col,
              render: (row) => (
                <a href={`tel:${row.phone.replace(/\s/g, '')}`} className="row gap-6 t-sm">
                  <Icon name="phone" size={13} />
                  {row.phone}
                </a>
              ),
            }
          case 'vehicleReg':
            return { ...col, render: (row) => <span className="mono t-sm">{row.vehicleReg}</span> }
          case 'currentStatus':
            return {
              ...col,
              render: (row) =>
                row.currentShipmentId ? (
                  <span className="stack">
                    <Link to={`/vendor/shipments/${row.currentShipmentId}`} className="mono t-sm fw-600">
                      {row.currentShipmentId}
                    </Link>
                    <span className="t-xs c-muted">{row.currentLane}</span>
                  </span>
                ) : (
                  <Badge tone="neutral" size="sm">
                    No active trip
                  </Badge>
                ),
            }
          case 'tripsCompleted':
            return { ...col, render: (row) => formatNumber(row.tripsCompleted) }
          case 'rating':
            return {
              ...col,
              render: (row) => (
                <span className="row gap-4" style={{ justifyContent: 'flex-end' }}>
                  <Icon name="star" size={12} className="c-warn" />
                  <span className="fw-600">{row.rating.toFixed(1)}</span>
                </span>
              ),
            }
          case 'licenceExpiry':
            return {
              ...col,
              render: (row) => {
                const days = Math.round((new Date(row.licenceExpiry).getTime() - now) / DAY)
                const soon = days < 90
                return (
                  <span className="row gap-6">
                    <span className={soon ? 'c-warn fw-500' : ''}>{formatDate(row.licenceExpiry)}</span>
                    {soon ? (
                      <Tooltip content={`Expires in ${days} days`}>
                        <Icon name="alert" size={13} className="c-warn" />
                      </Tooltip>
                    ) : null}
                  </span>
                )
              },
            }
          case 'available':
            return {
              ...col,
              render: (row) => (
                <Switch
                  id={`avail-${row.id}`}
                  checked={row.available}
                  onChange={(v) => onToggle(row, v)}
                  label={row.available ? 'Yes' : 'No'}
                />
              ),
            }
          default:
            return col
        }
      }),
    // onToggle closes over `drivers`, which changes on every load; recreating
    // the columns each render is cheaper than memoising around it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drivers.data, now],
  )

  return (
    <div className="page page-wide">
      <PageHeader
        title="Drivers"
        subtitle="Who is on the road, who is free to take a load, and whose licence needs renewing."
        actions={
          <Button
            variant="secondary"
            icon="download"
            onClick={() =>
              downloadCSV('drishya-drivers.csv', sorted, [
                { header: 'Driver', value: (r) => r.name },
                { header: 'Phone', value: (r) => r.phone },
                { header: 'Vehicle', value: (r) => r.vehicleReg },
                { header: 'Trips completed', value: (r) => r.tripsCompleted },
                { header: 'Rating', value: (r) => r.rating },
                { header: 'Licence expiry', value: (r) => new Date(r.licenceExpiry).toISOString().slice(0, 10) },
                { header: 'Available', value: (r) => (r.available ? 'Yes' : 'No') },
              ])
            }
            disabled={!sorted.length}
          >
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-4 mb-24">
        {drivers.isLoading ? (
          <SkeletonCards count={4} height={98} />
        ) : (
          <>
            <StatCard label="Drivers on the roster" value={stats.total} icon="users" />
            <StatCard label="Available now" value={stats.available} icon="checkCircle" accent="success" hint="Free to take a load" />
            <StatCard label="On a trip" value={stats.onTrip} icon="truck" accent="accent" hint="Currently carrying" />
            <StatCard label="Licences expiring" value={stats.expiring} icon="alert" accent={stats.expiring ? 'warn' : undefined} hint="Within 90 days" />
          </>
        )}
      </div>

      <TableShell>
        <TableToolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search a driver, number or vehicle…" className="grow" label="Search drivers" />
          <FilterSelect
            label="Availability"
            value={availability}
            onChange={setAvailability}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'available', label: 'Available only' },
              { value: 'unavailable', label: 'Unavailable only' },
            ]}
          />
        </TableToolbar>

        <Table
          columns={columns}
          rows={sorted}
          loading={drivers.isLoading}
          error={drivers.error}
          onRetry={drivers.reload}
          sort={table.sort}
          onSort={table.toggleSort}
          caption="Driver roster"
          emptyTitle="No drivers match"
          emptyDescription="Try clearing the availability filter or the search."
        />
      </TableShell>
    </div>
  )
}
