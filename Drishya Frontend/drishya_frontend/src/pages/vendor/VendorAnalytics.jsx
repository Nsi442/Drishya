import { useState, useMemo } from 'react'
import useAsync from '../../hooks/useAsync.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { getVendorAnalytics } from '../../services/analyticsService.js'
import { formatCurrency, formatNumber } from '../../lib/format.js'
import { downloadCSV } from '../../lib/csv.js'
import { DateRangePicker } from '../../components/ui/DatePicker.jsx'
import { toISODate } from '../../lib/dates.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import Button from '../../components/ui/Button.jsx'
import Table from '../../components/ui/Table.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { PageHeader } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import EtaAccuracy from '../../components/charts/EtaAccuracy.jsx'
import { ChartFrame, TrendLine, TrendArea, DonutChart, DonutLegend, VolumeBars, MiniBar } from '../../components/charts/Charts.jsx'

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISODate(d)
}

export default function VendorAnalytics() {
  useDocumentTitle('Analytics')

  const [range, setRange] = useState({ preset: '30', from: daysAgo(30), to: toISODate(new Date()) })
  const analytics = useAsync(() => getVendorAnalytics({ from: range.from, to: range.to }), [range.from, range.to])

  const data = analytics.data
  const totals = data?.totals

  const laneColumns = useMemo(
    () => [
      { key: 'lane', header: 'Lane', sortable: false, width: 210, render: (r) => <span className="fw-500 c-strong">{r.lane}</span> },
      { key: 'shipments', header: 'Shipments', align: 'right', width: 110, render: (r) => formatNumber(r.shipments) },
      {
        key: 'onTimePct',
        header: 'On time',
        width: 170,
        render: (r) => <MiniBar value={r.onTimePct} max={100} label={`${r.onTimePct}%`} tone={r.onTimePct >= 85 ? 'var(--chart-6)' : r.onTimePct >= 70 ? 'var(--chart-2)' : 'var(--chart-4)'} />,
      },
      { key: 'avgDelayMin', header: 'Avg delay', align: 'right', width: 110, render: (r) => (r.avgDelayMin ? `${r.avgDelayMin} min` : '—') },
      { key: 'distanceKm', header: 'Distance', align: 'right', width: 110, render: (r) => `${formatNumber(r.distanceKm)} km` },
      { key: 'avgCost', header: 'Avg cost', align: 'right', width: 120, render: (r) => formatCurrency(r.avgCost) },
    ],
    [],
  )

  const dwellColumns = useMemo(
    () => [
      { key: 'name', header: 'Fulfilment centre', width: 180, render: (r) => <span className="fw-500 c-strong">{r.name}</span> },
      { key: 'city', header: 'City', width: 130 },
      { key: 'shipments', header: 'Deliveries', align: 'right', width: 110 },
      {
        key: 'avgDwellMin',
        header: 'Average dwell',
        width: 190,
        render: (r) => (
          <MiniBar
            value={r.avgDwellMin}
            max={Math.max(60, ...(data?.dwell ?? []).map((d) => d.avgDwellMin))}
            label={r.avgDwellMin ? `${r.avgDwellMin} min` : '—'}
            tone={r.avgDwellMin > 90 ? 'var(--chart-4)' : r.avgDwellMin > 45 ? 'var(--chart-2)' : 'var(--chart-1)'}
          />
        ),
      },
    ],
    [data],
  )

  return (
    <div className="page page-wide">
      <PageHeader
        title="Analytics"
        subtitle="Delivery performance, where the time goes, and what each lane costs you."
        actions={
          <Button
            variant="secondary"
            icon="download"
            disabled={!data}
            onClick={() =>
              downloadCSV('drishya-lane-performance.csv', data.lanes, [
                { header: 'Lane', value: (r) => r.lane },
                { header: 'Shipments', value: (r) => r.shipments },
                { header: 'On-time %', value: (r) => r.onTimePct },
                { header: 'Avg delay (min)', value: (r) => r.avgDelayMin },
                { header: 'Distance (km)', value: (r) => r.distanceKm },
                { header: 'Avg cost (INR)', value: (r) => r.avgCost },
              ])
            }
          >
            Export lanes
          </Button>
        }
      >
        <div className="mt-12">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </PageHeader>

      <div className="grid grid-5 mb-24">
        {analytics.isLoading ? (
          <SkeletonCards count={5} height={98} />
        ) : totals ? (
          <>
            <StatCard label="Shipments in range" value={formatNumber(totals.shipments)} icon="truck" />
            <StatCard label="Delivered" value={formatNumber(totals.delivered)} icon="checkCircle" accent="success" />
            <StatCard label="On-time rate" value={totals.onTimePct} unit="%" icon="gauge" accent={totals.onTimePct >= 85 ? 'success' : 'warn'} />
            <StatCard label="Average delay" value={totals.avgDelayMin} unit=" min" icon="clock" hint="Across late shipments only" />
            <StatCard label="Cost per shipment" value={formatCurrency(totals.avgCost)} icon="chart" hint={`${formatNumber(totals.totalCartons)} cartons moved`} />
          </>
        ) : null}
      </div>

      {/* How wrong the ETA engine has actually been. Placed above the
          operational charts on purpose: a product whose central claim is
          "we can tell you when the vehicle will arrive" should lead with how
          often it was wrong, not bury it. Polls on its own timer. */}
      <div className="mb-24">
        <EtaAccuracy />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', marginBottom: 16 }}>
        <ChartFrame
          title="On-time delivery trend"
          subtitle="Share of deliveries received inside the promised window"
          loading={analytics.isLoading}
          isEmpty={data?.trend?.every((t) => t.onTimePct === null)}
          emptyText="No deliveries were completed in this range."
          height={264}
          table={
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col"><span className="th-inner">Day</span></th>
                  <th scope="col" className="col-num"><span className="th-inner">Shipments</span></th>
                  <th scope="col" className="col-num"><span className="th-inner">On time %</span></th>
                </tr>
              </thead>
              <tbody>
                {(data?.trend ?? []).map((t) => (
                  <tr key={t.date}>
                    <td>{t.label}</td>
                    <td className="col-num">{t.shipments}</td>
                    <td className="col-num">{t.onTimePct ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <TrendLine
            data={data?.trend ?? []}
            height={264}
            domain={[0, 100]}
            yFormatter={(v) => `${v}%`}
            tipFormatter={(v) => `${v}%`}
            series={[{ key: 'onTimePct', label: 'On-time deliveries' }]}
          />
        </ChartFrame>

        <ChartFrame
          title="Why shipments run late"
          subtitle="Delay reasons across the range"
          loading={analytics.isLoading}
          isEmpty={!data?.reasons?.length}
          emptyText="Nothing ran more than 15 minutes late in this range."
          height={264}
        >
          <div className="stack gap-12">
            <DonutChart data={data?.reasons ?? []} nameKey="reason" valueKey="count" height={168} centreLabel="late" />
            <DonutLegend data={(data?.reasons ?? []).slice(0, 5)} nameKey="reason" valueKey="count" />
          </div>
        </ChartFrame>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginBottom: 16 }}>
        <ChartFrame
          title="Cost per shipment"
          subtitle="Averaged across everything delivered that day"
          loading={analytics.isLoading}
          isEmpty={data?.trend?.every((t) => t.costPerShipment === null)}
          height={230}
        >
          <TrendArea
            data={data?.trend ?? []}
            height={230}
            yFormatter={(v) => `₹${Math.round(v / 1000)}k`}
            tipFormatter={(v) => formatCurrency(v)}
            series={[{ key: 'costPerShipment', label: 'Cost per shipment' }]}
          />
        </ChartFrame>

        <ChartFrame
          title="Shipments per day"
          subtitle="Volume delivered across the range"
          loading={analytics.isLoading}
          isEmpty={!data?.trend?.length}
          height={230}
        >
          <VolumeBars data={data?.trend ?? []} height={230} series={[{ key: 'shipments', label: 'Shipments' }]} />
        </ChartFrame>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <Card>
          <CardHeader
            title="Lane performance"
            subtitle="Sorted by volume — the lanes worth fixing first are at the top"
            actions={data ? <Badge tone="neutral">{data.lanes.length} lanes</Badge> : null}
          />
          <CardBody flush>
            <Table
              columns={laneColumns}
              rows={data?.lanes ?? []}
              getRowId={(r) => r.lane}
              loading={analytics.isLoading}
              error={analytics.error}
              onRetry={analytics.reload}
              variant="compact"
              caption="Performance by lane"
              emptyTitle="No lanes in this range"
              emptyDescription="Widen the date range to see lane performance."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Dwell time by centre" subtitle="Gate-in to gate-out, averaged" />
          <CardBody flush>
            <Table
              columns={dwellColumns}
              rows={data?.dwell ?? []}
              getRowId={(r) => r.fcId}
              loading={analytics.isLoading}
              variant="compact"
              caption="Average dwell time per fulfilment centre"
              emptyTitle="No completed deliveries"
              emptyDescription="Dwell time is measured once a vehicle has gated out."
            />
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
