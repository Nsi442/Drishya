import { useState, useRef, useEffect, useMemo } from 'react'
import { cn } from '../../lib/cn.js'
import { toISODate, fromISODate, sameDay, monthGrid, WEEKDAY_INITIALS, MONTH_NAMES, RANGE_PRESETS } from '../../lib/dates.js'
import Icon from './Icon.jsx'
import Field from './Field.jsx'
import './datepicker.css'

export default function DatePicker({ label, value, onChange, min, max, hint, error, required, placeholder = 'Select a date', id, disabled, className }) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => fromISODate(value), [value])
  const [view, setView] = useState(() => selected ?? new Date())
  const ref = useRef(null)

  // Adjusting state during render when a prop changes — React's documented
  // alternative to an effect that only exists to mirror a prop. It runs before
  // anything is committed, so there is no extra paint.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (selected) setView(selected)
  }

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const minDate = fromISODate(min)
  const maxDate = fromISODate(max)
  const today = new Date()
  const cells = monthGrid(view.getFullYear(), view.getMonth())

  const isDisabled = (d) => (minDate && d < minDate) || (maxDate && d > maxDate)

  return (
    <Field label={label} hint={hint} error={error} required={required} id={id} className={className}>
      {(a11y) => (
        <div className="datepicker" ref={ref}>
          <button
            type="button"
            className={cn('control datepicker-trigger', error && 'control-invalid')}
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={disabled}
            {...a11y}
          >
            <Icon name="calendar" size={15} className="datepicker-lead" />
            <span className={cn('grow', 'truncate', !selected && 'c-subtle')} style={{ textAlign: 'left' }}>
              {selected ? selected.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : placeholder}
            </span>
            <Icon name="chevronDown" size={14} />
          </button>

          {open ? (
            <div className="datepicker-pop" role="dialog" aria-label="Choose a date">
              <div className="datepicker-head">
                <button type="button" className="icon-btn" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} aria-label="Previous month">
                  <Icon name="chevronLeft" size={15} />
                </button>
                <span className="datepicker-month" aria-live="polite">
                  {MONTH_NAMES[view.getMonth()]} {view.getFullYear()}
                </span>
                <button type="button" className="icon-btn" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} aria-label="Next month">
                  <Icon name="chevronRight" size={15} />
                </button>
              </div>

              <div className="datepicker-grid" role="grid">
                {WEEKDAY_INITIALS.map((d, i) => (
                  <span key={`${d}-${i}`} className="datepicker-weekday" aria-hidden="true">
                    {d}
                  </span>
                ))}

                {cells.map((d) => {
                  const outside = d.getMonth() !== view.getMonth()
                  const disabledCell = isDisabled(d)
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      className={cn('datepicker-day', outside && 'is-outside', sameDay(d, today) && 'is-today', sameDay(d, selected) && 'is-selected')}
                      disabled={disabledCell}
                      aria-current={sameDay(d, today) ? 'date' : undefined}
                      aria-pressed={sameDay(d, selected)}
                      onClick={() => {
                        onChange(toISODate(d))
                        setOpen(false)
                      }}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>

              <div className="datepicker-foot">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    onChange(toISODate(new Date()))
                    setOpen(false)
                  }}
                >
                  Today
                </button>
                {value ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      onChange('')
                      setOpen(false)
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Field>
  )
}

// Drives the analytics pages. Presets cover the common cases; "Custom" reveals
// the two date fields.
export function DateRangePicker({ value, onChange, className }) {
  const { from, to, preset = '30' } = value

  const applyPreset = (days) => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - Number(days))
    onChange({ preset: String(days), from: toISODate(start), to: toISODate(end) })
  }

  return (
    <div className={cn('row gap-8 wrap', className)}>
      <div className="segmented" role="group" aria-label="Date range">
        {RANGE_PRESETS.map((p) => (
          <button key={p.value} type="button" className="segmented-item" aria-pressed={preset === p.value} onClick={() => applyPreset(p.days)}>
            {p.label}
          </button>
        ))}
        <button type="button" className="segmented-item" aria-pressed={preset === 'custom'} onClick={() => onChange({ ...value, preset: 'custom' })}>
          Custom
        </button>
      </div>

      {preset === 'custom' ? (
        <div className="row gap-8">
          <DatePicker label={null} value={from} onChange={(v) => onChange({ ...value, from: v, preset: 'custom' })} max={to} className="datepicker-inline" />
          <span className="c-muted t-sm">to</span>
          <DatePicker label={null} value={to} onChange={(v) => onChange({ ...value, to: v, preset: 'custom' })} min={from} className="datepicker-inline" />
        </div>
      ) : null}
    </div>
  )
}
