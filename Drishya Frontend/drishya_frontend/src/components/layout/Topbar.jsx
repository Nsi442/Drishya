import { useUI, useAlerts, useAuth } from '../../store/hooks.js'
import { IconButton } from '../ui/Button.jsx'
import Icon from '../ui/Icon.jsx'
import { LiveIndicator } from '../ui/Misc.jsx'
import './layout.css'

export default function Topbar({ onOpenPalette, onOpenNotifications, onToggleMobileNav, title, attention }) {
  const ui = useUI()
  const { unread } = useAlerts()
  const { logout } = useAuth()

  return (
    <header className="topbar">
      <IconButton icon="menu" label="Open navigation" onClick={onToggleMobileNav} className="topbar-menu" />

      <button type="button" className="topbar-search" onClick={onOpenPalette} aria-label="Search shipments, vehicles and pages">
        <Icon name="search" size={15} />
        <span className="topbar-search-text">Search or jump to…</span>
        <kbd>⌘K</kbd>
      </button>

      {title ? <h1 className="t-md fw-600 c-strong hide-sm truncate">{title}</h1> : null}

      <div className="grow" />

      <LiveIndicator paused={ui.livePaused || !ui.liveEnabled} className="hide-sm" />

      <IconButton
        icon={ui.liveEnabled ? 'pause' : 'play'}
        label={ui.liveEnabled ? 'Pause live updates' : 'Resume live updates'}
        onClick={() => ui.set({ liveEnabled: !ui.liveEnabled })}
      />

      <IconButton
        icon={ui.theme === 'dark' ? 'sun' : 'moon'}
        label={ui.theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
        onClick={ui.toggleTheme}
      />

      <IconButton icon="help" label="Keyboard shortcuts" onClick={() => ui.set({ shortcutsOpen: true })} />

      {/* The badge counts what is BEHIND the button, which since Alerts and
          Exceptions left the rail is more than the unread alerts: on a
          receiving desk it includes the open exception queue the drawer now
          links to. A button that is the only way to a page has to carry that
          page's count, or removing the rail link silently hid five things
          somebody was meant to act on. The label spells the split out, and so
          does the drawer's subtitle, so the number is never a bare total with
          two meanings. */}
      <IconButton
        icon="bell"
        label={attention?.label ?? `Notifications${unread ? `, ${unread} unread` : ''}`}
        onClick={onOpenNotifications}
        badge={(attention?.count ?? unread) || undefined}
      />

      <IconButton icon="logout" label="Sign out" onClick={logout} />
    </header>
  )
}
