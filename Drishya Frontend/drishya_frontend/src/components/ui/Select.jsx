import { forwardRef } from 'react'
import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'
import Field from './Field.jsx'

// A native <select> underneath — it gets the platform picker on a phone, which
// is what the driver app wants, and full keyboard support for free.
const Select = forwardRef(function Select(
  { label, hint, error, required, options = [], placeholder, size = 'md', className, id, children, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id}>
      {(a11y) => (
        <div className="select-wrap">
          <select ref={ref} className={cn('control', size === 'lg' && 'control-lg', className)} {...a11y} {...rest}>
            {placeholder ? (
              <option value="" disabled>
                {placeholder}
              </option>
            ) : null}
            {children ??
              options.map((opt) => {
                const value = typeof opt === 'string' ? opt : opt.value
                const text = typeof opt === 'string' ? opt : opt.label
                return (
                  <option key={value} value={value} disabled={opt.disabled}>
                    {text}
                  </option>
                )
              })}
          </select>
          <span className="select-caret">
            <Icon name="chevronDown" size={15} />
          </span>
        </div>
      )}
    </Field>
  )
})

export default Select

// Compact filter select for table toolbars — label sits inline, no field wrapper.
export function FilterSelect({ label, value, onChange, options, className }) {
  return (
    <div className={cn('select-wrap', className)} style={{ width: 'auto' }}>
      <select
        className="control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{ height: 32, fontSize: 12, paddingRight: 28, width: 'auto' }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="select-caret">
        <Icon name="chevronDown" size={13} />
      </span>
    </div>
  )
}
