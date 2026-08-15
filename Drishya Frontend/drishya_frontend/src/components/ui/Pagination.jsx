import Icon from './Icon.jsx'
import { formatNumber } from '../../lib/format.js'

// Windows the page numbers around the current page so the control stays the
// same width whether there are 3 pages or 300.
function pageWindow(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, '…', pageCount]
  if (page >= pageCount - 3) return [1, '…', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
  return [1, '…', page - 1, page, page + 1, '…', pageCount]
}

export default function Pagination({ page, pageCount, total, pageSize, onPageChange, onPageSizeChange, itemLabel = 'records' }) {
  if (!total) return null

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav className="pagination" aria-label="Pagination">
      <span>
        Showing <strong className="c-strong">{formatNumber(first)}</strong>–<strong className="c-strong">{formatNumber(last)}</strong> of{' '}
        <strong className="c-strong">{formatNumber(total)}</strong> {itemLabel}
      </span>

      <div className="row gap-12">
        {onPageSizeChange ? (
          <label className="row gap-6" style={{ fontSize: 12 }}>
            Rows
            <select
              className="control"
              style={{ height: 28, width: 'auto', fontSize: 12, padding: '0 6px' }}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="pagination-pages">
          <button type="button" className="page-btn" onClick={() => onPageChange(1)} disabled={page === 1} aria-label="First page">
            <Icon name="chevronsLeft" size={14} />
          </button>
          <button type="button" className="page-btn" onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Previous page">
            <Icon name="chevronLeft" size={14} />
          </button>

          {pageWindow(page, pageCount).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="page-ellipsis" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className="page-btn"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            ),
          )}

          <button type="button" className="page-btn" onClick={() => onPageChange(page + 1)} disabled={page === pageCount} aria-label="Next page">
            <Icon name="chevronRight" size={14} />
          </button>
          <button type="button" className="page-btn" onClick={() => onPageChange(pageCount)} disabled={page === pageCount} aria-label="Last page">
            <Icon name="chevronsRight" size={14} />
          </button>
        </div>
      </div>
    </nav>
  )
}
