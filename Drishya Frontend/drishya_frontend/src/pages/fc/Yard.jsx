import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAppState, useDispatch, useAuth, useToast } from '../../store/hooks.js'
import { ACTIONS } from '../../store/reducer.js'
import useAsync from '../../hooks/useAsync.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import useNow from '../../hooks/useNow.js'
import { getYard, gateOut, gateIn } from '../../services/fcService.js'
import { DETENTION_AMBER_MIN, DETENTION_RED_MIN } from '../../lib/constants.js'
import { formatTime, formatDateTime, formatNumber } from '../../lib/format.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Table from '../../components/ui/Table.jsx'
import Button from '../../components/ui/Button.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import Badge, { StatusPill } from '../../components/ui/Badge.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { PageHeader, Progress, LiveIndicator, Callout } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'

export default function Yard() {
  useDocumentTitle('Yard & gate')
  const state = useAppState()
  const dispatch = useDispatch()
  const { user } = useAuth()
  const toast = useToast()
  const fcId = user?.orgId ?? 'fc-bhiwandi'

  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(null)

  // The detention clock has to advance on screen without a reload.
  const now = useNow(30000)

  const yard = useAsync(() => getYard(fcId), [fcId, state.shipments.lastTick])

  const onSite = useMemo(() => {
    const rows = yard.data?.onSite ?? []
    const q = search.trim().toLowerCase()
    return rows
      .map((v) => {
        const minutesOnSite = Math.round((now - v.gateInAt) / 60000)
        return {
          ...v,
          minutesOnSite,
          detention: minutesOnSite >= DETENTION_RED_MIN ? 'red' : minutesOnSite >= DETENTION_AMBER_MIN ? 'amber' : 'ok',
        }
      })
      .filter((v) => !q || `${v.vehicleReg} ${v.vendorName} ${v.driverName} ${v.shipmentId}`.toLowerCase().includes(q))
      .sort((a, b) => b.minutesOnSite - a.minutesOnSite)
  }, [yard.data, search, now])

  const stats = useMemo(
    () => ({
      onSite: onSite.length,
      amber: onSite.filter((v) => v.detention === 'amber').length,
      red: onSite.filter((v) => v.detention === 'red').length,
      cartons: onSite.reduce((sum, v) => sum + v.cartons, 0),
    }),
    [onSite],
  )

  // Stable identity so the column definitions below can depend on it honestly.
  const doGateOut = useCallback(
    async (row) => {
      setBusy(row.shipmentId)
      try {
        const next = await gateOut(row.shipmentId)
        dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: next })
        toast.success(`${row.vehicleReg} gated out`, { description: `On site for ${row.minutesOnSite} minutes.` })
        yard.reload()
      } catch (err) {
        toast.error('Could not record gate-out', { description: err.message })
      } finally {
        setBusy(null)
      }
    },
    [dispatch, toast, yard],
  )

  const doGateIn = async (shipmentId, vehicleReg) => {
    setBusy(shipmentId)
    try {
      const next = await gateIn(shipmentId)
      dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: next })
      toast.success(`${vehicleReg} gated in`)
      yard.reload()
    } catch (err) {
      toast.error('Could not record gate-in', { description: err.message })
    } finally {
      setBusy(null)
    }
  }

  const waiting = useMemo(
    () =>
      state.shipments.ids
        .map((id) => state.shipments.byId[id])
        .filter((s) => s && s.fcId === fcId && s.status === 'in_transit' && s.remainingKm < 25)
        .sort((a, b) => a.predictedAt - b.predictedAt),
    [state.shipments, fcId],
  )

  const yardColumns = useMemo(
    () => [
      {
        key: 'vehicleReg',
        header: 'Vehicle',
        width: 150,
        render: (r) => (
          <span className="stack">
            <span className="mono fw-700 c-strong">{r.vehicleReg}</span>
            <span className="t-xs c-muted">{r.vehicleType}</span>
          </span>
        ),
      },
      { key: 'vendorName', header: 'Vendor', width: 190, render: (r) => <span className="truncate">{r.vendorName}</span> },
      {
        key: 'shipmentId',
        header: 'Consignment',
        width: 140,
        render: (r) => (
          <Link to={`/fc/inbound/${r.shipmentId}`} className="mono fw-600" style={{ color: 'var(--text-strong)' }}>
            {r.shipmentId}
          </Link>
        ),
      },
      { key: 'status', header: 'Status', width: 130, render: (r) => <StatusPill status={r.status} size="sm" /> },
      {
        key: 'dockName',
        header: 'Dock',
        width: 110,
        render: (r) => (r.dockName ? <Badge tone="accent" size="sm">{r.dockName}</Badge> : <span className="c-subtle t-sm">Waiting</span>),
      },
      { key: 'gateInAt', header: 'Gated in', width: 110, render: (r) => formatTime(r.gateInAt) },
      {
        key: 'minutesOnSite',
        header: 'Detention clock',
        width: 200,
        render: (r) => {
          const tone = r.detention === 'red' ? 'danger' : r.detention === 'amber' ? 'warn' : 'success'
          return (
            <span className="stack gap-4" style={{ minWidth: 170 }}>
              <span className="row between gap-8">
                <span className="fw-700 c-strong">{r.minutesOnSite} min</span>
                <Badge tone={tone} size="sm">
                  <span className="status-dot" aria-hidden="true" />
                  {r.detention === 'red' ? 'Charged' : r.detention === 'amber' ? 'Approaching' : 'Free'}
                </Badge>
              </span>
              <Progress value={r.minutesOnSite} max={DETENTION_RED_MIN * 1.4} tone={tone} size="sm" label={`${r.vehicleReg} on site`} />
            </span>
          )
        },
      },
      {
        key: 'actions',
        header: '',
        width: 190,
        render: (r) => (
          <span className="row gap-6" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" icon="phone" href={`tel:${r.driverPhone.replace(/\s/g, '')}`}>
              Call
            </Button>
            <Button variant="secondary" size="sm" icon="logout" loading={busy === r.shipmentId} onClick={() => doGateOut(r)}>
              Gate out
            </Button>
          </span>
        ),
      },
    ],
    [busy, doGateOut],
  )

  const logColumns = useMemo(
    () => [
      {
        key: 'direction',
        header: 'Movement',
        width: 120,
        render: (r) => (
          <Badge tone={r.direction === 'in' ? 'info' : 'neutral'} size="sm">
            <Icon name={r.direction === 'in' ? 'arrowRight' : 'arrowLeft'} size={11} />
            Gate {r.direction}
          </Badge>
        ),
      },
      { key: 'at', header: 'Time', width: 170, render: (r) => formatDateTime(r.at) },
      { key: 'vehicleReg', header: 'Vehicle', width: 140, render: (r) => <span className="mono">{r.vehicleReg}</span> },
      { key: 'vendorName', header: 'Vendor', width: 190, render: (r) => <span className="truncate">{r.vendorName}</span> },
      { key: 'driverName', header: 'Driver', width: 160 },
      {
        key: 'shipmentId',
        header: 'Consignment',
        width: 140,
        render: (r) => (
          <Link to={`/fc/inbound/${r.shipmentId}`} className="mono">
            {r.shipmentId}
          </Link>
        ),
      },
    ],
    [],
  )

  return (
    <div className="page page-wide">
      <PageHeader
        title="Yard & gate"
        subtitle="Vehicles on site, how long they have been here, and everything that has passed the gate."
        actions={<LiveIndicator paused={state.ui.livePaused || !state.ui.liveEnabled} />}
      />

      <div className="grid grid-4 mb-24">
        {yard.isLoading ? (
          <SkeletonCards count={4} height={98} />
        ) : (
          <>
            <StatCard label="On site now" value={stats.onSite} icon="truck" hint={`${formatNumber(stats.cartons)} cartons in the yard`} />
            <StatCard label="Approaching detention" value={stats.amber} icon="clock" accent={stats.amber ? 'warn' : undefined} hint={`Past ${DETENTION_AMBER_MIN} min`} />
            <StatCard label="Detention charged" value={stats.red} icon="alertCircle" accent={stats.red ? 'danger' : undefined} hint={`Past ${DETENTION_RED_MIN} min`} />
            <StatCard label="Approaching the gate" value={waiting.length} icon="navigation" hint="Within 25 km" />
          </>
        )}
      </div>

      {stats.red ? (
        <Callout tone="danger" title={`${stats.red} vehicle${stats.red > 1 ? 's are' : ' is'} past the detention threshold`} className="mb-16">
          Every extra minute is chargeable to the vendor and holds a bay another load needs. Clear these first.
        </Callout>
      ) : null}

      {waiting.length ? (
        <Card className="mb-16">
          <CardHeader title="Arriving at the gate" subtitle="Within 25 km — gate them in as they pull up" />
          <CardBody className="stack gap-8">
            {waiting.slice(0, 5).map((s) => (
              <div key={s.id} className="row between gap-12 list-row">
                <span className="row gap-10 grow" style={{ minWidth: 0 }}>
                  <span className="mono fw-600 c-strong">{s.vehicleReg}</span>
                  <span className="t-sm c-muted truncate">{s.vendorName}</span>
                </span>
                <span className="t-sm c-muted nowrap">{s.remainingKm} km · ETA {formatTime(s.predictedAt)}</span>
                <Button variant="primary" size="sm" icon="pin" loading={busy === s.id} onClick={() => doGateIn(s.id, s.vehicleReg)}>
                  Gate in
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card className="mb-16">
        <CardHeader
          title="On site"
          subtitle={`${onSite.length} vehicles`}
          actions={<SearchInput value={search} onChange={setSearch} placeholder="Search the yard…" label="Search the yard" />}
        />
        <CardBody flush>
          {onSite.length === 0 && !yard.isLoading ? (
            <EmptyState icon="pin" title="The yard is clear" description="No vehicles are currently gated in at this centre." />
          ) : (
            <Table
              columns={yardColumns}
              rows={onSite}
              getRowId={(r) => r.shipmentId}
              loading={yard.isLoading}
              error={yard.error}
              onRetry={yard.reload}
              variant="compact"
              caption="Vehicles currently on site"
              emptyTitle="Nothing matches that search"
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Gate log" subtitle="Most recent movements" />
        <CardBody flush>
          <Table
            columns={logColumns}
            rows={yard.data?.log ?? []}
            loading={yard.isLoading}
            variant="compact"
            caption="Gate in and gate out log"
            emptyTitle="No gate movements yet"
            emptyDescription="Movements appear here as vehicles are checked in and out."
          />
        </CardBody>
      </Card>
    </div>
  )
}
