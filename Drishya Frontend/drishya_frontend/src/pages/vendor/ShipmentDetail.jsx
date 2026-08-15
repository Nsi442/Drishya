import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppState, useDispatch, useToast } from '../../store/hooks.js'
import { selectShipment, ACTIONS } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { DOC_TYPES } from '../../lib/constants.js'
import { formatDateTime, formatNumber } from '../../lib/format.js'
import { reuploadDocument } from '../../services/documentService.js'
import { cancelShipment } from '../../services/shipmentService.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Tabs, { TabPanel } from '../../components/ui/Tabs.jsx'
import Modal, { ConfirmModal } from '../../components/ui/Modal.jsx'
import Drawer from '../../components/ui/Drawer.jsx'
import Input from '../../components/ui/Input.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import Icon from '../../components/ui/Icon.jsx'
import { StatusPill, DelayPill } from '../../components/ui/Badge.jsx'
import { PageHeader, DataPoint, Callout, LiveIndicator } from '../../components/ui/Misc.jsx'
import Skeleton from '../../components/ui/Skeleton.jsx'
import ShipmentMap from '../../components/map/ShipmentMap.jsx'
import Timeline from '../../components/shipment/Timeline.jsx'
import SensorPanel from '../../components/shipment/SensorPanel.jsx'
import {
  ETAPanel,
  DriverVehicleCard,
  ConsignmentSummary,
  DocumentStrip,
  PODPanel,
  ShipmentBreadcrumb,
} from '../../components/shipment/ShipmentParts.jsx'

