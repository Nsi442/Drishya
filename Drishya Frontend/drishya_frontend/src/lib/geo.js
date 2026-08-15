// Lightweight route helpers — enough to drive believable map animation
// without pulling in a routing engine. Routes are 2-4 waypoints between an
// origin and destination, gently bowed so they don't look like straight rulers.

export function buildRoute(origin, destination, rng) {
  const midLat = (origin.lat + destination.lat) / 2
  const midLng = (origin.lng + destination.lng) / 2
  const dx = destination.lng - origin.lng
  const dy = destination.lat - origin.lat
  const bow = (rng() - 0.5) * 0.35
  const wp1 = { lat: midLat - dx * bow, lng: midLng + dy * bow }
  return [origin, wp1, destination]
}

export function routeLength(points) {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += haversine(points[i - 1], points[i])
  }
  return total
}

export function haversine(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Splits a route at `progress` so the covered leg and the leg still to drive
// can be drawn in different weights — the map should show what has happened
// as clearly as what is still to come.
export function splitRoute(points, progress) {
  const clamped = Math.min(Math.max(progress, 0), 1)
  const at = positionAlongRoute(points, clamped)

  const segLengths = []
  for (let i = 1; i < points.length; i += 1) segLengths.push(haversine(points[i - 1], points[i]))
  const total = segLengths.reduce((a, b) => a + b, 0)
  if (total === 0) return { travelled: [points[0]], remaining: points }

  let target = clamped * total
  let cut = 0
  for (let i = 0; i < segLengths.length; i += 1) {
    if (target <= segLengths[i]) {
      cut = i
      break
    }
    target -= segLengths[i]
    cut = i + 1
  }

  return {
    travelled: [...points.slice(0, cut + 1), at],
    remaining: [at, ...points.slice(cut + 1)],
  }
}

// progress: 0..1 along the polyline. Returns { lat, lng }.
export function positionAlongRoute(points, progress) {
  const clamped = Math.min(Math.max(progress, 0), 1)
  const segLengths = []
  for (let i = 1; i < points.length; i += 1) segLengths.push(haversine(points[i - 1], points[i]))
  const total = segLengths.reduce((a, b) => a + b, 0)
  if (total === 0) return points[0]

  let target = clamped * total
  for (let i = 0; i < segLengths.length; i += 1) {
    if (target <= segLengths[i]) {
      const t = segLengths[i] === 0 ? 0 : target / segLengths[i]
      const a = points[i]
      const b = points[i + 1]
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
    }
    target -= segLengths[i]
  }
  return points[points.length - 1]
}
