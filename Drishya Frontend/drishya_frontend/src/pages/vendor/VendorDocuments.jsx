import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import useAsync from '../../hooks/useAsync.js'
import useDebounce from '../../hooks/useDebounce.js'
import useTableState from '../../hooks/useTableState.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { useToast } from '../../store/hooks.js'
import { listDocuments, reuploadDocument, validateDocument } from '../../services/documentService.js'
import { DOC_TYPES, DOC_STATUS } from '../../lib/constants.js'
import { formatDateTime, formatDate, formatNumber } from '../../lib/format.js'
import { sortRows, paginate } from '../../services/client.js'
import { downloadCSV } from '../../lib/csv.js'
import Table, { TableShell, TableToolbar } from '../../components/ui/Table.jsx'
import Pagination from '../../components/ui/Pagination.jsx'
import Drawer from '../../components/ui/Drawer.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Button, { IconButton } from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import { SearchInput } from '../../components/ui/Input.jsx'
import { FilterSelect } from '../../components/ui/Select.jsx'
import { StatusPill } from '../../components/ui/Badge.jsx'
import StatCard from '../../components/ui/StatCard.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { PageHeader, Callout } from '../../components/ui/Misc.jsx'
import { SkeletonCards } from '../../components/ui/Skeleton.jsx'

const COLUMNS = [
  { key: 'type', header: 'Document', sortable: true, width: 170 },
  { key: 'number', header: 'Number', sortable: true, width: 180 },
  { key: 'shipmentId', header: 'Shipment', sortable: true, width: 130 },
  { key: 'lane', header: 'Lane', sortable: true, width: 190 },
  { key: 'fcName', header: 'Destination', sortable: true, width: 150 },
  { key: 'status', header: 'Validation', sortable: true, width: 150 },
  { key: 'promisedAt', header: 'Needed by', sortable: true, width: 150 },
  { key: 'actions', header: '', width: 84 },
]

