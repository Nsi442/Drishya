import { Link } from 'react-router-dom'
import { DOC_TYPES } from '../../lib/constants.js'
import { formatDateTime, formatTime, formatRelative, formatNumber, formatCurrency } from '../../lib/format.js'
import { StatusPill, DelayPill } from '../ui/Badge.jsx'
import Badge from '../ui/Badge.jsx'
import Button, { IconButton } from '../ui/Button.jsx'
import Avatar from '../ui/Avatar.jsx'
import Icon from '../ui/Icon.jsx'
import { Progress, DataPoint, Callout } from '../ui/Misc.jsx'
import './shipment.css'

// The ETA panel — the single most-read thing on the detail page. Promised and
// predicted sit side by side because the gap between them is the product.
export function ETAPanel({ shipment }) {
  const late = shipment.delayMin > 15
  const pct = Math.round(shipment.progress * 100)

  return (
    <div className="eta-panel">
      <div className="eta-row">
        <div className="kv">
          <span className="kv-label">Promised slot</span>
          <span className="kv-value">{formatDateTime(shipment.promisedAt)}</span>
        </div>
        <Icon name="arrowRight" size={16} className="c-subtle shrink-0" />
        <div className="kv">
          <span className="kv-label">Predicted arrival</span>
          <span className={`kv-value ${late ? 'c-danger' : 'c-success'}`}>{formatDateTime(shipment.predictedAt)}</span>
        </div>
        <DelayPill minutes={shipment.delayMin} />
      </div>

      {shipment.status !== 'delivered' && shipment.status !== 'cancelled' ? (
        <div className="eta-progress">
          <div className="row between t-sm c-muted mb-8">
            <span>
              {formatNumber(shipment.distanceKm - shipment.remainingKm)} km covered
            </span>
            <span>{formatNumber(shipment.remainingKm)} km to go</span>
          </div>
          <Progress value={pct} tone={late ? 'warn' : 'accent'} label={`${pct}% of the journey complete`} />
          <div className="row between t-xs c-subtle mt-4">
            <span>{shipment.origin.name}</span>
            <span>{shipment.destination.name}</span>
          </div>
        </div>
      ) : null}

      {shipment.delayReason ? (
        <Callout tone="warn" title="Why it is running late">
          {shipment.delayReason}
          {shipment.speedKmph ? ` · currently moving at ${shipment.speedKmph} km/h` : ''}
        </Callout>
      ) : null}
    </div>
  )
}

export function DriverVehicleCard({ shipment, onCall }) {
  return (
    <div className="dv-card">
      <div className="dv-person">
        <Avatar name={shipment.driverName} size="lg" />
        <div className="grow" style={{ minWidth: 0 }}>
          <p className="fw-600 c-strong truncate">{shipment.driverName}</p>
          <p className="t-sm c-muted">{shipment.driverPhone}</p>
        </div>
        {onCall ? (
          <Button variant="secondary" size="sm" icon="phone" onClick={() => onCall(shipment.driverPhone)}>
            Call
          </Button>
        ) : (
          <Button variant="secondary" size="sm" icon="phone" href={`tel:${shipment.driverPhone.replace(/\s/g, '')}`}>
            Call
          </Button>
        )}
      </div>

      <dl className="dl pad-tight">
        <dt>Vehicle</dt>
        <dd className="mono">{shipment.vehicleReg}</dd>
        <dt>Type</dt>
        <dd>{shipment.vehicleType}</dd>
        <dt>Carrier</dt>
        <dd>{shipment.carrier}</dd>
        <dt>Seal number</dt>
        <dd className="mono">{shipment.sealNumber}</dd>
        {shipment.speedKmph ? (
          <>
            <dt>Speed</dt>
            <dd>{shipment.speedKmph} km/h</dd>
          </>
        ) : null}
      </dl>
    </div>
  )
}

export function ConsignmentSummary({ shipment }) {
  return (
    <dl className="dl">
      <dt>Reference</dt>
      <dd className="mono">{shipment.reference}</dd>
      <dt>Commodity</dt>
      <dd>{shipment.commodity}</dd>
      <dt>Cartons</dt>
      <dd>{formatNumber(shipment.cartons)}</dd>
      <dt>Gross weight</dt>
      <dd>{formatNumber(shipment.weightKg)} kg</dd>
      <dt>Declared value</dt>
      <dd>{formatCurrency(shipment.valueInr)}</dd>
      <dt>Invoice</dt>
      <dd className="mono">{shipment.invoiceNo}</dd>
      <dt>E-way bill</dt>
      <dd className="mono">{shipment.ewayBillNo}</dd>
      <dt>Lane</dt>
      <dd>{shipment.lane}</dd>
      <dt>Distance</dt>
      <dd>{formatNumber(shipment.distanceKm)} km</dd>
    </dl>
  )
}

