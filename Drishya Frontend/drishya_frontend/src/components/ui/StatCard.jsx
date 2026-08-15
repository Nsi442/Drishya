import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'
import Skeleton from './Skeleton.jsx'

export default function StatCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  hint,
  icon,
  accent,
  to,
  loading = false,
  className,
  onClick,
}) {
  if (loading) {
    return (
      <div className={cn('stat', accent && `stat-accent-${accent}`, className)}>
        <Skeleton width={90} height={11} />
        <Skeleton width={64} height={28} />
        <Skeleton width={110} height={12} />
      </div>
    )
  }

  const direction = delta === undefined || delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

  const body = (
    <>
      <span className="stat-label">
        {icon ? <Icon name={icon} size={13} /> : null}
        {label}
      </span>
      <span className="stat-value">
        {value}
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </span>
      {(direction || hint) && (
        <span className="stat-foot">
          {direction ? (
            <span className={cn('stat-delta', `is-${direction}`)}>
              <Icon name={direction === 'up' ? 'trendUp' : direction === 'down' ? 'trendDown' : 'minus'} size={12} />
              {Math.abs(delta)}
              {deltaLabel ? ` ${deltaLabel}` : '%'}
            </span>
          ) : null}
          {hint ? <span>{hint}</span> : null}
        </span>
      )}
    </>
  )

  const classes = cn('stat', accent && `stat-accent-${accent}`, (to || onClick) && 'stat-link', className)

  if (to) {
    return (
      <Link to={to} className={classes} style={{ textDecoration: 'none' }}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {body}
      </button>
    )
  }
  return <div className={classes}>{body}</div>
}
