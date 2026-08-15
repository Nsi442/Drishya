import { useState, useMemo } from 'react'
import useAsync from '../../hooks/useAsync.js'
import useTableState from '../../hooks/useTableState.js'
import useDebounce from '../../hooks/useDebounce.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import useNow from '../../hooks/useNow.js'
import { useAuth, useAppState } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import { listVendors } from '../../services/fleetService.js'
import { listExceptions } from '../../services/alertService.js'
import { formatNumber, formatDate } from '../../lib/format.js'
import { sortRows } from '../../services/client.js'
import { downloadCSV } from '../../lib/csv.js'
import Table, { TableShell, TableToolbar } from '../../components/ui/Table.jsx'
import Drawer from '../../components/ui/Drawer.jsx'
import Button from '../../components/ui/Button.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import Badge, { StatusPill, DelayPill } from '../../components/ui/Badge.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import { PageHeader, DataPoint, Callout } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import { MiniBar, ChartFrame, VolumeBars } from '../../components/charts/Charts.jsx'

const COLUMNS = [
  { key: 'name', header: 'Vendor', sortable: true, width: 230 },
  { key: 'city', header: 'Origin', sortable: true, width: 130 },
  { key: 'shipments', header: 'Shipments', sortable: true, align: 'right', width: 110 },
  { key: 'onTimePct', header: 'On time', sortable: true, width: 170 },
  { key: 'docAccuracyPct', header: 'Document accuracy', sortable: true, width: 190 },
  { key: 'avgDetentionMin', header: 'Avg detention', sortable: true, align: 'right', width: 140 },
  { key: 'rejectionRatePct', header: 'Rejection rate', sortable: true, align: 'right', width: 140 },
]

function grade(vendor) {
  const score = vendor.onTimePct * 0.5 + vendor.docAccuracyPct * 0.35 + (100 - vendor.rejectionRatePct * 10) * 0.15
  if (score >= 88) return { label: 'A', tone: 'success' }
  if (score >= 78) return { label: 'B', tone: 'accent' }
  if (score >= 68) return { label: 'C', tone: 'warn' }
  return { label: 'D', tone: 'danger' }
}