// Compact document status list used on the shipment detail page and in the
// FC's inbound view.
export function DocumentStrip({ documents, onOpen, onReupload }) {
  return (
    <ul className="doc-strip">
      {documents.map((doc) => (
        <li key={doc.id} className="doc-strip-item">
          <span className={`doc-icon is-${doc.status}`}>
            <Icon name={doc.status === 'valid' ? 'checkCircle' : doc.status === 'missing' ? 'alertCircle' : 'file'} size={15} />
          </span>

          <span className="grow" style={{ minWidth: 0 }}>
            <span className="row gap-8">
              <strong className="t-md c-strong">{DOC_TYPES[doc.type]}</strong>
              <StatusPill status={doc.status} kind="document" size="sm" />
            </span>
            <span className="t-sm c-muted truncate">
              {doc.number ?? 'Not uploaded'}
              {doc.note ? ` · ${doc.note}` : ''}
            </span>
          </span>

          <span className="row gap-4 shrink-0">
            {doc.number && onOpen ? <IconButton icon="eye" label={`Preview ${DOC_TYPES[doc.type]}`} onClick={() => onOpen(doc)} /> : null}
            {onReupload ? <IconButton icon="upload" label={`Re-upload ${DOC_TYPES[doc.type]}`} onClick={() => onReupload(doc)} /> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PODPanel({ shipment }) {
  const pod = shipment.pod
  if (!pod) {
    return (
      <div className="pod-pending">
        <Icon name="clock" size={18} className="c-subtle" />
        <div>
          <p className="fw-600 c-strong">Proof of delivery not captured yet</p>
          <p className="t-sm c-muted">
            The driver captures a signature, photos and the received count at the dock. It appears here the moment it syncs.
          </p>
        </div>
      </div>
    )
  }

  const short = shipment.cartons - (pod.cartonsReceived ?? shipment.cartons)

  return (
    <div className="stack gap-16">
      <div className="grid grid-3">
        <DataPoint label="Received by" value={pod.receiverName} />
        <DataPoint label="Signed at" value={formatDateTime(pod.receivedAt)} />
        <DataPoint label="Cartons received" value={`${formatNumber(pod.cartonsReceived ?? shipment.cartons)} of ${formatNumber(shipment.cartons)}`} />
      </div>

      {short > 0 ? (
        <Callout tone="danger" title={`Short by ${short} carton${short > 1 ? 's' : ''}`}>
          Raised as a quantity shortage exception against this consignment at receiving.
        </Callout>
      ) : null}

      {pod.damageNote ? (
        <Callout tone="warn" title="Damage noted at the dock">
          {pod.damageNote}
        </Callout>
      ) : null}

      <div>
        <p className="eyebrow mb-8">Signature</p>
        <div className="pod-signature">
          <svg viewBox="0 0 300 90" width="100%" height="80" aria-label={`Signature captured from ${pod.receiverName}`} role="img">
            <path
              d="M12 62 C 34 22, 52 22, 62 50 S 84 76, 98 44 C 108 22, 126 26, 132 52 C 138 74, 156 70, 168 46 C 178 26, 198 30, 204 54 C 210 74, 232 68, 246 40 C 254 24, 274 26, 288 38"
              fill="none"
              stroke="var(--text-strong)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      <div>
        <p className="eyebrow mb-8">Photographs ({pod.photos})</p>
        <div className="row gap-8 wrap">
          {Array.from({ length: pod.photos }, (_, i) => (
            <div key={i} className="pod-photo">
              <Icon name="image" size={20} />
              <span className="t-xs">Dock {i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// One row in a list of shipments — used on dashboards and in side panels where
// a full table would be too heavy.
export function ShipmentRow({ shipment, to, onClick, active, showVendor = false }) {
  const Wrapper = to ? Link : 'button'
  const props = to ? { to } : { type: 'button', onClick }

  return (
    <Wrapper {...props} className={`ship-row ${active ? 'is-active' : ''}`}>
      <span className="row between gap-8">
        <span className="mono fw-600 c-strong t-md">{shipment.id}</span>
        <StatusPill status={shipment.status} size="sm" />
      </span>

      <span className="row between gap-8 mt-4">
        <span className="t-sm c-muted truncate">{showVendor ? shipment.vendorName : shipment.lane}</span>
        <DelayPill minutes={shipment.delayMin} size="sm" />
      </span>

      <span className="row between gap-8 mt-4 t-xs c-subtle">
        <span>{shipment.vehicleReg}</span>
        <span>
          ETA {formatTime(shipment.predictedAt)} · {formatRelative(shipment.predictedAt)}
        </span>
      </span>
    </Wrapper>
  )
}

export function ShipmentBreadcrumb({ shipment, backTo, backLabel }) {
  return (
    <nav className="row gap-6 t-sm c-muted mb-8" aria-label="Breadcrumb">
      <Link to={backTo} className="row gap-4">
        <Icon name="arrowLeft" size={13} />
        {backLabel}
      </Link>
      <span aria-hidden="true">/</span>
      <span className="mono">{shipment.id}</span>
      {shipment.priority === 'high' ? (
        <Badge tone="warn" size="sm" icon="flag">
          Priority
        </Badge>
      ) : null}
    </nav>
  )
}
