// Sorting, paging, selection and column visibility for the data tables. Held
// here rather than in each page so the shipments table and the vendor scorecard
// behave the same way under the same keys.

import { useState, useCallback, useMemo } from 'react'

export default function useTableState({
  initialSort = { key: null, direction: 'asc' },
  initialPageSize = 25,
  columns = [],
} = {}) {
  const [sort, setSort] = useState(initialSort)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [selected, setSelected] = useState(() => new Set())
  const [hidden, setHidden] = useState(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)))

  const toggleSort = useCallback((key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      // Third click clears the sort and returns to the natural order.
      return { key: null, direction: 'asc' }
    })
    setPage(1)
  }, [])

  const toggleRow = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback((ids) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      }
      return new Set([...prev, ...ids])
    })
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const toggleColumn = useCallback((key) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden])

  return {
    sort,
    setSort,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize: (n) => {
      setPageSize(n)
      setPage(1)
    },
    selected,
    selectedIds: [...selected],
    toggleRow,
    toggleAll,
    clearSelection,
    hidden,
    toggleColumn,
    visibleColumns,
    resetPage: () => setPage(1),
  }
}
