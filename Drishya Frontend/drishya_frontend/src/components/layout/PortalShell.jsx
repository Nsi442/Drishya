import { useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'
import NotificationDrawer from './NotificationDrawer.jsx'
import CommandPalette from './CommandPalette.jsx'
import ShortcutsModal from './ShortcutsModal.jsx'
import ToastHost from '../ui/Toast.jsx'
import { useAuth, useUI, useToast, useAlerts, useAppState } from '../../store/hooks.js'
import useShipmentStore from '../../hooks/useShipmentStore.js'
import useLiveShipments from '../../hooks/useLiveShipments.js'
import useHotkeys from '../../hooks/useHotkeys.js'
import useMediaQuery from '../../hooks/useMediaQuery.js'
import useAsync from '../../hooks/useAsync.js'
import { listExceptions } from '../../services/alertService.js'
import { listAppointments } from '../../services/appointmentService.js'
import './layout.css'

// The shared chrome behind both desk portals. The vendor and FC layouts differ
// in their navigation, their density and the routes they guard — everything
// else is the same shell, so it lives here once.
export default function PortalShell({ nav, density = 'comfortable', homePath }) {
  const { user } = useAuth()
  const ui = useUI()
  const toast = useToast()
  const { unread } = useAlerts()
  const state = useAppState()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 1025px)')

  useShipmentStore()

  // Live events surface as a toast that links straight to the shipment.
  const onLiveEvent = useCallback(
    (event) => {
      const to =
        user?.role === 'fc' ? `/fc/inbound/${event.shipmentId}` : `/vendor/shipments/${event.shipmentId}`
      toast.push({
        tone: event.tone,
        title: event.title,
        description: event.description,
        to,
        actionLabel: 'Open shipment',
        duration: event.tone === 'danger' ? 9000 : 6000,
      })
    },
    [toast, user],
  )

  useLiveShipments({ onEvent: onLiveEvent })

  // Sidebar badge counts. Only the fulfilment centre rail shows these two, so
  // they are only fetched for that role. Refreshed on each live tick so a new
  // exception shows up without a reload.
  const isFcUser = user?.role === 'fc'
  const badgeCounts = useAsync(
    () =>
      isFcUser
        ? Promise.all([
            listExceptions({ fcId: user.orgId, status: 'open' }),
            listAppointments({ fcId: user.orgId, status: 'requested' }),
          ]).then(([exceptions, requests]) => ({
            exceptions: exceptions.length,
            requests: requests.length,
          }))
        : Promise.resolve({ exceptions: 0, requests: 0 }),
    [isFcUser, user?.orgId, state.shipments.lastTick],
  )

  const counts = {
    alerts: unread,
    exceptions: badgeCounts.data?.exceptions ?? 0,
    requests: badgeCounts.data?.requests ?? 0,
  }

  const closeAll = useCallback(
    () => ui.set({ notificationsOpen: false, paletteOpen: false, shortcutsOpen: false, mobileNavOpen: false }),
    [ui],
  )

  const isFC = user?.role === 'fc'

  useHotkeys({
    'mod+k': () => ui.set({ paletteOpen: true }),
    '?': () => ui.set({ shortcutsOpen: true }),
    n: () => ui.set({ notificationsOpen: true }),
    t: ui.toggleTheme,
    l: () => ui.set({ liveEnabled: !ui.liveEnabled }),
    'g d': () => navigate(homePath),
    'g s': () => navigate(isFC ? '/fc/inbound' : '/vendor/shipments'),
    'g m': () => navigate(isFC ? '/fc/docks' : '/vendor/live-map'),
    'g a': () => navigate(isFC ? '/fc/analytics' : '/vendor/analytics'),
    'g c': () => navigate(isFC ? '/fc/exceptions' : '/vendor/documents'),
  })

  if (!user) return null

  const collapsed = isDesktop && ui.sidebarCollapsed

  return (
    <div
      className={`shell ${collapsed ? 'is-collapsed' : ''} ${ui.mobileNavOpen ? 'is-mobile-open' : ''}`}
      data-density={density}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Sidebar
        nav={nav}
        user={user}
        collapsed={collapsed}
        counts={counts}
        onNavigate={() => ui.set({ mobileNavOpen: false })}
        onToggleCollapse={() => ui.set({ sidebarCollapsed: !ui.sidebarCollapsed })}
      />

      {ui.mobileNavOpen && !isDesktop ? (
        <div className="sidebar-scrim" onClick={() => ui.set({ mobileNavOpen: false })} aria-hidden="true" />
      ) : null}

      <div className="main">
        <Topbar
          onOpenPalette={() => ui.set({ paletteOpen: true })}
          onOpenNotifications={() => ui.set({ notificationsOpen: true })}
          onToggleMobileNav={() => ui.set({ mobileNavOpen: !ui.mobileNavOpen })}
        />

        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <NotificationDrawer open={ui.notificationsOpen} onClose={() => ui.set({ notificationsOpen: false })} />
      {/* Keyed on open state so each opening gets a fresh palette — no effect
          is needed to clear the previous query. */}
      <CommandPalette key={ui.paletteOpen ? 'open' : 'closed'} open={ui.paletteOpen} onClose={() => ui.set({ paletteOpen: false })} />
      <ShortcutsModal open={ui.shortcutsOpen} onClose={closeAll} />
      <ToastHost />
    </div>
  )
}
