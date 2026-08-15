import { useMemo } from 'react'
import useAsync from '../../hooks/useAsync.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { useAuth } from '../../store/hooks.js'
import { getFCAnalytics } from '../../services/analyticsService.js'
import { formatNumber } from '../../lib/format.js'
import { downloadCSV } from '../../lib/csv.js'
import Button from '../../components/ui/Button.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import { PageHeader } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import { ChartFrame, VolumeBars, TrendLine, DonutChart, DonutLegend, Heatmap } from '../../components/charts/Charts.jsx'

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6)
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function FCAnalytics() {
  useDocumentTitle('Analytics')
  const { user } = useAuth()
  const fcId = user?.orgId ?? 'fc-bhiwandi'

  const analytics = useAsync(() => getFCAnalytics(fcId), [fcId])
  const data = analytics.data

  const totals = useMemo(() => {
    if (!data) return null
    const volume = data.volume ?? []
    const dwell = (data.dwellByDay ?? []).filter((d) => d.avgDwellMin !== null)
    const peak = data.heatmap?.length ? data.heatmap.reduce((a, b) => (b.value > a.value ? b : a)) : null

    return {
      shipments: volume.reduce((sum, v) => sum + v.shipments, 0),
      cartons: volume.reduce((sum, v) => sum + v.cartons, 0),
      avgDwell: dwell.length ? Math.round(dwell.reduce((sum, d) => sum + d.avgDwellMin, 0) / dwell.length) : 0,
      exceptions: (data.exceptionBreakdown ?? []).reduce((sum, e) => sum + e.value, 0),
      peak,
    }
  }, [data])

  return (
    <div className="page page-wide">
      <PageHeader
        title="Analytics"
        subtitle="Inbound volume, when the docks are actually busy, and what keeps going wrong."
        actions={
          <Button
            variant="secondary"
            icon="download"
            disabled={!data}
            onClick={() =>
              downloadCSV('drishya-fc-volume.csv', data.volume, [
                { header: 'Date', value: (r) => new Date(r.date).toISOString().slice(0, 10) },
                { header: 'Shipments', value: (r) => r.shipments },
                { header: 'Cartons', value: (r) => r.cartons },
              ])
            }
          >
            Export volume
          </Button>
        }
      />

      <div className="grid grid-4 mb-24">
        {analytics.isLoading ? (
          <SkeletonCards count={4} height={98} />
        ) : totals ? (
          <>
            <StatCard label="Inbound (14 days)" value={formatNumber(totals.shipments)} icon="truck" hint={`${formatNumber(totals.cartons)} cartons`} />
            <StatCard label="Average dwell" value={totals.avgDwell} unit=" min" icon="clock" accent={totals.avgDwell > 90 ? 'danger' : totals.avgDwell > 60 ? 'warn' : 'success'} hint="Gate-in to gate-out" />
            <StatCard label="Exceptions raised" value={formatNumber(totals.exceptions)} icon="alert" accent={totals.exceptions > 20 ? 'warn' : undefined} />
            <StatCard
              label="Busiest hour"
              value={totals.peak ? `${String(totals.peak.hour).padStart(2, '0')}:00` : '—'}
              icon="gauge"
              hint={totals.peak ? `${totals.peak.day} · ${totals.peak.value} bookings` : undefined}
            />
          </>
        ) : null}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', marginBottom: 16 }}>
        <ChartFrame
          title="Inbound volume"
          subtitle="Consignments arriving each day"
          loading={analytics.isLoading}
          isEmpty={data?.volume?.every((v) => v.shipments === 0)}
          height={252}
          table={
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col"><span className="th-inner">Day</span></th>
                  <th scope="col" className="col-num"><span className="th-inner">Shipments</span></th>
                  <th scope="col" className="col-num"><span className="th-inner">Cartons</span></th>
                </tr>
              </thead>
              <tbody>
                {(data?.volume ?? []).map((v) => (
                  <tr key={v.date}>
                    <td>{v.label}</td>
                    <td className="col-num">{v.shipments}</td>
                    <td className="col-num">{formatNumber(v.cartons)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <VolumeBars data={data?.volume ?? []} height={252} series={[{ key: 'shipments', label: 'Consignments' }]} />
        </ChartFrame>

        <ChartFrame
          title="Exception categories"
          subtitle="What goes wrong at receiving"
          loading={analytics.isLoading}
          isEmpty={!data?.exceptionBreakdown?.length}
          emptyText="No exceptions have been raised at this centre."
          height={252}
        >
          <div className="stack gap-12">
            <DonutChart data={data?.exceptionBreakdown ?? []} height={160} centreLabel="raised" />
            <DonutLegend data={data?.exceptionBreakdown ?? []} />
          </div>
        </ChartFrame>
      </div>

      <Card className="mb-16">
        <CardHeader
          title="Dock utilisation by hour"
          subtitle="Bookings per weekday and hour — darker is busier"
        />
        <CardBody>
          {analytics.isLoading ? (
            <SkeletonCards count={1} height={220} />
          ) : (
            <Heatmap
              data={data?.heatmap ?? []}
              rows={DAYS}
              columns={HOURS}
              rowKey="day"
              colKey="hour"
              formatColumn={(h) => String(h).padStart(2, '0')}
              caption="Dock bookings by weekday and hour"
            />
          )}
        </CardBody>
      </Card>

      <ChartFrame
        title="Average dwell time"
        subtitle="How long a vehicle spends on site, gate-in to gate-out"
        loading={analytics.isLoading}
        isEmpty={data?.dwellByDay?.every((d) => d.avgDwellMin === null)}
        emptyText="No vehicles have completed a full gate-in to gate-out cycle yet."
        height={240}
        table={
          <table className="table table-compact">
            <thead>
              <tr>
                <th scope="col"><span className="th-inner">Day</span></th>
                <th scope="col" className="col-num"><span className="th-inner">Avg dwell (min)</span></th>
              </tr>
            </thead>
            <tbody>
              {(data?.dwellByDay ?? []).map((d) => (
                <tr key={d.date}>
                  <td>{d.label}</td>
                  <td className="col-num">{d.avgDwellMin ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <TrendLine
          data={data?.dwellByDay ?? []}
          height={240}
          yFormatter={(v) => `${v}m`}
          tipFormatter={(v) => `${v} minutes`}
          series={[{ key: 'avgDwellMin', label: 'Average dwell time' }]}
        />
      </ChartFrame>
    </div>
  )
}
