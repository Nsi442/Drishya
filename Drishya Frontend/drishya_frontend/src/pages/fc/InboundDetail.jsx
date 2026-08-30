import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAppState, useDispatch, useToast, useAuth } from '../../store/hooks.js'
import { selectShipment, ACTIONS } from '../../store/reducer.js'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import useNow from '../../hooks/useNow.js'
import { gateIn, gateOut } from '../../services/fcService.js'
import { assignDock, advanceShipment } from '../../services/shipmentService.js'
import { DETENTION_AMBER_MIN, DETENTION_RED_MIN } from '../../lib/constants.js'
import { formatDateTime, formatNumber, formatTime } from '../../lib/format.js'
import { refData as db } from '../../services/referenceData.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Select from '../../components/ui/Select.jsx'
import Tabs, { TabPanel } from '../../components/ui/Tabs.jsx'
import Badge, { StatusPill, DelayPill } from '../../components/ui/Badge.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Skeleton from '../../components/ui/Skeleton.jsx'
import { PageHeader, DataPoint, Callout, Progress, LiveIndicator } from '../../components/ui/Misc.jsx'
import ShipmentMap from '../../components/map/ShipmentMap.jsx'
import Timeline from '../../components/shipment/Timeline.jsx'
import SensorPanel from '../../components/shipment/SensorPanel.jsx'
import { DocumentStrip, ConsignmentSummary, DriverVehicleCard, PODPanel } from '../../components/shipment/ShipmentParts.jsx'

