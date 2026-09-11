import { useMemo } from 'react'
import { useAppState, useAuth } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { ACTIVE_STATUSES } from '../../lib/constants.js'
import { formatNumber } from '../../lib/format.js'
import StatCard from '../../components/ui/StatCard.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { PageHeader } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import ShipmentMap from '../../components/map/ShipmentMap.jsx'
import { ShipmentRow } from '../../components/shipment/ShipmentParts.jsx'

export default function VendorDashboard() {
  useDocumentTitle('Dashboard')
  const state = useAppState()
  const { user } = useAuth()

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

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="page">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={
          (kpi.delayed
            ? `${kpi.delayed} of your ${kpi.active} active shipments are predicted to miss their slot.`
            : `All ${kpi.active} active shipments are tracking to their promised slot.`) +
          (kpi.deliveredToday ? ` ${kpi.deliveredToday} delivered today.` : '')
        }
        // One action, and it is the one this page exists to start. The live
        // indicator sits in the top bar on every screen already, and the map
        // panel below carries its own "Open control tower" link — three
        // buttons up here only made the reader choose between them.
        actions={
          <Button variant="primary" to="/vendor/shipments/new" icon="plus">
            New shipment
          </Button>
        }
      />

      {/* Three tiles, not five.

          "Active shipments", "In transit" and "Delayed" were three tiles
          answering one question, and a reader had to do arithmetic across
          them to learn anything. The two that came off are not lost: the
          in-transit count is the map panel's own subtitle, and the delivered
          count is in the summary line above. A number belongs beside the thing
          it describes before it belongs in a row of its own. */}
      <div className="grid grid-3 mb-24">
        {loading ? (
          <SkeletonCards count={3} height={98} />
        ) : (
          <>
            <StatCard label="Active shipments" value={kpi.active} icon="truck" hint={`${formatNumber(kpi.cartons)} cartons in play`} to="/vendor/shipments?status=active" />
            <StatCard label="At risk" value={kpi.delayed} icon="alert" accent={kpi.delayed ? 'danger' : undefined} hint="Predicted past the promised slot" to="/vendor/shipments?delayed=1" />
            <StatCard label="On-time rate" value={kpi.onTimePct} unit="%" icon="gauge" hint="Across all completed deliveries" to="/vendor/analytics" />
          </>
        )}
      </div>

      {/* Two panels, not four.

          The fortnight chart and the alert feed both came off this page, and
          neither was deleted: the chart is Analytics, which the tile above
          links to, and the feed is the bell in the top bar and /vendor/alerts,
          which carries the same rows with the filters this could not offer.
          What was removed is the duplication, not the information — and a
          dashboard of four competing panels answers no question at all,
          because the reader has to pick one before it can start. */}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)' }}>
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
            <ShipmentMap shipments={kpi.moving} height={392} showRoutes={false} cluster className="dm-map-flush" />
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
              <div style={{ maxHeight: 392, overflowY: 'auto' }}>
                {kpi.atRisk.slice(0, 8).map((s) => (
                  <ShipmentRow key={s.id} shipment={s} to={`/vendor/shipments/${s.id}`} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

    </div>
  )
}
