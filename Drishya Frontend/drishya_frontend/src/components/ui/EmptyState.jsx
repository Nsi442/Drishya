import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'
import Button from './Button.jsx'

// Empty is never just "no results" — it says why the list is empty and offers
// the action that would fill it.
export default function EmptyState({
  icon = 'package',
  title = 'Nothing here yet',
  description,
  action,
  actionLabel,
  actionTo,
  onAction,
  secondaryLabel,
  onSecondary,
  tone,
  className,
}) {
  return (
    <div className={cn('empty', tone === 'danger' && 'empty-danger', className)}>
      <span className="empty-icon">
        <Icon name={icon} size={21} />
      </span>
      <p className="empty-title">{title}</p>
      {description ? <p className="empty-desc">{description}</p> : null}
      {action || actionLabel || secondaryLabel ? (
        <div className="empty-actions">
          {action}
          {actionLabel ? (
            <Button variant="primary" size="sm" to={actionTo} onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {secondaryLabel ? (
            <Button variant="ghost" size="sm" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// The error twin of EmptyState. Every page that loads data renders this when
// the service rejects, with a retry that re-runs the same request.
export function ErrorState({ error, onRetry, title = 'Could not load this view', className }) {
  return (
    <EmptyState
      className={className}
      tone="danger"
      icon="alert"
      title={title}
      description={
        error?.message ?? 'Something went wrong while fetching data. The connection may have dropped.'
      }
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  )
}
