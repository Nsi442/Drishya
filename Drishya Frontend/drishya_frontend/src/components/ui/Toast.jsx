import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAppState, useToast } from '../../store/hooks.js'
import Icon from './Icon.jsx'
import { cn } from '../../lib/cn.js'

const TONE_ICON = {
  success: 'checkCircle',
  warn: 'alert',
  danger: 'alertCircle',
  info: 'info',
}

function Toast({ toast, onDismiss }) {
  const { id, tone = 'info', title, description, duration = 5000, to, actionLabel, onAction } = toast

  useEffect(() => {
    if (duration === Infinity || duration === 0) return undefined
    const t = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(t)
  }, [id, duration, onDismiss])

  return (
    <div className={cn('toast', `toast-${tone}`)}>
      <span className="toast-icon">
        <Icon name={TONE_ICON[tone] ?? 'info'} size={16} />
      </span>

      <div className="grow">
        <p className="toast-title">{title}</p>
        {description ? <p className="toast-desc">{description}</p> : null}

        {to || actionLabel ? (
          <div className="toast-action">
            {to ? (
              <Link to={to} className="btn btn-link" style={{ fontSize: 12 }} onClick={() => onDismiss(id)}>
                {actionLabel ?? 'View'}
                <Icon name="arrowRight" size={12} />
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-link"
                style={{ fontSize: 12 }}
                onClick={() => {
                  onAction?.()
                  onDismiss(id)
                }}
              >
                {actionLabel}
              </button>
            )}
          </div>
        ) : null}
      </div>

      <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => onDismiss(id)} aria-label="Dismiss notification">
        <Icon name="x" size={13} />
      </button>
    </div>
  )
}

// Mounted once by each layout. aria-live="polite" so a screen reader is told
// about live events without being interrupted mid-sentence.
export default function ToastHost() {
  const { toasts } = useAppState()
  const { dismiss } = useToast()

  return (
    <div className="toast-host" role="region" aria-label="Notifications" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  )
}
