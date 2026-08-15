import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn.js'

export default function Checkbox({ label, description, checked, indeterminate = false, onChange, className, ...rest }) {
  const ref = useRef(null)

  // `indeterminate` is a DOM property, not an attribute — React cannot set it.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <label className={cn('check', className)}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked, e)}
        {...rest}
      />
      {label || description ? (
        <span>
          {label}
          {description ? <span className="check-desc">{description}</span> : null}
        </span>
      ) : null}
    </label>
  )
}

export function Radio({ label, description, className, ...rest }) {
  return (
    <label className={cn('check', className)}>
      <input type="radio" {...rest} />
      <span>
        {label}
        {description ? <span className="check-desc">{description}</span> : null}
      </span>
    </label>
  )
}

export function Switch({ label, description, checked, onChange, disabled, className, id }) {
  return (
    <label className={cn('switch', className)} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      {label || description ? (
        <span>
          <span style={{ fontSize: 13, color: 'var(--text-strong)' }}>{label}</span>
          {description ? <span className="check-desc">{description}</span> : null}
        </span>
      ) : null}
    </label>
  )
}