export default function InboundDetail() {
  const { id } = useParams()
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const { user } = useAuth()

  const [tab, setTab] = useState('journey')
  const [assigning, setAssigning] = useState(false)
  const [dockId, setDockId] = useState('')
  const [busy, setBusy] = useState(null)

  const shipment = selectShipment(state, id)
  const loading = state.shipments.status === 'loading' || state.shipments.status === 'idle'
  const fcId = user?.orgId ?? 'fc-bhiwandi'

  // Time on site is a live figure, so the clock is state rather than a read.
  const now = useNow(30000)

  useDocumentTitle(shipment ? `Inbound ${shipment.id}` : 'Inbound')

  const docks = useMemo(() => db.docks.filter((d) => d.fcId === fcId), [fcId])
  const occupied = useMemo(
    () => new Set(state.shipments.ids.map((sid) => state.shipments.byId[sid]).filter((s) => s?.status === 'at_dock' && s.dockId).map((s) => s.dockId)),
    [state.shipments],
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
          title="Consignment not found"
          description={`Nothing inbound is recorded under ${id}.`}
          actionLabel="Back to the arrival board"
          actionTo="/fc/inbound"
        />
      </div>
    )
  }

  const minutesOnSite = shipment.gateInAt && !shipment.gateOutAt ? Math.round((now - shipment.gateInAt) / 60000) : null
  const detentionTone = minutesOnSite >= DETENTION_RED_MIN ? 'danger' : minutesOnSite >= DETENTION_AMBER_MIN ? 'warn' : 'success'
  const docIssues = shipment.documents.filter((d) => d.status === 'mismatch' || d.status === 'missing')

  const run = async (key, fn, successMessage) => {
    setBusy(key)
    try {
      const next = await fn()
      dispatch({ type: ACTIONS.SHIPMENTS_UPSERT, payload: next })
      toast.success(successMessage)
    } catch (err) {
      toast.error('Could not complete that', { description: err.message })
    } finally {
      setBusy(null)
    }
  }

  const onAssignDock = async () => {
    if (!dockId) return
    await run('dock', () => assignDock(shipment.id, dockId), `Dock assigned to ${shipment.id}`)
    setAssigning(false)
  }

  const tabs = [
    { value: 'journey', label: 'Journey', icon: 'navigation' },
    { value: 'documents', label: 'Documents', icon: 'file', count: docIssues.length || undefined },
    { value: 'condition', label: 'Condition', icon: 'activity' },
    { value: 'pod', label: 'Proof of delivery', icon: 'checkCircle' },
  ]

  return (
    <div className="page page-wide">
      <PageHeader
        breadcrumb={
          <nav className="row gap-6 t-sm c-muted mb-8" aria-label="Breadcrumb">
            <Link to="/fc/inbound" className="row gap-4">
              <Icon name="arrowLeft" size={13} />
              Arrival board
            </Link>
            <span aria-hidden="true">/</span>
            <span className="mono">{shipment.id}</span>
          </nav>
        }
        title={
          <span className="row gap-12 wrap">
            <span className="mono">{shipment.id}</span>
            <StatusPill status={shipment.status} />
            <DelayPill minutes={Math.round((shipment.predictedAt - shipment.slotStart) / 60000)} />
          </span>
        }
        subtitle={`${shipment.vendorName} · ${formatNumber(shipment.cartons)} cartons · ${shipment.vehicleReg}`}
        actions={<LiveIndicator paused={state.ui.livePaused || !state.ui.liveEnabled} />}
      />

      {docIssues.length ? (
        <Callout tone="danger" title={`${docIssues.length} document problem${docIssues.length > 1 ? 's' : ''} on this consignment`} className="mb-16">
          Do not gate this vehicle in until the vendor has re-issued the paperwork.{' '}
          <button type="button" className="btn btn-link" onClick={() => setTab('documents')}>
            Review documents
          </button>
        </Callout>
      ) : null}

      {minutesOnSite !== null ? (
        <Card className="mb-16">
          <CardBody>
            <div className="row between gap-16 wrap">
              <div className="row gap-12">
                <Icon name="clock" size={18} className={`c-${detentionTone === 'danger' ? 'danger' : detentionTone === 'warn' ? 'warn' : 'success'}`} />
                <div>
                  <p className="fw-600 c-strong">On site for {minutesOnSite} minutes</p>
                  <p className="t-sm c-muted">
                    Gated in at {formatTime(shipment.gateInAt)} · detention starts at {DETENTION_AMBER_MIN} min
                  </p>
                </div>
              </div>
              <div style={{ minWidth: 220, flex: '1 1 220px' }}>
                <Progress value={minutesOnSite} max={DETENTION_RED_MIN * 1.4} tone={detentionTone} label="Time on site" />
              </div>
              <Badge tone={detentionTone}>
                <span className="status-dot" aria-hidden="true" />
                {detentionTone === 'danger' ? 'Detention charged' : detentionTone === 'warn' ? 'Approaching detention' : 'Within free time'}
              </Badge>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* FC actions — the part a vendor does not get. */}
      <Card className="mb-16">
        <CardHeader title="Receiving actions" subtitle="What this desk can do to the consignment" />
        <CardBody>
          <div className="row gap-8 wrap">
            <Button
              variant="secondary"
              icon="dock"
              onClick={() => {
                setDockId(shipment.dockId ?? '')
                setAssigning(true)
              }}
            >
              {shipment.dockId ? 'Reassign dock' : 'Assign a dock'}
            </Button>

            <Button
              variant={shipment.status === 'in_transit' ? 'primary' : 'secondary'}
              icon="pin"
              disabled={Boolean(shipment.gateInAt) || shipment.status === 'delivered'}
              loading={busy === 'gatein'}
              onClick={() => run('gatein', () => gateIn(shipment.id), `${shipment.vehicleReg} gated in`)}
            >
              Mark gate-in
            </Button>

            <Button
              variant={shipment.status === 'at_gate' ? 'primary' : 'secondary'}
              icon="package"
              disabled={shipment.status !== 'at_gate'}
              loading={busy === 'at_dock'}
              onClick={() =>
                run('at_dock', () => advanceShipment(shipment.id, 'at_dock', { label: 'Unloading at dock', detail: 'Docked, quantity check in progress' }), 'Unloading started')
              }
            >
              Mark unloading
            </Button>

            <Button
              variant={shipment.status === 'at_dock' ? 'primary' : 'secondary'}
              icon="clipboard"
              disabled={shipment.status !== 'at_dock'}
              to={`/fc/receiving?shipment=${shipment.id}`}
            >
              Raise goods receipt
            </Button>

            <Button
              variant="secondary"
              icon="logout"
              disabled={!shipment.gateInAt || Boolean(shipment.gateOutAt)}
              loading={busy === 'gateout'}
              onClick={() => run('gateout', () => gateOut(shipment.id), `${shipment.vehicleReg} gated out`)}
            >
              Mark gate-out
            </Button>

            <Button variant="secondary" icon="phone" href={`tel:${shipment.driverPhone.replace(/\s/g, '')}`}>
              Call the driver
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="stack gap-16">
          <Card>
            <CardHeader title="Where the vehicle is" subtitle={`${formatNumber(shipment.remainingKm)} km out`} />
            <CardBody flush>
              <ShipmentMap shipments={[shipment]} selectedId={shipment.id} showRoutes="all" cluster={false} height={300} className="dm-map-flush" fitKey={shipment.id} />
            </CardBody>
          </Card>

          <Card>
            <CardBody flush>
              <div className="tabs-inset">
                <Tabs tabs={tabs} value={tab} onChange={setTab} label="Consignment detail sections" />
              </div>
              <div className="pad">
                <TabPanel value="journey" active={tab}>
                  <Timeline shipment={shipment} />
                </TabPanel>
                <TabPanel value="documents" active={tab}>
                  <DocumentStrip documents={shipment.documents} />
                </TabPanel>
                <TabPanel value="condition" active={tab}>
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
            <CardHeader title="Booking" />
            <CardBody className="stack gap-12">
              <DataPoint label="Vendor" value={shipment.vendorName} />
              <DataPoint label="Promised slot" value={formatDateTime(shipment.slotStart)} />
              <DataPoint label="Live ETA" value={formatDateTime(shipment.predictedAt)} />
              <DataPoint label="Assigned dock" value={shipment.dockId ? docks.find((d) => d.id === shipment.dockId)?.name ?? shipment.dockId : 'Not assigned'} />
              {shipment.gateInAt ? <DataPoint label="Gate-in" value={formatDateTime(shipment.gateInAt)} /> : null}
              {shipment.gateOutAt ? <DataPoint label="Gate-out" value={formatDateTime(shipment.gateOutAt)} /> : null}
              {shipment.delayReason ? (
                <Callout tone="warn" title="Delay reason">
                  {shipment.delayReason}
                </Callout>
              ) : null}
            </CardBody>
          </Card>

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
        </div>
      </div>

      <Modal
        open={assigning}
        onClose={() => setAssigning(false)}
        title="Assign a dock"
        description="Occupied bays are marked. The vendor and the driver are told immediately."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssigning(false)} disabled={busy === 'dock'}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onAssignDock} loading={busy === 'dock'} disabled={!dockId}>
              Assign dock
            </Button>
          </>
        }
      >
        <Select
          label="Dock"
          value={dockId}
          onChange={(e) => setDockId(e.target.value)}
          placeholder="Choose a dock"
          options={docks.map((d) => ({
            value: d.id,
            label: `${d.name} — ${d.type}${occupied.has(d.id) ? ' (occupied)' : ''}`,
          }))}
          hint={`This consignment needs a bay taking a ${shipment.vehicleType}.`}
        />
      </Modal>
    </div>
  )
}
