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

export default function NotificationDrawer({ open, onClose, openExceptions = 0 }) {
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

  // Driver keeps none of these: there is no alert log or exception queue in
  // that portal, and the drawer is the whole of it.
  const footerLinks =
    user?.role === 'fc'
      ? [{ to: '/fc/exceptions', label: 'Receiving exceptions', count: openExceptions }]
      : user?.role === 'driver'
        ? []
        : [
            { to: '/vendor/alerts', label: 'All alerts' },
            { to: '/vendor/exceptions', label: 'Exceptions' },
          ]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Notifications"
      // Spells out the bell's number rather than leaving a total with two
      // meanings behind it.
      subtitle={
        [unread ? `${unread} unread` : null, openExceptions ? `${openExceptions} open exceptions` : null]
          .filter(Boolean)
          .join(' · ') || 'All caught up'
      }
      actions={
        unread ? (
          <Button variant="ghost" size="sm" onClick={onMarkAll}>
            Mark all read
          </Button>
        ) : null
      }
      // The bell is now the only way to Alerts and Exceptions — both left the
      // rail, because both are feeds of things that have already asked for
      // attention and this button is that ask. So the footer has to name them
      // properly.
      //
      // It used to be one button reading "Open the full alert log" that sent a
      // receiving desk to /fc/exceptions, which is a different page — and
      // there is no /fc/alerts route for it to have meant instead. A label
      // that names one page and opens another is the kind of thing a person
      // stops trusting the whole screen over.
      footer={footerLinks.length ? (
        <div className="stack gap-8" style={{ width: '100%' }}>
          {footerLinks.map((link) => (
            <Button key={link.to} variant="secondary" size="sm" block to={link.to} onClick={onClose}>
              {link.label}
              {link.count ? <span className="nav-count is-alert" style={{ marginLeft: 8 }}>{link.count}</span> : null}
            </Button>
          ))}
        </div>
      ) : null}
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
