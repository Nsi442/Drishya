// The v1 API: trips, position traces, ASN validation, evidence packs and
// prediction accuracy.
//
// Kept apart from shipmentService because it talks to a different surface. The
// older endpoints live at /api/**, unversioned, and a hundred-odd files call
// them that way; these are at /api/v1/** because that is what the specification
// names. client.js already prefixes /api, so the paths here start at /v1.

import { get, post, del } from './client.js'

// --- trips ------------------------------------------------------------------

/** Active trips for the signed-in tenant. One marker each on the live map. */
export function listActiveTrips() {
  return get('/v1/trips/active', { label: 'loading active trips' })
}

export function getTrip(tripId) {
  return get(`/v1/trips/${tripId}`, { label: 'loading the trip' })
}

/**
 * The recorded trace, in the order it was driven.
 *
 * Note this is the *actual* path from position fixes, not the planned route the
 * shipment was booked with. The gap between the two is worth seeing — a vehicle
 * that took a diversion shows it here and nowhere else.
 */
export function getTripPositions(tripId) {
  return get(`/v1/trips/${tripId}/positions`, { label: 'loading the position trace' })
}

export function startTrip(shipmentId, { vehicleRegistration, driverId } = {}) {
  return post(`/v1/trips/from-shipment/${shipmentId}`, { vehicleRegistration, driverId },
    { label: 'starting the trip' })
}

export function completeTrip(tripId) {
  return post(`/v1/trips/${tripId}/complete`, undefined, { label: 'closing the trip' })
}

/** Every trip against one consignment, most recent first. Usually none or one. */
export function listTripsForShipment(shipmentId) {
  return get(`/v1/trips/by-shipment/${shipmentId}`, { label: 'checking for a running trip' })
}

// --- server-side vehicle simulation -----------------------------------------
//
// The hosted equivalent of running simulator/simulate.py. The backend drives
// the vehicle along the shipment's own route and ingests SIMULATED fixes on a
// timer, so unlike the browser simulation in hooks/useLiveShipments.js it keeps
// going with no tab open. That is the whole reason it is server-side: a demo
// left running over lunch has actually moved by the time somebody looks.

/**
 * Starts a vehicle on a trip. Both options have server-side defaults.
 *
 * `timeScale` is simulated seconds per real second — 60 puts a 130 km lane at
 * a couple of minutes. Pass 1 for real time, which is the honest setting if you
 * are measuring anything rather than showing somebody.
 */
export function startSimulation(tripId, { speedKmph, timeScale } = {}) {
  return post(`/v1/trips/${tripId}/simulation`, { speedKmph, timeScale },
    { label: 'starting the vehicle' })
}

export function stopSimulation(tripId) {
  return del(`/v1/trips/${tripId}/simulation`, { label: 'stopping the vehicle' })
}

/** Throws a 404 ServiceError when the trip has never been simulated. */
export function getSimulation(tripId) {
  return get(`/v1/trips/${tripId}/simulation`, { label: 'reading the vehicle' })
}

/**
 * The vendor's exception queue: predicted delays and rejected notices.
 *
 * Derived on the backend from real trip events, so every row points at a trip
 * that genuinely has that event on its timeline. Clicking through always lands
 * somewhere coherent.
 */
export function listExceptions() {
  return get('/v1/exceptions', { label: 'loading the exception queue' })
}

// --- advance shipping notice ------------------------------------------------

/**
 * Validates without committing anything.
 *
 * This is what the form calls as the vendor fills it in. It changes no state,
 * so it is safe to call on every blur — `submitAsn` is the one that decides
 * whether the consignment may leave.
 */
export function checkAsn(shipmentId, asn) {
  return post(`/v1/shipments/${shipmentId}/asn/check`, asn, { label: 'checking the notice' })
}

/**
 * Submits for real.
 *
 * Returns 200 with `dispatchAllowed: false` and the reasons when the notice is
 * rejected — a rejection is a successful validation with a negative answer, not
 * an HTTP error. Branch on `dispatchAllowed`, and always show `failures`: a
 * boolean tells a vendor their paperwork is wrong without telling them which
 * field or what was expected, which is the whole value of the feature.
 */
export function submitAsn(shipmentId, asn) {
  return post(`/v1/shipments/${shipmentId}/asn`, asn, { label: 'submitting the notice' })
}

// --- evidence ---------------------------------------------------------------

export function getEvidencePack(shipmentId) {
  return get(`/v1/shipments/${shipmentId}/evidence-pack`, { label: 'building the evidence pack' })
}

/**
 * Saves the pack as a file.
 *
 * Built from the already-fetched JSON rather than hitting the download endpoint,
 * so the bearer token never has to travel in a URL — it is held in memory only
 * and an `<a href>` to a protected endpoint could not carry it anyway.
 */
export async function downloadEvidencePack(shipmentId) {
  const pack = await getEvidencePack(shipmentId)
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `evidence-${shipmentId}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  return pack
}

// --- accuracy ---------------------------------------------------------------

/**
 * Mean absolute error of the ETA engine, overall and per lane.
 *
 * `meanAbsoluteErrorMinutes` is null until a trip with predictions against it
 * actually docks; the response carries a `note` saying so. Render the note
 * rather than a zero — "no data yet" and "perfectly accurate" must never look
 * the same.
 */
export function getEtaAccuracy() {
  return get('/v1/metrics/eta-accuracy', { label: 'loading prediction accuracy' })
}
