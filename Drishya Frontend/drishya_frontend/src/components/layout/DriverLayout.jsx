import { useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import Logo from '../Logo.jsx'
import Icon from '../ui/Icon.jsx'
import { IconButton } from '../ui/Button.jsx'
import ToastHost from '../ui/Toast.jsx'
import NotificationDrawer from './NotificationDrawer.jsx'
import { DRIVER_TABS } from './navConfig.js'
import { useAuth, useUI, useAlerts, useToast } from '../../store/hooks.js'
import useShipmentStore from '../../hooks/useShipmentStore.js'
import useLiveShipments from '../../hooks/useLiveShipments.js'
import useOfflineQueue from '../../hooks/useOfflineQueue.js'
import { DriverQueueContext } from './driverContext.js'
import './layout.css'

const TITLES = {
  '/driver': 'Today',
  '/driver/scan': 'Scan',
  '/driver/documents': 'Documents',
  '/driver/history': 'Trip history',
  '/driver/profile': 'Profile',
  '/driver/incident': 'Report incident',
}

// Driver shell: mobile first at 390px, bottom tab bar, no sidebar. Everything
// a thumb needs is in the lower half of the screen.
export default function DriverLayout() {
  const { user } = useAuth()
  const ui = useUI()
  const toast = useToast()
  const { unread } = useAlerts()
  const navigate = useNavigate()
  const location = useLocation()
  const queue = useOfflineQueue()

  useShipmentStore()

  const onLiveEvent = useCallback(
    (event) => {
      // A driver only needs to hear about their own vehicle, and only when it
      // matters — no delay chatter about other people's loads.
      if (event.kind !== 'delay' && event.kind !== 'door_open') return
      toast.push({ tone: event.tone, title: event.title, description: event.description, duration: 6000 })
    },
    [toast],
  )

  useLiveShipments({ onEvent: onLiveEvent })

  if (!user) return null

  const title = TITLES[location.pathname] ?? (location.pathname.includes('/trip/') ? 'Trip' : 'Drishya')
  const isSubPage = !DRIVER_TABS.some((t) => t.to === location.pathname)

  return (
    <DriverQueueContext.Provider value={queue}>
      <div className="driver-shell">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <header className="driver-top">
          {isSubPage ? (
            <IconButton icon="arrowLeft" label="Go back" onClick={() => navigate(-1)} />
          ) : (
            <Logo variant="icon" size={26} />
          )}

          <h1 className="driver-top-title">{title}</h1>

          <IconButton
            icon={ui.theme === 'dark' ? 'sun' : 'moon'}
            label={ui.theme === 'dark' ? 'Light theme' : 'Dark theme'}
            onClick={ui.toggleTheme}
          />
          <IconButton
            icon="bell"
            label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            onClick={() => ui.set({ notificationsOpen: true })}
            badge={unread || undefined}
          />
        </header>

        {/* Connection state is never hidden — a queued POD has to be visible. */}
        <div className={`driver-status ${queue.online ? 'is-online' : 'is-offline'}`} role="status">
          <Icon name={queue.online ? 'wifi' : 'wifiOff'} size={13} />
          {queue.online ? 'Online — everything synced' : 'Offline — captures are queued on this device'}
          {queue.pending ? <strong style={{ marginLeft: 'auto' }}>{queue.pending} pending</strong> : null}
          <button
            type="button"
            className="btn btn-link"
            style={{ fontSize: 11, marginLeft: queue.pending ? 8 : 'auto' }}
            onClick={() => queue.setOnline(!queue.online)}
          >
            {queue.online ? 'Simulate offline' : 'Go online'}
          </button>
        </div>

        <main id="main-content" className="driver-main" tabIndex={-1}>
          <Outlet />
        </main>

        <nav className="driver-tabs" aria-label="Primary">
          {DRIVER_TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `driver-tab ${isActive ? 'is-active' : ''}`}>
              <Icon name={tab.icon} size={19} />
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <NotificationDrawer open={ui.notificationsOpen} onClose={() => ui.set({ notificationsOpen: false })} />
        <ToastHost />
      </div>
    </DriverQueueContext.Provider>
  )
}
