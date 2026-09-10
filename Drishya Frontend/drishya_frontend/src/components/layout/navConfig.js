import { ROLE_PORTAL, PORTALS } from '../../lib/constants.js'
// Navigation is declared once and consumed by the sidebar, the command palette
// and the shortcuts sheet, so a new page appears in all three at once.
//
// THE RAIL IS RANKED, NOT EXHAUSTIVE.
//
// It used to list every page in the portal — eleven links under three section
// headings for a vendor, ten for a receiving desk — and the first thing a new
// user saw was a wall of equally weighted options with nothing to say which
// one their job starts at. Everything below `{ more: true }` moves into a
// collapsed "More" group: one click away, still searchable in the palette,
// no longer competing with the daily path.
//
// Deciding what stays above the line is the whole exercise. The test is
// whether someone doing this job would open it *today*, not whether the page
// is good. Analytics is a fine page nobody opens before lunch.
//
// Settings is in neither list on purpose. The sidebar footer's user card
// already links there, which is where every other product of this shape puts
// it, and a duplicate rail entry was buying nothing.

export const VENDOR_NAV = [
  { to: '/vendor', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/vendor/shipments', label: 'Shipments', icon: 'truck' },
  { to: '/vendor/live-map', label: 'Control tower', icon: 'map' },
  // Live trips (/vendor/trips) is deliberately absent from here.
  //
  // Two map pages side by side in one sidebar invite the confusion this
  // project has already had: both were once reported as "the live trips page
  // not working" while the fault was only ever in Control tower. The route,
  // the page, and the links to it from the Start trip card all still work —
  // it stays reachable directly, and it is still the only view drawn from
  // recorded backend telemetry rather than the browser simulation.
  { to: '/vendor/appointments', label: 'Dock appointments', icon: 'calendar' },
  { to: '/vendor/documents', label: 'Documents', icon: 'file' },
  { to: '/vendor/alerts', label: 'Alerts', icon: 'bell', badge: 'alerts' },
  { more: true },
  { to: '/vendor/exceptions', label: 'Exceptions', icon: 'alert' },
  { to: '/vendor/carriers', label: 'Carriers & vehicles', icon: 'package' },
  { to: '/vendor/drivers', label: 'Drivers', icon: 'users' },
  { to: '/vendor/analytics', label: 'Analytics', icon: 'chart' },
]

export const FC_NAV = [
  { to: '/fc', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/fc/inbound', label: 'Arrival board', icon: 'truck' },
  { to: '/fc/yard', label: 'Yard & gate', icon: 'pin' },
  { to: '/fc/receiving', label: 'Receiving', icon: 'clipboard' },
  { to: '/fc/docks', label: 'Dock scheduler', icon: 'dock' },
  // 'Appointment requests' did not fit the rail and rendered as
  // "Appointment reque…", which is worse than the shorter true name.
  { to: '/fc/appointments', label: 'Appointments', icon: 'calendar', badge: 'requests' },
  { more: true },
  // Badged, and therefore the reason the "More" summary carries a count of its
  // own: burying a number a receiving desk is meant to act on would trade one
  // usability problem for a worse one.
  { to: '/fc/exceptions', label: 'Exceptions', icon: 'alert', badge: 'exceptions' },
  { to: '/fc/vendors', label: 'Vendor performance', icon: 'users' },
  { to: '/fc/analytics', label: 'Analytics', icon: 'chart' },
]

export const DRIVER_TABS = [
  { to: '/driver', label: 'Today', icon: 'home', end: true },
  { to: '/driver/scan', label: 'Scan', icon: 'scan' },
  { to: '/driver/documents', label: 'Docs', icon: 'file' },
  { to: '/driver/history', label: 'History', icon: 'history' },
  { to: '/driver/profile', label: 'Profile', icon: 'user' },
]

// Extra destinations the command palette can reach that are not in the rail
// at all. Keyed by PORTAL, not by role — see portalFor below.
export const EXTRA_DESTINATIONS = {
  [PORTALS.VENDOR]: [
    { to: '/vendor/shipments/new', label: 'Create a shipment', icon: 'plus' },
    { to: '/vendor/trips', label: 'Live trips', icon: 'navigation' },
    { to: '/vendor/settings', label: 'Settings', icon: 'settings' },
  ],
  [PORTALS.FC]: [
    { to: '/fc/settings', label: 'Settings', icon: 'settings' },
    { to: '/fc/settings', label: 'Dock configuration', icon: 'dock' },
  ],
  [PORTALS.DRIVER]: [
    { to: '/driver/incident', label: 'Report an incident', icon: 'alert' },
    { to: '/driver/scan', label: 'Scan a consignment', icon: 'scan' },
  ],
}

/**
 * The portal a role belongs to.
 *
 * EXTRA_DESTINATIONS was keyed 'vendor'/'fc'/'driver' but looked up by ROLE,
 * which is 'vendor_admin'/'dispatcher'/'fc'/'driver'. It worked for a driver
 * and a receiving desk only because those two names coincide; for either
 * vendor role the lookup returned undefined, so "Create a shipment" — the
 * palette's single most useful entry — has never once appeared for the people
 * whose job it is. It fails silently, which is why it survived.
 *
 * That was survivable while the rail listed everything. It is not survivable
 * now the rail is ranked and the palette is the way to the rest.
 */
export function portalFor(role) {
  return ROLE_PORTAL[role] ?? PORTALS.VENDOR
}

export function navFor(role) {
  // Keyed off the portal: vendor_admin and dispatcher share one sidebar.
  const portal = portalFor(role)
  if (portal === PORTALS.VENDOR) return VENDOR_NAV
  if (portal === PORTALS.FC) return FC_NAV
  return []
}

/** Everything the palette can jump to: rail links, the "More" group, and extras. */
export function destinationsFor(role) {
  return [...navFor(role).filter((n) => n.to), ...(EXTRA_DESTINATIONS[portalFor(role)] ?? [])]
}
