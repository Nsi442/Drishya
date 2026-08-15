import { useMemo, useState, useEffect, useRef, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import { splitRoute } from '../../lib/geo.js'
import { SHIPMENT_STATUS } from '../../lib/constants.js'
import { formatTime } from '../../lib/format.js'
import { DelayPill, StatusPill } from '../ui/Badge.jsx'
import './map.css'

// OpenStreetMap raster tiles — no account, no key, no usage contract to sign.
const TILES = {
  light: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
}

const STATUS_COLOR = {
  booked: '#6b7c96',
  picked_up: '#175cd3',
  in_transit: '#0f9b8e',
  at_gate: '#6941c6',
  unloading: '#6941c6',
  delivered: '#067647',
  cancelled: '#b42318',
}

// divIcon rather than an image marker: no sprite to load, and the marker can
// carry a status colour and a pulse without another asset.
function vehicleIcon(shipment, selected) {
  const color = shipment.delayMin > 15 ? (shipment.delayMin > 90 ? '#b42318' : '#d98a0b') : STATUS_COLOR[shipment.status] ?? '#6b7c96'
  return L.divIcon({
    className: 'dm-marker-wrap',
    html: `<span class="dm-marker ${selected ? 'is-selected' : ''}" style="--marker:${color}">
             <span class="dm-marker-dot"></span>
           </span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function placeIcon(kind) {
  return L.divIcon({
    className: 'dm-marker-wrap',
    html: `<span class="dm-place dm-place-${kind}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function clusterIcon(count) {
  const size = count > 40 ? 46 : count > 12 ? 40 : 34
  return L.divIcon({
    className: 'dm-marker-wrap',
    html: `<span class="dm-cluster" style="width:${size}px;height:${size}px">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Grid clustering in screen space: project every point at the current zoom,
// drop it in a cell, and collapse cells holding more than one shipment. Cheap,
// stable as you pan, and it needs no clustering library.
function useClusters(shipments, cluster) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  })

  return useMemo(() => {
    if (!cluster || zoom >= 9) return { clusters: [], singles: shipments }

    const CELL = 62
    const cells = new Map()
    shipments.forEach((s) => {
      if (!s.position) return
      const pt = map.project([s.position.lat, s.position.lng], zoom)
      const key = `${Math.floor(pt.x / CELL)}:${Math.floor(pt.y / CELL)}`
      const bucket = cells.get(key) ?? []
      bucket.push(s)
      cells.set(key, bucket)
    })

    const clusters = []
    const singles = []
    cells.forEach((bucket) => {
      if (bucket.length === 1) {
        singles.push(bucket[0])
        return
      }
      const lat = bucket.reduce((sum, s) => sum + s.position.lat, 0) / bucket.length
      const lng = bucket.reduce((sum, s) => sum + s.position.lng, 0) / bucket.length
      clusters.push({ id: `cluster-${lat.toFixed(3)}-${lng.toFixed(3)}`, lat, lng, items: bucket })
    })

    return { clusters, singles }
  }, [shipments, cluster, zoom, map])
}

function ClusterLayer({ shipments, cluster, selectedId, onSelect }) {
  const map = useMap()
  const { clusters, singles } = useClusters(shipments, cluster)

  return (
    <>
      {clusters.map((c) => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={clusterIcon(c.items.length)}
          eventHandlers={{
            click: () => {
              // Zoom to the extent of what the cluster is hiding.
              const bounds = L.latLngBounds(c.items.map((s) => [s.position.lat, s.position.lng]))
              map.fitBounds(bounds.pad(0.35), { maxZoom: 11 })
            },
          }}
          keyboard
          alt={`Cluster of ${c.items.length} shipments`}
        />
      ))}

      {singles.map((s) => (
        <Marker
          key={s.id}
          position={[s.position.lat, s.position.lng]}
          icon={vehicleIcon(s, s.id === selectedId)}
          eventHandlers={{ click: () => onSelect?.(s.id) }}
          alt={`${s.id} — ${SHIPMENT_STATUS[s.status]?.label ?? s.status}`}
        >
          <Popup>
            <ShipmentPopup shipment={s} />
          </Popup>
        </Marker>
      ))}
    </>
  )
}

function ShipmentPopup({ shipment: s }) {
  return (
    <div className="dm-popup">
      <div className="row between gap-8">
        <Link to={`/vendor/shipments/${s.id}`} className="dm-popup-id">
          {s.id}
        </Link>
        <StatusPill status={s.status} size="sm" />
      </div>
      <p className="dm-popup-lane">{s.lane}</p>
      <dl className="dm-popup-list">
        <div>
          <dt>Vehicle</dt>
          <dd>{s.vehicleReg}</dd>
        </div>
        <div>
          <dt>Driver</dt>
          <dd>{s.driverName}</dd>
        </div>
        <div>
          <dt>ETA</dt>
          <dd>{formatTime(s.predictedAt)}</dd>
        </div>
        <div>
          <dt>Left</dt>
          <dd>{s.remainingKm} km</dd>
        </div>
      </dl>
      <DelayPill minutes={s.delayMin} size="sm" />
    </div>
  )
}

// Keeps the viewport in step with what the page is showing without fighting
// the user: it only refits when the set of shipments actually changes.
function ViewController({ shipments, selectedId, fitKey }) {
  const map = useMap()
  const lastFit = useRef(null)

  useEffect(() => {
    const points = shipments.filter((s) => s.position).map((s) => [s.position.lat, s.position.lng])
    if (!points.length) return
    if (lastFit.current === fitKey) return
    lastFit.current = fitKey
    map.fitBounds(L.latLngBounds(points).pad(0.2), { animate: false, maxZoom: 8 })
  }, [shipments, map, fitKey])

  useEffect(() => {
    if (!selectedId) return
    const s = shipments.find((x) => x.id === selectedId)
    if (s?.position) map.flyTo([s.position.lat, s.position.lng], Math.max(map.getZoom(), 8), { duration: 0.6 })
  }, [selectedId, shipments, map])

  return null
}

// Leaflet measures its container on creation; if the map is mounted inside a
// panel that resizes (sidebar collapse, drawer open) it needs telling.
function ResizeWatcher() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    // One deferred call catches the initial layout pass.
    const t = setTimeout(() => map.invalidateSize(), 120)
    return () => {
      ro.disconnect()
      clearTimeout(t)
    }
  }, [map])
  return null
}

export default function ShipmentMap({
  shipments = [],
  selectedId,
  onSelect,
  showRoutes = 'selected',
  cluster = true,
  height = 420,
  className,
  interactive = true,
  fitKey,
}) {
  const withPosition = shipments.filter((s) => s.position)
  const centre = withPosition[0]?.position ?? { lat: 20.9, lng: 77.5 }

  const routed = useMemo(() => {
    if (showRoutes === false) return []
    if (showRoutes === 'all') return withPosition
    return withPosition.filter((s) => s.id === selectedId)
  }, [showRoutes, withPosition, selectedId])

  return (
    <div className={`dm-map ${className ?? ''}`} style={{ height }}>
      <MapContainer
        center={[centre.lat, centre.lng]}
        zoom={6}
        scrollWheelZoom={interactive}
        dragging={interactive}
        zoomControl={false}
        attributionControl
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={TILES.light.url} attribution={TILES.light.attribution} maxZoom={19} />
        {interactive ? <ZoomControl position="bottomright" /> : null}

        {routed.map((s) => {
          const { travelled, remaining } = splitRoute(s.route, s.progress)
          return (
            // Fragment, not a div — anything rendered here must be a Leaflet
            // layer, and a stray DOM node lands inside the map pane.
            <Fragment key={`route-${s.id}`}>
              <Polyline
                positions={remaining.map((p) => [p.lat, p.lng])}
                pathOptions={{ color: '#98a5ba', weight: 3, opacity: 0.75, dashArray: '5 6' }}
              />
              <Polyline
                positions={travelled.map((p) => [p.lat, p.lng])}
                pathOptions={{ color: STATUS_COLOR[s.status] ?? '#0f9b8e', weight: 4, opacity: 0.95 }}
              />
              <Marker position={[s.origin.lat, s.origin.lng]} icon={placeIcon('origin')} alt={`Origin: ${s.origin.name}`}>
                <Popup>
                  <strong>Pickup</strong>
                  <br />
                  {s.origin.name}
                </Popup>
              </Marker>
              <Marker position={[s.destination.lat, s.destination.lng]} icon={placeIcon('destination')} alt={`Destination: ${s.destination.name}`}>
                <Popup>
                  <strong>Fulfilment centre</strong>
                  <br />
                  {s.destination.name}
                </Popup>
              </Marker>
              {s.id === selectedId ? (
                <CircleMarker
                  center={[s.position.lat, s.position.lng]}
                  radius={16}
                  pathOptions={{ color: STATUS_COLOR[s.status], weight: 1, fillOpacity: 0.12 }}
                />
              ) : null}
            </Fragment>
          )
        })}

        <ClusterLayer shipments={withPosition} cluster={cluster} selectedId={selectedId} onSelect={onSelect} />
        <ViewController shipments={withPosition} selectedId={selectedId} fitKey={fitKey ?? withPosition.length} />
        <ResizeWatcher />
      </MapContainer>
    </div>
  )
}
