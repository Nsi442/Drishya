import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import useAsync from '../../hooks/useAsync.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { useAuth, useToast } from '../../store/hooks.js'
import { getDockSchedule } from '../../services/fcService.js'
import { rescheduleAppointment } from '../../services/appointmentService.js'
import { formatDate, formatDateTime } from '../../lib/format.js'
import DockGantt from '../../components/schedule/DockGantt.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button, { IconButton } from '../../components/ui/Button.jsx'
import Drawer from '../../components/ui/Drawer.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import Badge, { StatusPill } from '../../components/ui/Badge.jsx'
import Skeleton from '../../components/ui/Skeleton.jsx'
import { ErrorState } from '../../components/ui/EmptyState.jsx'
import { PageHeader, Callout, DataPoint } from '../../components/ui/Misc.jsx'

const DAY = 86400000

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export default function DockScheduler() {
  useDocumentTitle('Dock scheduler')
  const { user } = useAuth()
  const toast = useToast()
  const fcId = user?.orgId ?? 'fc-bhiwandi'

  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState(null)
  const [moving, setMoving] = useState(false)

  const schedule = useAsync(() => getDockSchedule(fcId, day), [fcId, day])

  // Two bookings on one dock that overlap. Recomputed on every render of the
  // gantt so a drag that creates a clash lights up immediately.
  const conflicts = useMemo(() => {
    const set = new Set()
    const items = schedule.data?.appointments ?? []
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i]
        const b = items[j]
        if (a.dockId !== b.dockId) continue
        if (a.start < b.end && b.start < a.end) {
          set.add(a.id)
          set.add(b.id)
        }
      }
    }
    return set
  }, [schedule.data])

  const onMove = async (appointment, { dockId, start }) => {
    setMoving(true)
    // Optimistic: the block follows the cursor to where it was dropped, and
    // snaps back if the service rejects the move.
    schedule.setData((prev) => ({
      ...prev,
      appointments: prev.appointments.map((a) =>
        a.id === appointment.id ? { ...a, dockId, start, end: start + (a.end - a.start) } : a,
      ),
    }))

    try {
      await rescheduleAppointment(appointment.id, { start, dockId })
      toast.success('Slot moved', {
        description: `${appointment.vendorName} now at ${new Date(start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
      })
      schedule.reload()
    } catch (err) {
      toast.error('Could not move the slot', { description: err.message })
      schedule.reload()
    } finally {
      setMoving(false)
    }
  }

  const stats = useMemo(() => {
    const items = schedule.data?.appointments ?? []
    const util = schedule.data?.utilisation ?? []
    return {
      booked: items.length,
      requested: items.filter((a) => a.status === 'requested').length,
      conflicts: conflicts.size,
      avgUtil: util.length ? Math.round(util.reduce((sum, u) => sum + u.utilisationPct, 0) / util.length) : 0,
    }
  }, [schedule.data, conflicts])

  const isToday = day === startOfDay(new Date())

  return (
    <div className="page page-wide">
      <PageHeader
        title="Dock scheduler"
        subtitle="Drag a block to move it. Clashes are flagged before they reach the gate."
        actions={
          <div className="row gap-8">
            <IconButton icon="chevronLeft" label="Previous day" onClick={() => setDay((d) => d - DAY)} bordered />
            <Button variant={isToday ? 'primary' : 'secondary'} onClick={() => setDay(startOfDay(new Date()))}>
              {isToday ? 'Today' : formatDate(day, { year: undefined })}
            </Button>
            <IconButton icon="chevronRight" label="Next day" onClick={() => setDay((d) => d + DAY)} bordered />
          </div>
        }
      />

      <div className="grid grid-4 mb-24">
        {schedule.isLoading ? (
          <>
            <Skeleton height={98} radius="var(--radius)" />
            <Skeleton height={98} radius="var(--radius)" />
            <Skeleton height={98} radius="var(--radius)" />
            <Skeleton height={98} radius="var(--radius)" />
          </>
        ) : (
          <>
            <StatCard label="Bookings today" value={stats.booked} icon="calendar" />
            <StatCard label="Awaiting approval" value={stats.requested} icon="clock" accent={stats.requested ? 'warn' : undefined} to="/fc/appointments" />
            <StatCard label="Clashes" value={stats.conflicts} icon="alert" accent={stats.conflicts ? 'danger' : 'success'} hint={stats.conflicts ? 'Two loads on one bay' : 'Nothing double-booked'} />
            <StatCard label="Capacity used" value={stats.avgUtil} unit="%" icon="gauge" accent={stats.avgUtil > 85 ? 'danger' : 'accent'} />
          </>
        )}
      </div>

      {stats.conflicts ? (
        <Callout tone="danger" title={`${stats.conflicts} bookings clash`} className="mb-16">
          Two consignments are booked onto the same bay at the same time. Drag one to a free window or to another dock —
          the hatched blocks are the ones in conflict.
        </Callout>
      ) : null}

      <Card>
        <CardHeader
          title={formatDate(day, { weekday: 'long' })}
          subtitle="06:00 to 22:00 · drag a block to reschedule"
          actions={moving ? <Badge tone="accent">Saving…</Badge> : null}
        />
        <CardBody flush>
          {schedule.isLoading ? (
            <div className="pad">
              <Skeleton height={380} radius="var(--radius-sm)" />
            </div>
          ) : schedule.isError ? (
            <ErrorState error={schedule.error} onRetry={schedule.reload} />
          ) : (
            <DockGantt
              docks={schedule.data.docks}
              appointments={schedule.data.appointments}
              dayStart={schedule.data.dayStart}
              utilisation={schedule.data.utilisation}
              conflicts={conflicts}
              onSelect={setSelected}
              onMove={onMove}
            />
          )}
        </CardBody>
      </Card>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.shipmentId ?? selected?.vehicleReg ?? 'Booking'}
        subtitle={selected ? selected.vendorName : ''}
        footer={
          selected?.shipmentId ? (
            <Button variant="primary" block to={`/fc/inbound/${selected.shipmentId}`} onClick={() => setSelected(null)}>
              Open consignment
            </Button>
          ) : (
            <Button variant="secondary" block onClick={() => setSelected(null)}>
              Close
            </Button>
          )
        }
      >
        {selected ? (
          <div className="stack gap-16 pad">
            <div className="row gap-8 wrap">
              <StatusPill status={selected.status} kind="appointment" />
              {conflicts.has(selected.id) ? (
                <Badge tone="danger" icon="alert">
                  Clashes with another booking
                </Badge>
              ) : null}
            </div>

            <div className="grid grid-2 gap-12">
              <DataPoint label="Dock" value={selected.dockId.split('-').slice(-2).join(' ').replace('dock', 'Dock')} />
              <DataPoint label="Vehicle" value={selected.vehicleReg} mono />
              <DataPoint label="Start" value={formatDateTime(selected.start)} />
              <DataPoint label="End" value={formatDateTime(selected.end)} />
              <DataPoint label="Cartons" value={selected.cartons} />
              <DataPoint label="Requested" value={formatDateTime(selected.requestedAt)} />
            </div>

            {selected.note ? (
              <Callout tone="neutral" icon="info" title="Note from the vendor">
                {selected.note}
              </Callout>
            ) : null}

            {selected.shipmentId ? (
              <p className="t-sm c-muted">
                Consignment{' '}
                <Link to={`/fc/inbound/${selected.shipmentId}`} className="mono">
                  {selected.shipmentId}
                </Link>
              </p>
            ) : (
              <Callout tone="neutral" icon="info">
                A cluster partner's booking with no consignment attached to this centre yet.
              </Callout>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
