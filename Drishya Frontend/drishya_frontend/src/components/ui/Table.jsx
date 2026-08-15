import { useRef, useEffect, useState } from 'react'
import { cn } from '../../lib/cn.js'
import Icon from './Icon.jsx'
import Checkbox from './Checkbox.jsx'
import EmptyState, { ErrorState } from './EmptyState.jsx'
import { SkeletonTable } from './Skeleton.jsx'

// Column shape:
//   { key, header, render(row), align, sortable, width, defaultHidden, csv(row) }
//
// The table owns presentation only — sorting, paging and selection state live
// in useTableState so a page can drive several tables from one place.
export default function Table({
  columns,
  rows,
  getRowId = (row) => row.id,
  sort,
  onSort,
  selectable = false,
  selected,
  onToggleRow,
  onToggleAll,
  onRowClick,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No matching records',
  emptyDescription,
  emptyAction,
  emptyIcon = 'search',
  flashIds = [],
  variant,
  caption,
  className,
  rowClassName,
}) {
  const visible = columns
  const colSpan = visible.length + (selectable ? 1 : 0)

  if (error) {
    return (
      <div className="table-scroll">
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="table-scroll">
        <SkeletonTable rows={8} columns={colSpan} />
      </div>
    )
  }

  const ids = rows.map(getRowId)
  const allSelected = selectable && ids.length > 0 && ids.every((id) => selected?.has(id))
  const someSelected = selectable && ids.some((id) => selected?.has(id)) && !allSelected

  return (
    <div className="table-scroll">
      <table className={cn('table', variant === 'compact' && 'table-compact', variant === 'board' && 'table-board', className)}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {selectable ? (
              <th scope="col" className="col-check">
                <span className="th-inner">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={() => onToggleAll?.(ids)}
                    aria-label={allSelected ? 'Clear selection' : 'Select all rows on this page'}
                  />
                </span>
              </th>
            ) : null}

            {visible.map((col) => {
              const isSorted = sort?.key === col.key
              const ariaSort = isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  className={cn(col.sortable && 'is-sortable', isSorted && 'is-sorted', col.align === 'right' && 'col-num')}
                  aria-sort={col.sortable ? ariaSort : undefined}
                >
                  {col.sortable ? (
                    <button type="button" className="th-inner" onClick={() => onSort?.(col.key)}>
                      {col.header}
                      <Icon
                        name={isSorted ? (sort.direction === 'asc' ? 'chevronUp' : 'chevronDown') : 'chevronDown'}
                        size={12}
                        className="th-sort-icon"
                      />
                    </button>
                  ) : (
                    <span className="th-inner">{col.header}</span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="table-empty-cell">
                <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const id = getRowId(row)
              return (
                <TableRow
                  key={id}
                  id={id}
                  row={row}
                  columns={visible}
                  selectable={selectable}
                  isSelected={selected?.has(id)}
                  onToggleRow={onToggleRow}
                  onRowClick={onRowClick}
                  flashed={flashIds.includes(id)}
                  className={rowClassName?.(row)}
                />
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function TableRow({ id, row, columns, selectable, isSelected, onToggleRow, onRowClick, flashed, className }) {
  const clickable = Boolean(onRowClick)

  return (
    <tr
      // The flash is applied as an inline animation rather than a class plus an
      // effect: toggling the style property restarts the animation on its own,
      // so no state has to be written to replay it.
      style={flashed ? { animation: 'drishya-flash 1.2s ease-out' } : undefined}
      className={cn(isSelected && 'is-selected', clickable && 'table-row-link', className)}
      onClick={clickable ? (e) => {
        // Let controls inside the row do their own thing.
        if (e.target.closest('button, a, input, label')) return
        onRowClick(row)
      } : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row)
      } : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {selectable ? (
        <td className="col-check">
          <Checkbox checked={Boolean(isSelected)} onChange={() => onToggleRow?.(id)} aria-label={`Select ${id}`} />
        </td>
      ) : null}

      {columns.map((col) => (
        <td key={col.key} className={cn(col.align === 'right' && 'col-num', col.className)}>
          {col.render ? col.render(row) : row[col.key]}
        </td>
      ))}
    </tr>
  )
}

export function TableShell({ children, className }) {
  return <div className={cn('table-shell', className)}>{children}</div>
}

export function TableToolbar({ children, className }) {
  return <div className={cn('table-toolbar', className)}>{children}</div>
}

// Appears only while rows are selected, and always says how many.
export function BulkBar({ count, onClear, children }) {
  if (!count) return null
  return (
    <div className="table-bulk" role="status">
      <strong>{count}</strong> selected
      <div className="row gap-6 grow wrap">{children}</div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}

// Show/hide columns. Anchored dropdown, closes on outside click or Escape.
export function ColumnChooser({ columns, hidden, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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

  return (
    <div className="menu-anchor" ref={ref}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
        <Icon name="columns" size={14} />
        Columns
      </button>
      {open ? (
        <div className="menu" role="group" aria-label="Toggle columns">
          <p className="menu-label">Visible columns</p>
          {columns.map((col) => (
            <label key={col.key} className="menu-item" style={{ cursor: 'pointer' }}>
              <Checkbox
                checked={!hidden.has(col.key)}
                onChange={() => onToggle(col.key)}
                disabled={col.required}
              />
              {col.header}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}
