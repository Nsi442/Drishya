import { NavLink, Link } from 'react-router-dom'
import Logo from '../Logo.jsx'
import Icon from '../ui/Icon.jsx'
import Avatar from '../ui/Avatar.jsx'
import { Tooltip } from '../ui/Misc.jsx'
import { ROLE_LABEL } from '../../lib/constants.js'
import './layout.css'

export default function Sidebar({ nav, user, collapsed, counts = {}, onNavigate, onToggleCollapse }) {
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-head">
        <Link to={user.role === 'fc' ? '/fc' : '/vendor'} className="sidebar-brand" aria-label="Drishya home">
          <Logo variant={collapsed ? 'icon' : 'horizontal'} size={collapsed ? 30 : 32} />
          {!collapsed ? <span className="sidebar-role">{ROLE_LABEL[user.role]}</span> : null}
        </Link>
      </div>

      <nav className="sidebar-nav">
        {nav.map((item, i) => {
          if (item.section) {
            return (
              <p key={`section-${i}`} className="sidebar-section">
                {item.section}
              </p>
            )
          }

          const count = item.badge ? counts[item.badge] : null
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
              {count ? <span className={`nav-count ${item.badge === 'alerts' || item.badge === 'exceptions' ? 'is-alert' : ''}`}>{count}</span> : null}
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
        })}
      </nav>

      <div className="sidebar-foot">
        <Link to={user.role === 'fc' ? '/fc/settings' : '/vendor/settings'} className="sidebar-user" onClick={onNavigate}>
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
