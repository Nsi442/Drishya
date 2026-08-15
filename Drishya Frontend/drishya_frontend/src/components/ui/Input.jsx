import { forwardRef, useState } from 'react'
import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'
import Field from './Field.jsx'

const Input = forwardRef(function Input(
  { label, hint, error, required, leadIcon, trailIcon, onTrailClick, trailLabel, size = 'md', className, id, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id}>
      {(a11y) => (
        <div className={cn('input-wrap', leadIcon && 'input-wrap-lead', trailIcon && 'input-wrap-trail')}>
          {leadIcon ? (
            <span className="input-adornment input-adornment-lead">
              <Icon name={leadIcon} size={15} />
            </span>
          ) : null}

          <input ref={ref} className={cn('control', size === 'lg' && 'control-lg', className)} {...a11y} {...rest} />

          {trailIcon ? (
            onTrailClick ? (
              <button
                type="button"
                className="input-adornment input-adornment-trail input-adornment-button"
                onClick={onTrailClick}
                aria-label={trailLabel}
                title={trailLabel}
              >
                <Icon name={trailIcon} size={15} />
              </button>
            ) : (
              <span className="input-adornment input-adornment-trail">
                <Icon name={trailIcon} size={15} />
              </span>
            )
          ) : null}
        </div>
      )}
    </Field>
  )
})

export default Input

export const Textarea = forwardRef(function Textarea({ label, hint, error, required, rows = 4, className, id, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id}>
      {(a11y) => <textarea ref={ref} rows={rows} className={cn('control', className)} {...a11y} {...rest} />}
    </Field>
  )
})

// Password field with a show/hide toggle — the toggle is a real button so it
// is reachable from the keyboard.
export const PasswordInput = forwardRef(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false)
  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      trailIcon="eye"
      trailLabel={visible ? 'Hide password' : 'Show password'}
      onTrailClick={() => setVisible((v) => !v)}
      {...props}
    />
  )
})

export function SearchInput({ value, onChange, onClear, placeholder = 'Search…', className, label, ...rest }) {
  return (
    <div className={cn('input-wrap input-wrap-lead', value && 'input-wrap-trail', className)}>
      <span className="input-adornment input-adornment-lead">
        <Icon name="search" size={15} />
      </span>
      <input
        type="search"
        className="control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          className="input-adornment input-adornment-trail input-adornment-button"
          onClick={() => {
            onChange('')
            onClear?.()
          }}
          aria-label="Clear search"
        >
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  )
}
