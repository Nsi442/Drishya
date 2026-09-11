import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppState, useAuth } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import useNow from '../../hooks/useNow.js'
import { ACTIVE_STATUSES } from '../../lib/constants.js'
import { formatTime, formatNumber } from '../../lib/format.js'
import { refData as db } from '../../services/referenceData.js'
import StatCard from '../../components/ui/StatCard.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Badge, { StatusPill, DelayPill } from '../../components/ui/Badge.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { PageHeader } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import '../../components/schedule/schedule.css'
import useReferenceData from '../../hooks/useReferenceData.js'

const HOUR = 3600000

export default function FCDashboard() {
  useDocumentTitle('Inbound dashboard')
  const state = useAppState()
  const { user } = useAuth()

  const fcId = user?.orgId ?? 'fc-bhiwandi'
  const shipments = selectShipments(state)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  const refVersion = useReferenceData()
  // refVersion is not read in the callback and that is deliberate: it is the
  // signal that refData has filled, which is invisible to React otherwise.
  // See hooks/useReferenceData.js. Removing it reinstates an empty snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const docks = useMemo(() => db.docks.filter((d) => d.fcId === fcId), [fcId, refVersion])

  // Detention clocks and the "next 4 hours" count both advance on their own.
  const now = useNow(30000)

  const kpi = useMemo(() => {
    const mine = shipments.filter((s) => s.fcId === fcId && s.status !== 'cancelled')
    const todayEnd = new Date(now).setHours(23, 59, 59, 999)
    const active = mine.filter((s) => ACTIVE_STATUSES.includes(s.status))
    const occupied = new Set(mine.filter((s) => s.status === 'at_dock' && s.dockId).map((s) => s.dockId))

    return {
      inboundToday: mine.filter((s) => s.predictedAt <= todayEnd && s.status !== 'delivered').length,
      next4h: active.filter((s) => s.predictedAt > now && s.predictedAt <= now + 4 * HOUR).length,
      delayed: active.filter((s) => s.delayMin > 15).length,
      atGate: mine.filter((s) => s.status === 'at_gate').length,
      unloading: mine.filter((s) => s.status === 'at_dock').length,
      occupied,
      cartons: active.reduce((sum, s) => sum + s.cartons, 0),
      arriving: active
        .filter((s) => s.predictedAt > now - HOUR)
        .sort((a, b) => a.predictedAt - b.predictedAt)
        .slice(0, 8),
    }
  }, [shipments, fcId, now])

  const fc = db.fulfilmentCentres.find((f) => f.id === fcId)

  return (
    <div className="page page-wide">
      <PageHeader
        title={fc?.name ?? 'Fulfilment centre'}
        subtitle={
          kpi.delayed
            ? `${kpi.delayed} inbound vehicles are predicted to miss their slot today.`
            : 'Every inbound vehicle is currently tracking to its booked slot.'
        }
        // The board is where a receiving shift actually starts. The live
        // indicator is in the top bar on every screen, and the scheduler has
        // its own link on the dock panel below.
        actions={
          <Button variant="primary" to="/fc/inbound" icon="truck">
            Arrival board
          </Button>
        }
      />

      {/* Three tiles, not five.

          "Delayed" repeated the summary line directly above it word for word,
          and "Next 4 hours" is the question the Arriving next panel is, so it
          now says so in its own subtitle. What is left is the three numbers a
          receiving desk acts on: how much is coming, how much is stuck
          outside, and whether there is anywhere to put it. */}
      <div className="grid grid-3 mb-24">
        {loading ? (
          <SkeletonCards count={3} height={98} />
        ) : (
          <>
            <StatCard label="Inbound today" value={kpi.inboundToday} icon="truck" hint={`${formatNumber(kpi.cartons)} cartons expected`} to="/fc/inbound" />
            <StatCard label="At the gate" value={kpi.atGate} icon="pin" accent={kpi.atGate ? 'warn' : undefined} hint="Waiting for a dock" to="/fc/yard" />
            <StatCard label="Docks occupied" value={`${kpi.occupied.size}/${docks.length}`} icon="dock" hint={`${kpi.unloading} unloading now`} to="/fc/docks" />
          </>
        )}
      </div>

      <Card className="mb-16">
        <CardHeader
          title="Dock occupancy"
          subtitle="Live — what is on each bay right now"
          actions={
            <Button variant="ghost" size="sm" to="/fc/docks" iconRight="arrowRight">
              Scheduler
            </Button>
          }
        />
        <CardBody>
          <div className="row gap-8 wrap">
            {docks.map((dock) => {
              const occupant = shipments.find((s) => s.dockId === dock.id && s.status === 'at_dock')
              const waiting = shipments.find((s) => s.dockId === dock.id && s.status === 'at_gate')
              // "Vehicle waiting" did not fit a 148px bay card: the name wrapped
              // to two lines and the badge ran out past the card's edge, under
              // the next one along. The bay already says what it is about.
              const stateLabel = occupant ? 'Unloading' : waiting ? 'Waiting' : 'Free'
              const tone = occupant ? 'accent' : waiting ? 'warn' : 'neutral'

              return (
                <div
                  key={dock.id}
                  className="card"
                  style={{
                    padding: '10px 12px',
                    minWidth: 168,
                    flex: '1 1 168px',
                    borderLeft: `3px solid var(--${tone === 'neutral' ? 'border-strong' : tone})`,
                  }}
                >
                  <div className="row between gap-6" style={{ minWidth: 0 }}>
                    <span className="fw-600 c-strong t-md truncate">{dock.name}</span>
                    <Badge tone={tone} size="sm" style={{ flexShrink: 0 }}>
                      <span className="status-dot" aria-hidden="true" />
                      {stateLabel}
                    </Badge>
                  </div>
                  <p className="t-xs c-muted mt-4 truncate">
                    {occupant ? occupant.vendorName : waiting ? `${waiting.vehicleReg} at gate` : `${dock.type}, up to ${dock.maxVehicleLengthFt} ft`}
                  </p>
                </div>
              )
            })}
          </div>
        </CardBody>
      </Card>

      {/* Two panels, not four.

          The exception feed and the on-site list were the whole of
          /fc/exceptions and /fc/yard rendered small, and both of those are one
          click away in the rail — the exceptions link carries its open count
          on the badge, so nothing that needed attention lost its way of
          asking for it. What is left is the two things this screen is for:
          what is coming, and whether there is a bay for it. */}
    <Card>
        <CardHeader
          title="Arriving next"
          subtitle={`Sorted by live ETA — ${kpi.next4h} due in the next four hours`}
          actions={
            <Button variant="ghost" size="sm" to="/fc/inbound" iconRight="arrowRight">
              Full board
            </Button>
          }
        />
        <CardBody flush>
          {loading ? (
            <div className="card-body stack gap-12">
              <SkeletonCards count={5} height={48} />
            </div>
          ) : kpi.arriving.length === 0 ? (
            <EmptyState icon="truck" title="Nothing inbound" description="No vehicles are currently on their way to this centre." />
          ) : (
            <div className="table-scroll">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th scope="col"><span className="th-inner">Vendor</span></th>
                    <th scope="col"><span className="th-inner">Consignment</span></th>
                    <th scope="col"><span className="th-inner">Vehicle</span></th>
                    <th scope="col"><span className="th-inner">Slot</span></th>
                    <th scope="col"><span className="th-inner">Live ETA</span></th>
                    <th scope="col"><span className="th-inner">Status</span></th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.arriving.map((s) => (
                    <tr key={s.id} className={state.shipments.flashed.includes(s.id) ? 'flash' : undefined}>
                      <td className="truncate" style={{ maxWidth: 170 }}>{s.vendorName}</td>
                      <td>
                        <Link to={`/fc/inbound/${s.id}`} className="mono fw-600" style={{ color: 'var(--text-strong)' }}>
                          {s.id}
                        </Link>
                      </td>
                      <td className="mono t-sm">{s.vehicleReg}</td>
                      <td>{formatTime(s.slotStart)}</td>
                      <td>
                        <span className="row gap-6">
                          {formatTime(s.predictedAt)}
                          <DelayPill minutes={s.delayMin} size="sm" />
                        </span>
                      </td>
                      <td>
                        <StatusPill status={s.status} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

    </div>
  )
}
