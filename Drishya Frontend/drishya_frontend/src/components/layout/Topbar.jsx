import { useUI, useAlerts, useAuth } from '../../store/hooks.js'
import { IconButton } from '../ui/Button.jsx'
import Icon from '../ui/Icon.jsx'
import { LiveIndicator } from '../ui/Misc.jsx'
import './layout.css'

export default function Topbar({ onOpenPalette, onOpenNotifications, onToggleMobileNav, title }) {
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

      <IconButton icon="bell" label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={onOpenNotifications} badge={unread || undefined} />

      <IconButton icon="logout" label="Sign out" onClick={logout} />
    </header>
  )
}
