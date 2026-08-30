import { Fragment, useEffect, useMemo } from 'react'
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import { formatTime } from '../../lib/format.js'
import './map.css'

/**
 * The live map, drawn from what the backend actually recorded.
 *
 * Distinct from ShipmentMap, which renders the browser-side simulation in
 * hooks/useLiveShipments.js along a shipment's *planned* polyline. This one
 * draws position fixes that were ingested, geofenced and stored — so a vehicle
 * that took a diversion appears off its planned route here and nowhere else.
 *
 * Three layers, and the middle one is the point:
 *
 *   1. geofence circles, at each fulfilment centre's real radius
 *   2. the driven trace, from position fixes in device-time order
 *   3. one marker per active trip, at its last known fix
 *
 * Drawing the fence at its true radius rather than a fixed pixel ring is what
 * makes a gate-in timestamp explicable: the vehicle is visibly inside the circle
 * at the moment the event fired.
 */
export default function TripMap({ trips = [], traces = {}, centres = [], height = 460 }) {
  const positioned = useMemo(
    () => trips.filter((t) => t.lastLat != null && t.lastLon != null),
    [trips],
  )

  // What the camera has to contain: the vehicles and the road they have
  // covered. Deliberately NOT every fulfilment centre.
  //
  // Including all four sites stretched the bounds across fifteen degrees of
  // latitude, and fitting that into a wide, short panel forced a zoom where the
  // horizontal span reached from Africa to China. The fit was arithmetically
  // right and useless. Sites with no vehicle heading to them do not need to be
  // in frame; their geofences still draw when the view happens to cover them.
  const points = useMemo(() => {
    const p = positioned.map((t) => [t.lastLat, t.lastLon])
    positioned.forEach((t) => {
      const trace = traces[t.tripId]
      if (trace && trace.length) {
        // Endpoints are enough to bound a trace, and far cheaper than folding
        // in several hundred fixes on every poll.
        p.push([trace[0].lat, trace[0].lon])
        p.push([trace[trace.length - 1].lat, trace[trace.length - 1].lon])
      }
    })
    return p
  }, [positioned, traces])

  // Averaging the coordinates and fixing the zoom put the camera in empty
  // countryside between two vehicles 800 km apart — the map was correct and
  // showed neither of them. Bounds are computed from the content instead.
  const centre = points.length > 0
    ? [points.reduce((a, p) => a + p[0], 0) / points.length,
       points.reduce((a, p) => a + p[1], 0) / points.length]
    : [21.0, 78.0]

  return (
    <div className="dm-map" style={{ height }}>
      <MapContainer
        center={centre}
        zoom={5}
        zoomControl={false}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <FitToContent points={points} />
        {/* OpenStreetMap raster. No key, no bill, no third party. */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <ZoomControl position="bottomright" />

        {/* --- 1. geofences ------------------------------------------------ */}
        {centres
          .filter((fc) => fc.dockLat != null && fc.dockLng != null)
          .map((fc) => (
            // Fragment, not a div: a bare element inside MapContainer lands in
            // the map pane and breaks it.
            <Fragment key={`fence-${fc.id}`}>
              <Circle
                center={[fc.dockLat, fc.dockLng]}
                radius={fc.geofenceRadiusM}
                pathOptions={{
                  color: 'var(--chart-3)',
                  weight: 1,
                  opacity: 0.7,
                  fillOpacity: 0.08,
                }}
              >
                <Popup>
                  <strong>{fc.name}</strong>
                  <br />
                  Arrival geofence · {fc.geofenceRadiusM} m
                  <br />
                  <span className="dm-popup-muted">
                    Drawn around the receiving bays, not the site centroid.
                  </span>
                </Popup>
              </Circle>
              <Marker position={[fc.dockLat, fc.dockLng]} icon={dockIcon()} alt={fc.name}>
                <Popup>
                  <strong>{fc.name}</strong>
                  <br />
                  {fc.docks} bays · {fc.city}
                </Popup>
              </Marker>
            </Fragment>
          ))}

        {/* --- 2. driven traces --------------------------------------------- */}
        {positioned.map((trip) => {
          const trace = traces[trip.tripId]
          if (!trace || trace.length < 2) return null
          return (
            <Polyline
              key={`trace-${trip.tripId}`}
              positions={trace.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: 'var(--chart-1)', weight: 3, opacity: 0.75 }}
            />
          )
        })}

        {/* --- 3. vehicles --------------------------------------------------- */}
        {positioned.map((trip) => (
          <Marker
            key={trip.tripId}
            position={[trip.lastLat, trip.lastLon]}
            icon={vehicleIcon(trip.risk)}
            alt={trip.vehicleRegistration ?? trip.tripId}
          >
            <Popup>
              <strong>{trip.vehicleRegistration ?? trip.tripId}</strong>
              <br />
              {trip.shipmentReference ?? trip.shipmentId}
              {trip.laneCode ? <> · {trip.laneCode}</> : null}
              <br />
              {trip.predictedDockInAt ? (
                <>
                  Predicted dock-in {formatTime(trip.predictedDockInAt)}
                  <br />
                </>
              ) : (
                <>
                  <span className="dm-popup-muted">Awaiting a first fix</span>
                  <br />
                </>
              )}
              {/* Provenance, on the face of the popup. A simulated fix and a
                  device-reported one carry different evidentiary weight and
                  must stay distinguishable everywhere they are shown. */}
              <span className="dm-popup-muted">
                Last fix {trip.lastFixAt ? formatTime(trip.lastFixAt) : '—'} ·{' '}
                {trip.lastSource === 'browser' ? 'device reported' : 'simulated'}
              </span>
              <br />
              <Link to={`/vendor/shipments/${trip.shipmentId}`}>Open shipment</Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {positioned.length === 0 && (
        <div className="dm-map-note">
          No active trip is reporting a position. Start one from a shipment, or run
          the simulator against this API.
        </div>
      )}
    </div>
  )
}

/**
 * Frames the map on its contents.
 *
 * <p>A child component rather than a prop, because fitting bounds needs the map
 * instance and useMap only works inside MapContainer. Re-runs when the points
 * change, so a vehicle moving off the edge pulls the view back rather than
 * quietly leaving the frame.
 */
function FitToContent({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return

    // Tell Leaflet how big it is before asking it to fit anything.
    //
    // The map mounts before the wrapper's height applies, so on the first pass
    // it believes its viewport is a few pixels tall. fitBounds against that
    // zooms all the way out — the markers were correctly placed and the camera
    // was showing Africa to China. invalidateSize re-measures the container
    // first, and the frame lands where the content is.
    map.invalidateSize()

    if (points.length === 1) {
      map.setView(points[0], 9)
      return
    }
    map.fitBounds(points, { padding: [48, 48], maxZoom: 11 })
  }, [map, points])
  return null
}

/**
 * divIcons throughout, which sidesteps Leaflet's broken default-icon-URL
 * problem entirely rather than patching around it.
 */
function vehicleIcon(risk) {
  const tone =
    risk === 'late' ? 'late' : risk === 'at_risk' ? 'at-risk' : risk === 'early' ? 'early' : 'ok'
  return L.divIcon({
    className: '',
    html: `<span class="dm-vehicle ${tone}" aria-hidden="true"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function dockIcon() {
  return L.divIcon({
    className: '',
    html: '<span class="dm-dock" aria-hidden="true"></span>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}