export default function FCVendors() {
  useDocumentTitle('Vendor performance')
  const { user } = useAuth()
  const state = useAppState()
  const fcId = user?.orgId ?? 'fc-bhiwandi'

  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const [selected, setSelected] = useState(null)

  // The eight-week window is anchored to a clock held in state.
  const now = useNow(600000)

  const table = useTableState({ initialSort: { key: 'onTimePct', direction: 'desc' }, columns: COLUMNS })
  const vendors = useAsync(() => listVendors(), [])
  const exceptions = useAsync(() => listExceptions({ fcId }), [fcId])

  const shipments = selectShipments(state)

  // Only vendors that actually deliver into this centre belong on its scorecard.
  const scoped = useMemo(() => {
    const ids = new Set(shipments.filter((s) => s.fcId === fcId).map((s) => s.vendorId))
    return (vendors.data ?? []).filter((v) => ids.has(v.id))
  }, [vendors.data, shipments, fcId])

  const rows = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return scoped.filter((v) => !q || `${v.name} ${v.city}`.toLowerCase().includes(q))
  }, [scoped, debounced])

  const sorted = useMemo(() => sortRows(rows, table.sort.key, table.sort.direction), [rows, table.sort])

  const stats = useMemo(() => {
    if (!scoped.length) return { vendors: 0, onTime: 0, docs: 0, worst: null }
    return {
      vendors: scoped.length,
      onTime: Math.round(scoped.reduce((sum, v) => sum + v.onTimePct, 0) / scoped.length),
      docs: Math.round(scoped.reduce((sum, v) => sum + v.docAccuracyPct, 0) / scoped.length),
      worst: [...scoped].sort((a, b) => a.onTimePct - b.onTimePct)[0],
    }
  }, [scoped])

  const vendorDetail = useMemo(() => {
    if (!selected) return null
    const mine = shipments.filter((s) => s.vendorId === selected.id && s.fcId === fcId)
    const excs = (exceptions.data ?? []).filter((e) => e.vendorId === selected.id)

    // Last 8 weeks of volume for this vendor into this centre.
    const weeks = []
    for (let i = 7; i >= 0; i -= 1) {
      const end = now - i * 7 * 86400000
      const start = end - 7 * 86400000
      const inWeek = mine.filter((s) => s.promisedAt >= start && s.promisedAt < end)
      weeks.push({
        label: formatDate(start, { year: undefined }),
        shipments: inWeek.length,
        late: inWeek.filter((s) => s.delayMin > 15).length,
      })
    }

    return { shipments: mine, exceptions: excs, weeks, recent: [...mine].sort((a, b) => b.promisedAt - a.promisedAt).slice(0, 8) }
  }, [selected, shipments, fcId, exceptions.data, now])

  const columns = useMemo(
    () =>
      COLUMNS.map((col) => {
        switch (col.key) {
          case 'name':
            return {
              ...col,
              render: (r) => {
                const g = grade(r)
                return (
                  <span className="row gap-10">
                    <Avatar name={r.name} size="sm" tone={g.tone} initials={g.label} />
                    <span className="stack">
                      <span className="fw-600 c-strong">{r.name}</span>
                      <span className="t-xs c-muted">Grade {g.label}</span>
                    </span>
                  </span>
                )
              },
            }
          case 'onTimePct':
            return {
              ...col,
              render: (r) => (
                <MiniBar
                  value={r.onTimePct}
                  max={100}
                  label={`${r.onTimePct}%`}
                  tone={r.onTimePct >= 85 ? 'var(--chart-6)' : r.onTimePct >= 70 ? 'var(--chart-2)' : 'var(--chart-4)'}
                />
              ),
            }
          case 'docAccuracyPct':
            return {
              ...col,
              render: (r) => (
                <MiniBar
                  value={r.docAccuracyPct}
                  max={100}
                  label={`${r.docAccuracyPct}%`}
                  tone={r.docAccuracyPct >= 90 ? 'var(--chart-6)' : r.docAccuracyPct >= 80 ? 'var(--chart-2)' : 'var(--chart-4)'}
                />
              ),
            }
          case 'avgDetentionMin':
            return {
              ...col,
              render: (r) => <span className={r.avgDetentionMin > 60 ? 'c-danger fw-600' : ''}>{r.avgDetentionMin} min</span>,
            }
          case 'rejectionRatePct':
            return {
              ...col,
              render: (r) => (
                <Badge tone={r.rejectionRatePct >= 4 ? 'danger' : r.rejectionRatePct >= 2 ? 'warn' : 'success'} size="sm">
                  {r.rejectionRatePct}%
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
        title="Vendor performance"
        subtitle="How reliably each vendor in the cluster delivers into this centre."
        actions={
          <Button
            variant="secondary"
            icon="download"
            disabled={!sorted.length}
            onClick={() =>
              downloadCSV('drishya-vendor-scorecard.csv', sorted, [
                { header: 'Vendor', value: (r) => r.name },
                { header: 'Origin', value: (r) => r.city },
                { header: 'Shipments', value: (r) => r.shipments },
                { header: 'On-time %', value: (r) => r.onTimePct },
                { header: 'Document accuracy %', value: (r) => r.docAccuracyPct },
                { header: 'Avg detention (min)', value: (r) => r.avgDetentionMin },
                { header: 'Rejection rate %', value: (r) => r.rejectionRatePct },
                { header: 'Grade', value: (r) => grade(r).label },
              ])
            }
          >
            Export scorecard
          </Button>
        }
      />

      <div className="grid grid-4 mb-24">
        {vendors.isLoading ? (
          <SkeletonCards count={4} height={98} />
        ) : (
          <>
            <StatCard label="Vendors delivering here" value={stats.vendors} icon="users" />
            <StatCard label="Average on-time" value={stats.onTime} unit="%" icon="gauge" accent={stats.onTime >= 85 ? 'success' : 'warn'} />
            <StatCard label="Document accuracy" value={stats.docs} unit="%" icon="file" accent={stats.docs >= 90 ? 'success' : 'warn'} />
            <StatCard label="Needs attention" value={stats.worst ? `${stats.worst.onTimePct}%` : '—'} icon="alert" accent="danger" hint={stats.worst?.name} onClick={() => stats.worst && setSelected(stats.worst)} />
          </>
        )}
      </div>

      {stats.worst && stats.worst.onTimePct < 75 ? (
        <Callout tone="warn" title={`${stats.worst.name} is the weakest link into this centre`} className="mb-16">
          {stats.worst.onTimePct}% on time and {stats.worst.avgDetentionMin} minutes of average detention. Worth a
          conversation before it costs another bay.
        </Callout>
      ) : null}

      <TableShell>
        <TableToolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search a vendor or origin city…" className="grow" label="Search vendors" />
        </TableToolbar>

        <Table
          columns={columns}
          rows={sorted}
          loading={vendors.isLoading}
          error={vendors.error}
          onRetry={vendors.reload}
          sort={table.sort}
          onSort={table.toggleSort}
          onRowClick={setSelected}
          variant="compact"
          caption="Vendor scorecard"
          emptyTitle="No vendors match"
          emptyDescription="Try a different search term."
        />
      </TableShell>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name}
        subtitle={selected ? `${selected.city} · grade ${grade(selected).label}` : ''}
        size="lg"
      >
        {selected && vendorDetail ? (
          <div className="stack gap-16 pad">
            <div className="grid grid-2 gap-12">
              <DataPoint label="On time" value={`${selected.onTimePct}%`} />
              <DataPoint label="Document accuracy" value={`${selected.docAccuracyPct}%`} />
              <DataPoint label="Average detention" value={`${selected.avgDetentionMin} min`} />
              <DataPoint label="Rejection rate" value={`${selected.rejectionRatePct}%`} />
              <DataPoint label="Shipments into this centre" value={formatNumber(vendorDetail.shipments.length)} />
              <DataPoint label="Open exceptions" value={vendorDetail.exceptions.filter((e) => e.status !== 'resolved').length} />
            </div>

            <ChartFrame title="Volume over eight weeks" subtitle="Shipments into this centre, and how many were late" height={190} isEmpty={vendorDetail.weeks.every((w) => w.shipments === 0)}>
              <VolumeBars
                data={vendorDetail.weeks}
                height={190}
                stacked
                series={[
                  { key: 'shipments', label: 'On time' },
                  { key: 'late', label: 'Late' },
                ]}
              />
            </ChartFrame>

            <div>
              <p className="eyebrow mb-8">Recent consignments</p>
              <div className="table-scroll">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th scope="col"><span className="th-inner">Consignment</span></th>
                      <th scope="col"><span className="th-inner">Status</span></th>
                      <th scope="col"><span className="th-inner">Variance</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorDetail.recent.map((s) => (
                      <tr key={s.id}>
                        <td className="mono">{s.id}</td>
                        <td>
                          <StatusPill status={s.status} size="sm" />
                        </td>
                        <td>
                          <DelayPill minutes={s.delayMin} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {vendorDetail.exceptions.length ? (
              <div>
                <p className="eyebrow mb-8">Exceptions raised</p>
                <ul className="stack gap-8">
                  {vendorDetail.exceptions.slice(0, 5).map((exc) => (
                    <li key={exc.id} className="row gap-8 between list-row">
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="fw-600 c-strong t-md" style={{ display: 'block' }}>
                          {exc.title}
                        </span>
                        <span className="t-sm c-muted clamp-2">{exc.detail}</span>
                      </span>
                      <StatusPill status={exc.status} kind="exception" size="sm" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
