import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'

export function Progress({ value, max = 100, tone, size, label, className }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div
      className={cn('progress', size && `progress-${size}`, className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn('progress-bar', tone && `is-${tone}`)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Spinner({ size = 16, className }) {
  return <span className={cn('spinner', className)} style={{ width: size, height: size }} role="status" aria-label="Loading" />
}

// CSS-only tooltip. Wraps its trigger; the text is exposed to assistive tech
// through the trigger's own label, so this is purely visual reinforcement.
export function Tooltip({ content, children, wrap = false, className }) {
  return (
    <span className={cn('tip', wrap && 'tip-wrap', className)}>
      {children}
      <span className="tip-body" role="tooltip">
        {content}
      </span>
    </span>
  )
}

export function Callout({ tone = 'neutral', title, children, icon, className }) {
  const defaultIcon = { info: 'info', warn: 'alert', danger: 'alertCircle', success: 'checkCircle' }[tone] ?? 'info'
  return (
    <div className={cn('callout', tone !== 'neutral' && `callout-${tone}`, className)}>
      <span className="callout-icon">
        <Icon name={icon ?? defaultIcon} size={16} />
      </span>
      <div className="grow">
        {title ? <p className="callout-title">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  )
}

// A labelled value used all over the detail panels.
export function DataPoint({ label, value, mono = false, className }) {
  return (
    <div className={cn('kv', className)}>
      <span className="kv-label">{label}</span>
      <span className={cn('kv-value', mono && 'mono')}>{value ?? '—'}</span>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, breadcrumb, children }) {
  return (
    <header className="page-header">
      <div className="grow" style={{ minWidth: 0 }}>
        {breadcrumb}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="row gap-8 wrap shrink-0">{actions}</div> : null}
    </header>
  )
}

// The "live / paused" indicator in the top bar and on the arrival board.
export function LiveIndicator({ paused, label = 'Live', className }) {
  return (
    <span className={cn('row gap-6 t-xs c-muted', className)} title={paused ? 'Paused while the tab is in the background' : 'Updating every few seconds'}>
      <span className={cn('live-dot', paused && 'is-paused')} />
      {paused ? 'Paused' : label}
    </span>
  )
}
