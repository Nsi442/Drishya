import { useId } from 'react'
import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'

// Wraps any control with its label, hint and error message, and wires the
// aria-describedby / aria-invalid relationships so the error is announced.
export default function Field({ label, hint, error, required, htmlFor, children, className, id: providedId }) {
  const autoId = useId()
  const id = providedId ?? htmlFor ?? autoId
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className={cn('field', className)}>
      {label ? (
        <label className="field-label" htmlFor={id}>
          {label}
          {required ? (
            <span className="field-required" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {typeof children === 'function'
        ? children({
            id,
            'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
            'aria-invalid': error ? 'true' : undefined,
            'aria-required': required || undefined,
          })
        : children}

      {hint && !error ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}

      {error ? (
        <span className="field-error" id={errorId}>
          <Icon name="alertCircle" size={13} />
          {error}
        </span>
      ) : null}
    </div>
  )
}
