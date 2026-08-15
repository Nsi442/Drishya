import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppState, useAuth, useAlerts } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useAsync from '../../hooks/useAsync.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { getWeeklyDeliveries } from '../../services/analyticsService.js'
import { ACTIVE_STATUSES } from '../../lib/constants.js'
import { formatRelative, formatTime, formatNumber } from '../../lib/format.js'
import StatCard from '../../components/ui/StatCard.jsx'
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { PageHeader, LiveIndicator } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import { ChartFrame, VolumeBars } from '../../components/charts/Charts.jsx'
import ShipmentMap from '../../components/map/ShipmentMap.jsx'
import { ShipmentRow } from '../../components/shipment/ShipmentParts.jsx'

export default function VendorDashboard() {
  useDocumentTitle('Dashboard')
  const state = useAppState()
  const { user } = useAuth()
  const { items: alerts, unread } = useAlerts()

  const shipments = selectShipments(state)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  // Everything on this page is derived from the live store rather than fetched
  // separately, so the KPI row and the map can never disagree.
  const kpi = useMemo(() => {
    const active = shipments.filter((s) => ACTIVE_STATUSES.includes(s.status))
    const delivered = shipments.filter((s) => s.status === 'delivered')
    const todayStart = new Date().setHours(0, 0, 0, 0)
    const onTime = delivered.filter((s) => s.delayMin <= 15)

    return {
      active: active.length,
      inTransit: shipments.filter((s) => s.status === 'in_transit').length,
      delayed: active.filter((s) => s.delayMin > 15).length,
      deliveredToday: delivered.filter((s) => s.deliveredAt >= todayStart).length,
      onTimePct: delivered.length ? Math.round((onTime.length / delivered.length) * 100) : 0,
      atRisk: active.filter((s) => s.delayMin > 15).sort((a, b) => b.delayMin - a.delayMin),
      moving: shipments.filter((s) => ACTIVE_STATUSES.includes(s.status) && s.position),
      cartons: active.reduce((sum, s) => sum + s.cartons, 0),
    }
  }, [shipments])

  const weekly = useAsync(() => getWeeklyDeliveries({}), [])

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="page">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={
          kpi.delayed
            ? `${kpi.delayed} of your ${kpi.active} active shipments are predicted to miss their slot.`
            : `All ${kpi.active} active shipments are tracking to their promised slot.`
        }
        actions={
          <>
            <LiveIndicator paused={state.ui.livePaused || !state.ui.liveEnabled} />
            <Button variant="secondary" to="/vendor/live-map" icon="map">
              Control tower
            </Button>
            <Button variant="primary" to="/vendor/shipments/new" icon="plus">
              New shipment
            </Button>
          </>
        }
      />

      <div className="grid grid-5 mb-24">
        {loading ? (
          <SkeletonCards count={5} height={98} />
        ) : (
          <>
            <StatCard label="Active shipments" value={kpi.active} icon="truck" hint={`${formatNumber(kpi.cartons)} cartons in play`} to="/vendor/shipments?status=active" />
            <StatCard label="In transit" value={kpi.inTransit} icon="navigation" hint="Moving right now" accent="accent" to="/vendor/shipments?status=in_transit" />
            <StatCard label="Delayed" value={kpi.delayed} icon="alert" accent={kpi.delayed ? 'danger' : undefined} hint="Predicted past the promised slot" to="/vendor/shipments?delayed=1" />
            <StatCard label="Delivered today" value={kpi.deliveredToday} icon="checkCircle" accent="success" hint="Signed for at the dock" />
            <StatCard label="On-time rate" value={kpi.onTimePct} unit="%" icon="gauge" hint="Across all completed deliveries" to="/vendor/analytics" />
          </>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', marginBottom: 16 }}>
        <Card>
          <CardHeader
            title="Where everything is"
            subtitle={`${kpi.moving.length} shipments currently on the road`}
            actions={
              <Button variant="ghost" size="sm" to="/vendor/live-map" iconRight="arrowRight">
                Open control tower
              </Button>
            }
          />
          <CardBody flush>
            <ShipmentMap shipments={kpi.moving} height={352} showRoutes={false} cluster className="dm-map-flush" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="At risk"
            subtitle={kpi.atRisk.length ? 'Sorted by how far behind they are' : undefined}
            actions={
              kpi.atRisk.length > 6 ? (
                <Button variant="ghost" size="sm" to="/vendor/shipments?delayed=1">
                  See all {kpi.atRisk.length}
                </Button>
              ) : null
            }
          />
          <CardBody flush>
            {loading ? (
              <div className="card-body stack gap-12">
                <SkeletonCards count={4} height={52} />
              </div>
            ) : kpi.atRisk.length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title="Nothing at risk"
                description="Every active shipment is predicted to arrive inside its promised window."
              />
            ) : (
              <div style={{ maxHeight: 352, overflowY: 'auto' }}>
                {kpi.atRisk.slice(0, 8).map((s) => (
                  <ShipmentRow key={s.id} shipment={s} to={`/vendor/shipments/${s.id}`} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)' }}>
        <ChartFrame
          title="Deliveries over the last fortnight"
          subtitle="On-time against late, by the day the consignment was received"
          loading={weekly.isLoading}
          isEmpty={weekly.isReady && weekly.data.every((d) => d.delivered === 0)}
          height={248}
          table={
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col"><span className="th-inner">Day</span></th>
                  <th scope="col" className="col-num"><span className="th-inner">On time</span></th>
                  <th scope="col" className="col-num"><span className="th-inner">Late</span></th>
                  <th scope="col" className="col-num"><span className="th-inner">Total</span></th>
                </tr>
              </thead>
              <tbody>
                {(weekly.data ?? []).map((d) => (
                  <tr key={d.date}>
                    <td>{d.label}</td>
                    <td className="col-num">{d.onTime}</td>
                    <td className="col-num">{d.late}</td>
                    <td className="col-num">{d.delivered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <VolumeBars
            data={weekly.data ?? []}
            stacked
            height={248}
            series={[
              { key: 'onTime', label: 'On time' },
              { key: 'late', label: 'Late' },
            ]}
          />
        </ChartFrame>

        <Card>
          <CardHeader
            title="Alert feed"
            subtitle={unread ? `${unread} unread` : 'Everything acknowledged'}
            actions={
              <Button variant="ghost" size="sm" to="/vendor/alerts">
                All alerts
              </Button>
            }
          />
          <CardBody flush>
            {alerts.length === 0 ? (
              <EmptyState icon="bell" title="No alerts" description="Delay predictions and document problems appear here as they are detected." />
            ) : (
              <ul style={{ maxHeight: 300, overflowY: 'auto' }}>
                {alerts.slice(0, 10).map((alert) => (
                  <li key={alert.id}>
                    <Link
                      to={alert.shipmentId ? `/vendor/shipments/${alert.shipmentId}` : '/vendor/alerts'}
                      className={`notif-item ${alert.read ? '' : 'is-unread'}`}
                    >
                      <span className={`notif-icon is-${alert.severity}`}>
                        <Icon name={alert.severity === 'critical' ? 'alertCircle' : alert.severity === 'warning' ? 'alert' : 'info'} size={14} />
                      </span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="notif-title">{alert.title}</span>
                        <span className="notif-message clamp-2">{alert.message}</span>
                        <span className="notif-meta">
                          {alert.shipmentId ? <span className="mono">{alert.shipmentId}</span> : null}
                          <time dateTime={new Date(alert.at).toISOString()}>{formatRelative(alert.at)}</time>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
          <CardFooter>
            <span className="t-sm c-muted">Next promised slot</span>
            <span className="t-sm fw-600 c-strong">
              {kpi.moving.length
                ? formatTime(Math.min(...kpi.moving.map((s) => s.promisedAt)))
                : '—'}
            </span>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
