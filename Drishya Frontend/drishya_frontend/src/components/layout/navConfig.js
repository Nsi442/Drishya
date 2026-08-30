import { ROLE_PORTAL, PORTALS } from '../../lib/constants.js'
// Navigation is declared once and consumed by the sidebar, the command palette
// and the shortcuts sheet, so a new page appears in all three at once.

export const VENDOR_NAV = [
  { section: 'Operations' },
  { to: '/vendor', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/vendor/shipments', label: 'Shipments', icon: 'truck' },
  { to: '/vendor/live-map', label: 'Control tower', icon: 'map' },
  // Recorded backend telemetry, as opposed to the browser simulation above.
  { to: '/vendor/trips', label: 'Live trips', icon: 'navigation' },
  { to: '/vendor/appointments', label: 'Dock appointments', icon: 'calendar' },
  { section: 'Compliance' },
  { to: '/vendor/documents', label: 'Documents', icon: 'file' },
  { to: '/vendor/alerts', label: 'Alerts', icon: 'bell', badge: 'alerts' },
  { to: '/vendor/exceptions', label: 'Exceptions', icon: 'alert' },
  { section: 'Network' },
  { to: '/vendor/carriers', label: 'Carriers & vehicles', icon: 'package' },
  { to: '/vendor/drivers', label: 'Drivers', icon: 'users' },
  { to: '/vendor/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/vendor/settings', label: 'Settings', icon: 'settings' },
]

export const FC_NAV = [
  { section: 'Inbound' },
  { to: '/fc', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/fc/inbound', label: 'Arrival board', icon: 'truck' },
  { to: '/fc/yard', label: 'Yard & gate', icon: 'pin' },
  { to: '/fc/receiving', label: 'Receiving', icon: 'clipboard' },
  { section: 'Scheduling' },
  { to: '/fc/docks', label: 'Dock scheduler', icon: 'dock' },
  { to: '/fc/appointments', label: 'Appointment requests', icon: 'calendar', badge: 'requests' },
  { section: 'Oversight' },
  { to: '/fc/exceptions', label: 'Exceptions', icon: 'alert', badge: 'exceptions' },
  { to: '/fc/vendors', label: 'Vendor performance', icon: 'users' },
  { to: '/fc/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/fc/settings', label: 'Settings', icon: 'settings' },
]

export const DRIVER_TABS = [
  { to: '/driver', label: 'Today', icon: 'home', end: true },
  { to: '/driver/scan', label: 'Scan', icon: 'scan' },
  { to: '/driver/documents', label: 'Docs', icon: 'file' },
  { to: '/driver/history', label: 'History', icon: 'history' },
  { to: '/driver/profile', label: 'Profile', icon: 'user' },
]

// Extra destinations the command palette can reach that are not in the rail.
export const EXTRA_DESTINATIONS = {
  vendor: [
    { to: '/vendor/shipments/new', label: 'Create a shipment', icon: 'plus' },
    { to: '/vendor/settings', label: 'Notification preferences', icon: 'bell' },
  ],
  fc: [{ to: '/fc/settings', label: 'Dock configuration', icon: 'dock' }],
  driver: [
    { to: '/driver/incident', label: 'Report an incident', icon: 'alert' },
    { to: '/driver/scan', label: 'Scan a consignment', icon: 'scan' },
  ],
}

export function navFor(role) {
  // Keyed off the portal: vendor_admin and dispatcher share one sidebar.
  const portal = ROLE_PORTAL[role]
  if (portal === PORTALS.VENDOR) return VENDOR_NAV
  if (portal === PORTALS.FC) return FC_NAV
  return []
}
