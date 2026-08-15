import { useRef } from 'react'
import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'

// Follows the ARIA tabs pattern: arrow keys move between tabs, Home/End jump
// to the ends, and only the selected tab is in the tab order.
export default function Tabs({ tabs, value, onChange, className, label = 'Sections' }) {
  const refs = useRef([])

  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.value === value)
    let next = null
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next === null) return
    e.preventDefault()
    onChange(tabs[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div className={cn('tabs', className)} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab, i) => (
        <button
          key={tab.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="tab"
          id={`tab-${tab.value}`}
          aria-selected={tab.value === value}
          aria-controls={`panel-${tab.value}`}
          tabIndex={tab.value === value ? 0 : -1}
          className="tab"
          onClick={() => onChange(tab.value)}
        >
          {tab.icon ? <Icon name={tab.icon} size={14} /> : null}
          {tab.label}
          {tab.count !== undefined && tab.count !== null ? <span className="tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function TabPanel({ value, active, children, className }) {
  if (value !== active) return null
  return (
    <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`} tabIndex={0} className={cn('fade-up', className)}>
      {children}
    </div>
  )
}

// Compact pill switcher, for view toggles rather than page sections.
export function SegmentedControl({ options, value, onChange, label, className, size }) {
  return (
    <div className={cn('segmented', className)} role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="segmented-item"
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
          style={size === 'sm' ? { height: 24, fontSize: 11, padding: '0 9px' } : undefined}
        >
          {opt.icon ? <Icon name={opt.icon} size={13} /> : null}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
