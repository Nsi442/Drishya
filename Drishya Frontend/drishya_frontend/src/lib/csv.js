// CSV export for the data tables. Builds a blob client-side — there is no
// server in this app and there does not need to be one.

function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function toCSV(rows, columns) {
  const header = columns.map((c) => escapeCell(c.header)).join(',')
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.value(row))).join(','))
    .join('\n')
  return `${header}\n${body}`
}

export function downloadCSV(filename, rows, columns) {
  const blob = new Blob(['﻿', toCSV(rows, columns)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