export default function VendorDocuments() {
  useDocumentTitle('Documents')
  const toast = useToast()

  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [preview, setPreview] = useState(null)
  const [reupload, setReupload] = useState(null)
  const [reuploadNumber, setReuploadNumber] = useState('')
  const [busy, setBusy] = useState(false)

  const table = useTableState({ initialSort: { key: 'promisedAt', direction: 'asc' }, initialPageSize: 25, columns: COLUMNS })
  const docs = useAsync(() => listDocuments({}), [])

  const rows = useMemo(() => {
    const data = docs.data ?? []
    const q = debounced.trim().toLowerCase()
    return data.filter((d) => {
      if (status !== 'all' && d.status !== status) return false
      if (type !== 'all' && d.type !== type) return false
      if (q && !`${d.number ?? ''} ${d.shipmentId} ${d.fcName} ${d.lane}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [docs.data, debounced, status, type])

  const counts = useMemo(() => {
    const data = docs.data ?? []
    return {
      total: data.length,
      valid: data.filter((d) => d.status === 'valid').length,
      expiring: data.filter((d) => d.status === 'expiring').length,
      problem: data.filter((d) => d.status === 'mismatch' || d.status === 'missing').length,
    }
  }, [docs.data])

  const sorted = useMemo(() => sortRows(rows, table.sort.key, table.sort.direction), [rows, table.sort])
  const page = useMemo(() => paginate(sorted, { page: table.page, pageSize: table.pageSize }), [sorted, table.page, table.pageSize])

  const hasFilters = debounced || status !== 'all' || type !== 'all'

  const onValidate = async (doc) => {
    setBusy(true)
    try {
      await validateDocument(doc.shipmentId, doc.id)
      toast.success('Document validated', { description: `${DOC_TYPES[doc.type]} on ${doc.shipmentId} now reads as valid.` })
      docs.reload()
      setPreview(null)
    } catch (err) {
      toast.error('Validation failed', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const onReupload = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await reuploadDocument(reupload.shipmentId, reupload.id, { number: reuploadNumber })
      toast.success('Re-uploaded', { description: `${DOC_TYPES[reupload.type]} is queued for validation.` })
      setReupload(null)
      setReuploadNumber('')
      docs.reload()
    } catch (err) {
      toast.error('Upload failed', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const columns = useMemo(
    () =>
      COLUMNS.map((col) => {
        switch (col.key) {
          case 'type':
            return {
              ...col,
              render: (row) => (
                <span className="row gap-8">
                  <span className={`doc-icon is-${row.status}`} style={{ width: 24, height: 24 }}>
                    <Icon name={row.status === 'valid' ? 'checkCircle' : row.status === 'missing' ? 'alertCircle' : 'file'} size={13} />
                  </span>
                  <span className="fw-500 c-strong">{DOC_TYPES[row.type]}</span>
                </span>
              ),
            }
          case 'number':
            return { ...col, render: (row) => (row.number ? <span className="mono t-sm">{row.number}</span> : <span className="c-subtle">Not uploaded</span>) }
          case 'shipmentId':
            return {
              ...col,
              render: (row) => (
                <Link to={`/vendor/shipments/${row.shipmentId}`} className="mono fw-600" style={{ color: 'var(--text-strong)' }}>
                  {row.shipmentId}
                </Link>
              ),
            }
          case 'status':
            return { ...col, render: (row) => <StatusPill status={row.status} kind="document" size="sm" /> }
          case 'promisedAt':
            return { ...col, render: (row) => <span className="t-sm">{formatDate(row.promisedAt)}</span> }
          case 'actions':
            return {
              ...col,
              render: (row) => (
                <span className="row gap-2">
                  <IconButton icon="eye" label={`Preview ${DOC_TYPES[row.type]}`} onClick={() => setPreview(row)} />
                  <IconButton
                    icon="upload"
                    label={`Re-upload ${DOC_TYPES[row.type]}`}
                    onClick={() => {
                      setReupload(row)
                      setReuploadNumber(row.number ?? '')
                    }}
                  />
                </span>
              ),
            }
          default:
            return col
        }
      }),
    [],
  )

  return (
    <div className="page page-wide">
      <PageHeader
        title="Documents"
        subtitle="Every e-way bill, invoice, GST declaration and LR copy across your consignments, with its validation state."
        actions={
          <Button
            variant="secondary"
            icon="download"
            onClick={() =>
              downloadCSV('drishya-documents.csv', sorted, [
                { header: 'Document', value: (r) => DOC_TYPES[r.type] },
                { header: 'Number', value: (r) => r.number ?? '' },
                { header: 'Shipment', value: (r) => r.shipmentId },
                { header: 'Status', value: (r) => DOC_STATUS[r.status]?.label ?? r.status },
                { header: 'Needed by', value: (r) => new Date(r.promisedAt).toISOString() },
              ])
            }
            disabled={!sorted.length}
          >
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-4 mb-24">
        {docs.isLoading ? (
          <SkeletonCards count={4} height={98} />
        ) : (
          <>
            <StatCard label="Documents on file" value={formatNumber(counts.total)} icon="file" />
            <StatCard label="Validated" value={formatNumber(counts.valid)} icon="checkCircle" accent="success" hint="Will clear the gate" />
            <StatCard label="Expiring soon" value={formatNumber(counts.expiring)} icon="clock" accent="warn" hint="Valid now, not at the slot" onClick={() => setStatus('expiring')} />
            <StatCard label="Will be rejected" value={formatNumber(counts.problem)} icon="alertCircle" accent="danger" hint="Mismatched or missing" onClick={() => setStatus('mismatch')} />
          </>
        )}
      </div>

      {counts.problem > 0 && !docs.isLoading ? (
        <Callout tone="danger" title={`${counts.problem} documents will not clear the gate`} className="mb-16">
          A mismatched consignee GSTIN or a missing e-way bill turns into a detention charge at the fulfilment centre.
          Fix these before the vehicles reach the gate.
        </Callout>
      ) : null}

      <TableShell>
        <TableToolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search a document number or shipment…" className="grow" label="Search documents" />

          <FilterSelect
            label="Validation status"
            value={status}
            onChange={setStatus}
            options={[{ value: 'all', label: 'All statuses' }, ...Object.entries(DOC_STATUS).map(([value, meta]) => ({ value, label: meta.label }))]}
          />

          <FilterSelect
            label="Document type"
            value={type}
            onChange={setType}
            options={[{ value: 'all', label: 'All types' }, ...Object.entries(DOC_TYPES).map(([value, label]) => ({ value, label }))]}
          />

          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              icon="x"
              onClick={() => {
                setSearch('')
                setStatus('all')
                setType('all')
              }}
            >
              Clear
            </Button>
          ) : null}
        </TableToolbar>

        <Table
          columns={columns}
          rows={page.rows}
          getRowId={(r) => r.id}
          loading={docs.isLoading}
          error={docs.error}
          onRetry={docs.reload}
          sort={table.sort}
          onSort={table.toggleSort}
          caption="Documents across all consignments"
          emptyTitle={hasFilters ? 'No documents match these filters' : 'No documents yet'}
          emptyDescription={hasFilters ? 'Try a different status or document type.' : 'Documents appear here as consignments are created.'}
          emptyAction={
            hasFilters ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setStatus('all')
                  setType('all')
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        />

        <Pagination
          page={page.page}
          pageCount={page.pageCount}
          total={page.total}
          pageSize={page.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="documents"
        />
      </TableShell>

      <Drawer
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview ? DOC_TYPES[preview.type] : ''}
        subtitle={preview?.shipmentId}
        size="lg"
        footer={
          preview ? (
            <>
              <Button variant="secondary" block to={`/vendor/shipments/${preview.shipmentId}`} onClick={() => setPreview(null)}>
                Open shipment
              </Button>
              {preview.status !== 'valid' && preview.status !== 'missing' ? (
                <Button variant="primary" block loading={busy} onClick={() => onValidate(preview)}>
                  Re-run validation
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {preview ? (
          <div className="stack gap-16 pad">
            <div className="row gap-8 wrap">
              <StatusPill status={preview.status} kind="document" />
              <span className="t-sm c-muted">
                {preview.pages} page{preview.pages > 1 ? 's' : ''} · {preview.sizeKb} KB
              </span>
            </div>

            {preview.note ? <Callout tone={preview.status === 'mismatch' ? 'danger' : 'warn'}>{preview.note}</Callout> : null}

            <dl className="dl">
              <dt>Number</dt>
              <dd className="mono">{preview.number ?? 'Not uploaded'}</dd>
              <dt>Shipment</dt>
              <dd className="mono">{preview.shipmentId}</dd>
              <dt>Lane</dt>
              <dd>{preview.lane}</dd>
              <dt>Destination</dt>
              <dd>{preview.fcName}</dd>
              <dt>Uploaded</dt>
              <dd>{preview.uploadedAt ? formatDateTime(preview.uploadedAt) : '—'}</dd>
              {preview.expiresAt ? (
                <>
                  <dt>Valid until</dt>
                  <dd>{formatDateTime(preview.expiresAt)}</dd>
                </>
              ) : null}
            </dl>

            <div className="doc-preview">
              <Icon name="file" size={30} className="c-subtle" />
              <p className="fw-600 c-strong mt-8">{DOC_TYPES[preview.type]}</p>
              <p className="t-sm c-muted">{preview.number ?? 'No file on record'}</p>
              <p className="t-xs c-subtle mt-8">Preview rendering is not wired up in this build</p>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={Boolean(reupload)}
        onClose={() => setReupload(null)}
        title={reupload ? `Re-upload ${DOC_TYPES[reupload.type]}` : ''}
        description="The replacement is validated against the consignment straight away."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReupload(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="doc-reupload" variant="primary" loading={busy}>
              Upload and validate
            </Button>
          </>
        }
      >
        <form id="doc-reupload" onSubmit={onReupload} className="stack gap-16">
          <Input label="Document number" value={reuploadNumber} onChange={(e) => setReuploadNumber(e.target.value)} className="mono" required />
          <label className="filedrop">
            <input type="file" accept=".pdf,.png,.jpg" />
            <span className="stack center gap-4">
              <Icon name="upload" size={20} className="c-subtle" />
              <span className="t-md c-strong fw-500">Attach the corrected file</span>
              <span className="t-sm c-muted">PDF, PNG or JPG</span>
            </span>
          </label>
        </form>
      </Modal>
    </div>
  )
}
