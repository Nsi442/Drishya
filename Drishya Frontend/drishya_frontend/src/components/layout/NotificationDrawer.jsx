import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Drawer from '../ui/Drawer.jsx'
import Icon from '../ui/Icon.jsx'
import Button from '../ui/Button.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import { StatusPill } from '../ui/Badge.jsx'
import { useAlerts, useAuth } from '../../store/hooks.js'
import { formatRelative, formatDateTime } from '../../lib/format.js'
import { markAllRead as markAllReadService, markRead } from '../../services/alertService.js'
import './layout.css'

const SEVERITY_ICON = { critical: 'alertCircle', warning: 'alert', info: 'info' }

// Grouped by today / earlier, because "3 hours ago" and "last Tuesday" want
// different amounts of attention.
function groupByDay(items) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const today = []
  const earlier = []
  items.forEach((a) => (a.at >= startOfToday.getTime() ? today : earlier).push(a))
  return { today, earlier }
}

function shipmentLinkFor(role, shipmentId) {
  if (!shipmentId) return null
  if (role === 'fc') return `/fc/inbound/${shipmentId}`
  if (role === 'driver') return `/driver/trip/${shipmentId}`
  return `/vendor/shipments/${shipmentId}`
}

export default function NotificationDrawer({ open, onClose }) {
  const { items, unread, markAllRead, markRead: markReadLocal } = useAlerts()
  const { user } = useAuth()

  const { today, earlier } = useMemo(() => groupByDay(items.slice(0, 60)), [items])

  const onMarkAll = () => {
    markAllRead()
    markAllReadService(user)
  }

  const openAlert = (alert) => {
    if (!alert.read) {
      markReadLocal(alert.id)
      markRead(alert.id)
    }
    onClose()
  }

  const renderGroup = (label, group) =>
    group.length ? (
      <div key={label}>
        <p className="notif-group-label">
          {label} · {group.length}
        </p>
        {group.map((alert) => {
          const to = shipmentLinkFor(user?.role, alert.shipmentId)
          const body = (
            <>
              <span className={`notif-icon is-${alert.severity}`}>
                <Icon name={SEVERITY_ICON[alert.severity]} size={15} />
              </span>

              <span className="grow" style={{ minWidth: 0 }}>
                <span className="notif-title">{alert.title}</span>
                <span className="notif-message clamp-2">{alert.message}</span>
                <span className="notif-meta">
                  <StatusPill status={alert.severity} kind="alert" size="sm" />
                  {alert.shipmentId ? <span className="mono">{alert.shipmentId}</span> : null}
                  <time dateTime={new Date(alert.at).toISOString()} title={formatDateTime(alert.at)}>
                    {formatRelative(alert.at)}
                  </time>
                </span>
              </span>

              {!alert.read ? <span className="notif-unread-dot" aria-label="Unread" /> : null}
            </>
          )

          return to ? (
            <Link key={alert.id} to={to} className={`notif-item ${alert.read ? '' : 'is-unread'}`} onClick={() => openAlert(alert)}>
              {body}
            </Link>
          ) : (
            <button key={alert.id} type="button" className={`notif-item ${alert.read ? '' : 'is-unread'}`} onClick={() => openAlert(alert)}>
              {body}
            </button>
          )
        })}
      </div>
    ) : null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Notifications"
      subtitle={unread ? `${unread} unread` : 'All caught up'}
      actions={
        unread ? (
          <Button variant="ghost" size="sm" onClick={onMarkAll}>
            Mark all read
          </Button>
        ) : null
      }
      footer={
        user?.role !== 'driver' ? (
          <Button variant="secondary" size="sm" block to={user?.role === 'fc' ? '/fc/exceptions' : '/vendor/alerts'} onClick={onClose}>
            Open the full alert log
          </Button>
        ) : null
      }
    >
      {items.length === 0 ? (
        <EmptyState icon="bell" title="No notifications yet" description="Delay predictions, document problems and arrival updates land here as they happen." />
      ) : (
        <>
          {renderGroup('Today', today)}
          {renderGroup('Earlier', earlier)}
        </>
      )}
    </Drawer>
  )
}
