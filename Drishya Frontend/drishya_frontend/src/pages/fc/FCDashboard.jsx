import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppState, useAuth } from '../../store/hooks.js'
import { selectShipments } from '../../store/reducer.js'
import useAsync from '../../hooks/useAsync.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import useNow from '../../hooks/useNow.js'
import { listExceptions } from '../../services/alertService.js'
import { ACTIVE_STATUSES, DETENTION_AMBER_MIN, DETENTION_RED_MIN } from '../../lib/constants.js'
import { formatTime, formatRelative, formatNumber } from '../../lib/format.js'
import { refData as db } from '../../services/referenceData.js'
import StatCard from '../../components/ui/StatCard.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Badge, { StatusPill, DelayPill } from '../../components/ui/Badge.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { PageHeader, LiveIndicator, Progress } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'
import '../../components/schedule/schedule.css'

const HOUR = 3600000

export default function FCDashboard() {
  useDocumentTitle('Inbound dashboard')
  const state = useAppState()
  const { user } = useAuth()

  const fcId = user?.orgId ?? 'fc-bhiwandi'
  const shipments = selectShipments(state)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  const exceptions = useAsync(() => listExceptions({ fcId, status: 'open' }), [fcId])

  const docks = useMemo(() => db.docks.filter((d) => d.fcId === fcId), [fcId])

  // Detention clocks and the "next 4 hours" count both advance on their own.
  const now = useNow(30000)

  const kpi = useMemo(() => {
    const mine = shipments.filter((s) => s.fcId === fcId && s.status !== 'cancelled')
    const todayEnd = new Date(now).setHours(23, 59, 59, 999)
    const active = mine.filter((s) => ACTIVE_STATUSES.includes(s.status))
    const occupied = new Set(mine.filter((s) => s.status === 'unloading' && s.dockId).map((s) => s.dockId))

    return {
      inboundToday: mine.filter((s) => s.predictedAt <= todayEnd && s.status !== 'delivered').length,
      next4h: active.filter((s) => s.predictedAt > now && s.predictedAt <= now + 4 * HOUR).length,
      delayed: active.filter((s) => s.delayMin > 15).length,
      atGate: mine.filter((s) => s.status === 'at_gate').length,
      unloading: mine.filter((s) => s.status === 'unloading').length,
      occupied,
      cartons: active.reduce((sum, s) => sum + s.cartons, 0),
      arriving: active
        .filter((s) => s.predictedAt > now - HOUR)
        .sort((a, b) => a.predictedAt - b.predictedAt)
        .slice(0, 8),
      onSite: mine
        .filter((s) => s.gateInAt && !s.gateOutAt)
        .map((s) => ({ ...s, minutesOnSite: Math.round((now - s.gateInAt) / 60000) }))
        .sort((a, b) => b.minutesOnSite - a.minutesOnSite),
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
        actions={
          <>
            <LiveIndicator paused={state.ui.livePaused || !state.ui.liveEnabled} />
            <Button variant="secondary" to="/fc/docks" icon="dock">
              Dock scheduler
            </Button>
            <Button variant="primary" to="/fc/inbound" icon="truck">
              Arrival board
            </Button>
          </>
        }
      />

      <div className="grid grid-5 mb-24">
        {loading ? (
          <SkeletonCards count={5} height={98} />
        ) : (
          <>
            <StatCard label="Inbound today" value={kpi.inboundToday} icon="truck" hint={`${formatNumber(kpi.cartons)} cartons expected`} to="/fc/inbound" />
            <StatCard label="Next 4 hours" value={kpi.next4h} icon="clock" accent="accent" hint="Arriving soon" to="/fc/inbound?window=4h" />
            <StatCard label="Delayed" value={kpi.delayed} icon="alert" accent={kpi.delayed ? 'danger' : undefined} hint="Slot at risk" />
            <StatCard label="At the gate" value={kpi.atGate} icon="pin" accent="warn" hint="Waiting for a dock" to="/fc/yard" />
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
              const occupant = shipments.find((s) => s.dockId === dock.id && s.status === 'unloading')
              const waiting = shipments.find((s) => s.dockId === dock.id && s.status === 'at_gate')
              const stateLabel = occupant ? 'Unloading' : waiting ? 'Vehicle waiting' : 'Free'
              const tone = occupant ? 'accent' : waiting ? 'warn' : 'neutral'

              return (
                <div
                  key={dock.id}
                  className="card"
                  style={{
                    padding: '10px 12px',
                    minWidth: 148,
                    flex: '1 1 148px',
                    borderLeft: `3px solid var(--${tone === 'neutral' ? 'border-strong' : tone})`,
                  }}
                >
                  <div className="row between gap-6">
                    <span className="fw-600 c-strong t-md">{dock.name}</span>
                    <Badge tone={tone} size="sm">
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

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <Card>
          <CardHeader
            title="Arriving next"
            subtitle="Sorted by live ETA"
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

        <div className="stack gap-16">
          <Card>
            <CardHeader
              title="Exception feed"
              subtitle={exceptions.data ? `${exceptions.data.length} open` : undefined}
              actions={
                <Button variant="ghost" size="sm" to="/fc/exceptions">
                  All
                </Button>
              }
            />
            <CardBody flush>
              {exceptions.isLoading ? (
                <div className="card-body stack gap-12">
                  <SkeletonCards count={4} height={54} />
                </div>
              ) : !exceptions.data?.length ? (
                <EmptyState icon="checkCircle" title="No open exceptions" description="Nothing at receiving needs attention right now." />
              ) : (
                <ul style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {exceptions.data.slice(0, 8).map((exc) => (
                    <li key={exc.id}>
                      <Link to="/fc/exceptions" className={`notif-item ${exc.status === 'open' ? 'is-unread' : ''}`}>
                        <span className={`notif-icon is-${exc.severity === 'critical' ? 'critical' : 'warning'}`}>
                          <Icon name={exc.severity === 'critical' ? 'alertCircle' : 'alert'} size={14} />
                        </span>
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="notif-title">{exc.title}</span>
                          <span className="notif-message clamp-2">{exc.detail}</span>
                          <span className="notif-meta">
                            <span className="mono">{exc.shipmentId}</span>
                            <time dateTime={new Date(exc.raisedAt).toISOString()}>{formatRelative(exc.raisedAt)}</time>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="On site now"
              subtitle="Detention clock running"
              actions={
                <Button variant="ghost" size="sm" to="/fc/yard">
                  Yard
                </Button>
              }
            />
            <CardBody flush>
              {kpi.onSite.length === 0 ? (
                <EmptyState icon="pin" title="Yard is clear" description="No vehicles are currently gated in." />
              ) : (
                <ul>
                  {kpi.onSite.slice(0, 5).map((v) => {
                    const tone = v.minutesOnSite >= DETENTION_RED_MIN ? 'danger' : v.minutesOnSite >= DETENTION_AMBER_MIN ? 'warn' : 'success'
                    return (
                      <li key={v.id} className="list-row-inset">
                        <div className="row between gap-8">
                          <span className="mono fw-600 c-strong t-sm">{v.vehicleReg}</span>
                          <Badge tone={tone} size="sm">
                            <span className="status-dot" aria-hidden="true" />
                            {v.minutesOnSite} min
                          </Badge>
                        </div>
                        <p className="t-xs c-muted mt-4 truncate">{v.vendorName}</p>
                        <div className="mt-4">
                          <Progress value={v.minutesOnSite} max={DETENTION_RED_MIN * 1.4} tone={tone} size="sm" label={`${v.vehicleReg} time on site`} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
