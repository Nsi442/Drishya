import { NavLink, Link, useLocation } from 'react-router-dom'
import Logo from '../Logo.jsx'
import Icon from '../ui/Icon.jsx'
import Avatar from '../ui/Avatar.jsx'
import { Tooltip } from '../ui/Misc.jsx'
import { ROLE_LABEL } from '../../lib/constants.js'
import './layout.css'

export default function Sidebar({ nav, user, collapsed, counts = {}, onNavigate, onToggleCollapse }) {
  const { pathname } = useLocation()
  const home = user.role === 'fc' ? '/fc' : '/vendor'

  // The rail is ranked: everything after the { more: true } marker is the
  // second tier. See navConfig.js for what earns a place above the line.
  const cut = nav.findIndex((item) => item.more)
  const primary = cut === -1 ? nav : nav.slice(0, cut)
  const secondary = cut === -1 ? [] : nav.slice(cut + 1)

  const countOf = (item) => (item.badge ? counts[item.badge] : null) || null

  const renderLink = (item) => {
    const count = countOf(item)
    const link = (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
        onClick={onNavigate}
      >
        <Icon name={item.icon} size={17} className="nav-icon" />
        <span className="nav-label">{item.label}</span>
        {count ? (
          <span className={`nav-count ${item.badge === 'alerts' || item.badge === 'exceptions' ? 'is-alert' : ''}`}>{count}</span>
        ) : null}
      </NavLink>
    )

    // Collapsed to a rail, the label has to come back somehow.
    return collapsed ? (
      <Tooltip key={item.to} content={item.label}>
        {link}
      </Tooltip>
    ) : (
      link
    )
  }

  // A collapsed rail is icons only, so there is no room for a disclosure and
  // nothing to gain from one — the whole point of the grouping is the reading
  // order of the labels. Flatten it instead.
  const grouped = !collapsed && secondary.length > 0

  // Open it when the page you are on lives inside it, or the active item is
  // hidden behind a summary that gives no sign of holding it.
  const secondaryActive = secondary.some((item) => pathname.startsWith(item.to))

  // A badge inside a closed group is a number nobody sees. Surface the total so
  // the disclosure can still say "there is something in here for you".
  const secondaryCount = secondary.reduce((sum, item) => sum + (countOf(item) ?? 0), 0)

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-head">
        <Link to={home} className="sidebar-brand" aria-label="Drishya home">
          <Logo variant={collapsed ? 'icon' : 'horizontal'} size={collapsed ? 30 : 32} />
          {!collapsed ? <span className="sidebar-role">{ROLE_LABEL[user.role]}</span> : null}
        </Link>
      </div>

      <nav className="sidebar-nav">
        {primary.map(renderLink)}

        {grouped ? (
          <details className="nav-more" open={secondaryActive}>
            <summary className="nav-item nav-more-summary">
              <Icon name="chevronRight" size={17} className="nav-icon nav-more-chevron" />
              <span className="nav-label">More</span>
              {secondaryCount ? <span className="nav-count is-alert">{secondaryCount}</span> : null}
            </summary>
            {secondary.map(renderLink)}
          </details>
        ) : (
          secondary.map(renderLink)
        )}
      </nav>

      <div className="sidebar-foot">
        <Link to={`${home}/settings`} className="sidebar-user" onClick={onNavigate}>
          <Avatar name={user.name} initials={user.initials} size="sm" />
          <span className="sidebar-user-text">
            <span className="sidebar-user-name">{user.name}</span>
            <span className="sidebar-user-org">{user.orgName}</span>
          </span>
        </Link>

        <button
          type="button"
          className="nav-item hide-sm"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          style={{ width: '100%', marginTop: 2 }}
        >
          <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} size={17} className="nav-icon" />
          <span className="nav-label">Collapse</span>
        </button>
      </div>
    </aside>
  )
}
