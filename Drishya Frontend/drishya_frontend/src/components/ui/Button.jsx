import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'

// Renders as <button>, <a> or <Link> depending on what it has to do, so a
// navigating control is a real link and keeps middle-click and open-in-new-tab.
const Button = forwardRef(function Button(
  {
    children,
    variant = 'secondary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    block = false,
    to,
    href,
    className,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = cn('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', className)
  const iconSize = size === 'lg' || size === 'xl' ? 17 : 15

  const content = (
    <>
      {loading ? (
        <span className="spinner" style={{ width: iconSize, height: iconSize }} aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={iconSize} /> : null}
    </>
  )

  if (to && !disabled) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {content}
      </Link>
    )
  }

  if (href && !disabled) {
    return (
      <a ref={ref} href={href} className={classes} {...rest}>
        {content}
      </a>
    )
  }

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  )
})

export default Button

// Square, icon-only. `label` is required — it becomes the accessible name.
export function IconButton({ icon, label, size = 16, badge, className, bordered = false, large = false, ...rest }) {
  return (
    <button
      type="button"
      className={cn('icon-btn', large && 'icon-btn-lg', bordered && 'icon-btn-bordered', className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size} />
      {badge ? <span className="icon-btn-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  )
}