export default function ShipmentDetail() {
  const { id } = useParams()
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const navigate = useNavigate()

  const shipment = selectShipment(state, id)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'

  const [tab, setTab] = useState('journey')
  const [previewDoc, setPreviewDoc] = useState(null)
  const [reuploadDoc, setReuploadDoc] = useState(null)
  const [reuploadNumber, setReuploadNumber] = useState('')
  const [uploading, setUploading] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useDocumentTitle(shipment ? `${shipment.id} — ${shipment.lane}` : 'Shipment')

  const docIssues = useMemo(
    () => (shipment?.documents ?? []).filter((d) => d.status === 'mismatch' || d.status === 'missing' || d.status === 'expiring'),
    [shipment],
  )

  if (loading) {
    return (
      <div className="page">
        <Skeleton width={220} height={26} />
        <div className="grid grid-2 mt-24">
          <Skeleton height={320} radius="var(--radius)" />
          <Skeleton height={320} radius="var(--radius)" />
        </div>
      </div>
    )
  }

  if (!shipment) {
    return (
      <div className="page">
        <EmptyState
          tone="danger"
          icon="alertCircle"
          title="Shipment not found"
          description={`No consignment is recorded against the reference ${id}. It may have been cancelled, or the link may be out of date.`}
          actionLabel="Back to all shipments"
          actionTo="/vendor/shipments"
        />
      </div>
    )
  }

  const onReupload = async (e) => {
    e.preventDefault()
    setUploading(true)
    try {
      await reuploadDocument(shipment.id, reuploadDoc.id, { number: reuploadNumber, fileName: `${reuploadDoc.type}-reissued.pdf` })
      const next = {
        ...shipment,
        documents: shipment.documents.map((d) =>
          d.id === reuploadDoc.id ? { ...d, number: reuploadNumber || d.number, status: 'pending', note: 'Re-uploaded — awaiting validation' } : d,
        ),
      }
      dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: next })
      toast.success('Document re-uploaded', { description: `${DOC_TYPES[reuploadDoc.type]} is queued for validation.` })
      setReuploadDoc(null)
      setReuploadNumber('')
    } catch (err) {
      toast.error('Upload failed', { description: err.message })
    } finally {
      setUploading(false)
    }
  }

  const onCancel = async () => {
    setCancelling(true)
    try {
      const next = await cancelShipment(shipment.id, 'Cancelled by the vendor from the shipment detail page')
      dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: next })
      toast.warn('Shipment cancelled', { description: `${shipment.id} has been withdrawn and its dock slot released.` })
      setConfirmCancel(false)
      navigate('/vendor/shipments')
    } catch (err) {
      toast.error('Could not cancel', { description: err.message })
    } finally {
      setCancelling(false)
    }
  }

  const tabs = [
    { value: 'journey', label: 'Journey', icon: 'navigation' },
    { value: 'documents', label: 'Documents', icon: 'file', count: docIssues.length || undefined },
    { value: 'sensors', label: 'Condition', icon: 'activity' },
    { value: 'pod', label: 'Proof of delivery', icon: 'checkCircle' },
  ]

  return (
    <div className="page page-wide">
      <PageHeader
        breadcrumb={<ShipmentBreadcrumb shipment={shipment} backTo="/vendor/shipments" backLabel="Shipments" />}
        title={
          <span className="row gap-12 wrap">
            <span className="mono">{shipment.id}</span>
            <StatusPill status={shipment.status} />
            <DelayPill minutes={shipment.delayMin} />
          </span>
        }
        subtitle={`${shipment.lane} · ${shipment.commodity} · ${formatNumber(shipment.cartons)} cartons`}
        actions={
          <>
            <LiveIndicator paused={state.ui.livePaused || !state.ui.liveEnabled} />
            <Button variant="secondary" icon="phone" href={`tel:${shipment.driverPhone.replace(/\s/g, '')}`}>
              Call driver
            </Button>
            <Button variant="secondary" icon="calendar" to="/vendor/appointments">
              Dock slot
            </Button>
            {shipment.status === 'booked' ? (
              <Button variant="danger-soft" icon="x" onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            ) : null}
          </>
        }
      />

      {docIssues.length ? (
        <Callout tone={docIssues.some((d) => d.status !== 'expiring') ? 'danger' : 'warn'} title="Paperwork will not clear the gate as it stands" className="mb-16">
          {docIssues.map((d) => `${DOC_TYPES[d.type]} — ${d.status}`).join(' · ')}.{' '}
          <button type="button" className="btn btn-link" onClick={() => setTab('documents')}>
            Review documents
          </button>
        </Callout>
      ) : null}

      {shipment.status === 'cancelled' ? (
        <Callout tone="neutral" icon="xCircle" title="This shipment was cancelled" className="mb-16">
          {shipment.cancelledReason}
        </Callout>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="stack gap-16">
          <Card>
            <CardHeader title="Live position" subtitle={`${formatNumber(shipment.remainingKm)} km remaining of ${formatNumber(shipment.distanceKm)} km`} />
            <CardBody flush>
              <ShipmentMap
                shipments={[shipment]}
                selectedId={shipment.id}
                showRoutes="all"
                cluster={false}
                height={332}
                className="dm-map-flush"
                fitKey={shipment.id}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Arrival" subtitle="Promised against what the platform now predicts" />
            <CardBody>
              <ETAPanel shipment={shipment} />
            </CardBody>
          </Card>

          <Card>
            <CardBody flush>
              <div className="tabs-inset">
                <Tabs tabs={tabs} value={tab} onChange={setTab} label="Shipment detail sections" />
              </div>

              <div className="pad">
                <TabPanel value="journey" active={tab}>
                  <Timeline shipment={shipment} />
                </TabPanel>

                <TabPanel value="documents" active={tab}>
                  <DocumentStrip
                    documents={shipment.documents}
                    onOpen={setPreviewDoc}
                    onReupload={(doc) => {
                      setReuploadDoc(doc)
                      setReuploadNumber(doc.number ?? '')
                    }}
                  />
                </TabPanel>

                <TabPanel value="sensors" active={tab}>
                  <SensorPanel shipment={shipment} />
                </TabPanel>

                <TabPanel value="pod" active={tab}>
                  <PODPanel shipment={shipment} />
                </TabPanel>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="stack gap-16">
          <Card>
            <CardHeader title="Driver & vehicle" />
            <CardBody>
              <DriverVehicleCard shipment={shipment} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Consignment" />
            <CardBody>
              <ConsignmentSummary shipment={shipment} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Dock booking" />
            <CardBody className="stack gap-12">
              <DataPoint label="Fulfilment centre" value={shipment.fcName} />
              <DataPoint label="Booked slot" value={`${formatDateTime(shipment.slotStart)} – ${new Date(shipment.slotEnd).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`} />
              <DataPoint label="Assigned dock" value={shipment.dockId ? shipment.dockId.split('-').slice(-2).join(' ').replace('dock', 'Dock') : 'Not yet assigned'} />
              {shipment.gateInAt ? <DataPoint label="Gate-in" value={formatDateTime(shipment.gateInAt)} /> : null}
              {shipment.gateOutAt ? <DataPoint label="Gate-out" value={formatDateTime(shipment.gateOutAt)} /> : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Document preview */}
      <Drawer
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc ? DOC_TYPES[previewDoc.type] : ''}
        subtitle={previewDoc?.number ?? undefined}
        size="lg"
        footer={
          <>
            <Button variant="secondary" block icon="download" onClick={() => toast.info('Download queued', { description: 'The file will be saved to your downloads folder.' })}>
              Download
            </Button>
            <Button
              variant="primary"
              block
              icon="upload"
              onClick={() => {
                setReuploadDoc(previewDoc)
                setReuploadNumber(previewDoc.number ?? '')
                setPreviewDoc(null)
              }}
            >
              Re-upload
            </Button>
          </>
        }
      >
        {previewDoc ? (
          <div className="stack gap-16 pad">
            <div className="row gap-8">
              <StatusPill status={previewDoc.status} kind="document" />
              <span className="t-sm c-muted">
                {previewDoc.pages} page{previewDoc.pages > 1 ? 's' : ''} · {previewDoc.sizeKb} KB
              </span>
            </div>

            {previewDoc.note ? <Callout tone="warn">{previewDoc.note}</Callout> : null}

            <dl className="dl">
              <dt>Document number</dt>
              <dd className="mono">{previewDoc.number ?? 'Not uploaded'}</dd>
              <dt>Uploaded</dt>
              <dd>{previewDoc.uploadedAt ? formatDateTime(previewDoc.uploadedAt) : '—'}</dd>
              {previewDoc.expiresAt ? (
                <>
                  <dt>Valid until</dt>
                  <dd>{formatDateTime(previewDoc.expiresAt)}</dd>
                </>
              ) : null}
              <dt>Against shipment</dt>
              <dd className="mono">{shipment.id}</dd>
            </dl>

            {/* Stand-in for the rendered PDF — there is no file store in this build. */}
            <div className="doc-preview">
              <Icon name="file" size={30} className="c-subtle" />
              <p className="fw-600 c-strong mt-8">{DOC_TYPES[previewDoc.type]}</p>
              <p className="t-sm c-muted">{previewDoc.number ?? 'No file on record'}</p>
              <p className="t-xs c-subtle mt-8">Preview rendering is not wired up in this build</p>
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* Re-upload */}
      <Modal
        open={Boolean(reuploadDoc)}
        onClose={() => setReuploadDoc(null)}
        title={reuploadDoc ? `Re-upload ${DOC_TYPES[reuploadDoc.type]}` : ''}
        description="The replacement is validated against this consignment before the vehicle reaches the gate."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReuploadDoc(null)} disabled={uploading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onReupload} loading={uploading} form="reupload-form" type="submit">
              Upload and validate
            </Button>
          </>
        }
      >
        <form id="reupload-form" onSubmit={onReupload} className="stack gap-16">
          <Input
            label="Document number"
            value={reuploadNumber}
            onChange={(e) => setReuploadNumber(e.target.value)}
            placeholder="Enter the reissued number"
            className="mono"
            required
          />
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

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={onCancel}
        loading={cancelling}
        tone="danger"
        confirmLabel="Cancel this shipment"
        title={`Cancel ${shipment.id}?`}
        description="The booking is withdrawn and its dock slot is released to the rest of the cluster. This cannot be undone."
      />
    </div>
  )
}
