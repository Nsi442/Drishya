// The shared vocabulary. Anything that renders a status reads its label and
// tone from here, so a pill in the vendor table and the same pill on the FC
// arrival board can never drift apart.

export const ROLES = {
  VENDOR: 'vendor',
  DRIVER: 'driver',
  FC: 'fc',
}

export const ROLE_LABEL = {
  vendor: 'Vendor',
  driver: 'Driver',
  fc: 'Fulfilment Centre',
}

export const ROLE_HOME = {
  vendor: '/vendor',
  driver: '/driver',
  fc: '/fc',
}

// Shipment lifecycle, in order. `index` drives the timeline and progress bars.
export const SHIPMENT_STATUS = {
  booked: { label: 'Booked', tone: 'neutral', index: 0 },
  picked_up: { label: 'Picked up', tone: 'info', index: 1 },
  in_transit: { label: 'In transit', tone: 'accent', index: 2 },
  at_gate: { label: 'At gate', tone: 'violet', index: 3 },
  unloading: { label: 'Unloading', tone: 'violet', index: 4 },
  delivered: { label: 'Delivered', tone: 'success', index: 5 },
  cancelled: { label: 'Cancelled', tone: 'danger', index: -1 },
}

export const SHIPMENT_FLOW = ['booked', 'picked_up', 'in_transit', 'at_gate', 'unloading', 'delivered']

export const ACTIVE_STATUSES = ['booked', 'picked_up', 'in_transit', 'at_gate', 'unloading']
export const MOVING_STATUSES = ['picked_up', 'in_transit']

// Driver-facing wording for the same lifecycle — a driver taps "Loaded", not
// "picked_up". Same underlying state, different vocabulary.
export const DRIVER_ACTION = {
  booked: { label: 'Start trip', next: 'picked_up', note: 'Heading to pickup' },
  picked_up: { label: 'Mark loaded', next: 'in_transit', note: 'Loading at vendor warehouse' },
  in_transit: { label: 'Arrived at FC', next: 'at_gate', note: 'Reached fulfilment centre gate' },
  at_gate: { label: 'Start unloading', next: 'unloading', note: 'Docked and unloading' },
  unloading: { label: 'Complete delivery', next: 'delivered', note: 'Capture proof of delivery' },
}

export const DOC_TYPES = {
  eway: 'E-way bill',
  invoice: 'Tax invoice',
  gst: 'GST declaration',
  lr: 'LR copy',
  asn: 'Advance shipping notice',
}

export const DOC_STATUS = {
  valid: { label: 'Valid', tone: 'success' },
  expiring: { label: 'Expiring soon', tone: 'warn' },
  mismatch: { label: 'Mismatch', tone: 'danger' },
  missing: { label: 'Missing', tone: 'neutral' },
  pending: { label: 'Under review', tone: 'info' },
}

export const ALERT_SEVERITY = {
  critical: { label: 'Critical', tone: 'danger', weight: 3 },
  warning: { label: 'Warning', tone: 'warn', weight: 2 },
  info: { label: 'Info', tone: 'info', weight: 1 },
}

export const ALERT_TYPES = {
  delay: 'Delay predicted',
  door_open: 'Unscheduled door open',
  temperature: 'Temperature breach',
  shock: 'Shock event',
  document: 'Document issue',
  detention: 'Detention threshold',
  route_deviation: 'Route deviation',
  device_offline: 'Tracking device offline',
  slot_change: 'Dock slot changed',
  arrival: 'Arrival update',
}

export const APPOINTMENT_STATUS = {
  requested: { label: 'Requested', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  alternative: { label: 'Alternative proposed', tone: 'info' },
  completed: { label: 'Completed', tone: 'neutral' },
}

export const EXCEPTION_TYPES = {
  late_arrival: 'Late arrival',
  document_mismatch: 'Document mismatch',
  temperature_breach: 'Temperature breach',
  quantity_shortage: 'Quantity shortage',
  unscheduled_arrival: 'Unscheduled arrival',
  damage: 'Damage on receipt',
}

export const EXCEPTION_STATUS = {
  open: { label: 'Open', tone: 'danger' },
  investigating: { label: 'Investigating', tone: 'warn' },
  resolved: { label: 'Resolved', tone: 'success' },
}

export const DELAY_REASONS = [
  'Traffic congestion on NH-48',
  'Extended loading at origin',
  'Driver rest break',
  'Toll plaza queue',
  'Weather — heavy rain',
  'Route diversion',
  'Vehicle breakdown',
  'Waiting for dock assignment',
]

export const INCIDENT_TYPES = {
  breakdown: 'Vehicle breakdown',
  accident: 'Accident',
  route_block: 'Route blocked',
  detention: 'Detention at site',
  other: 'Other',
}

export const DEVICE_STATUS = {
  online: { label: 'Online', tone: 'success' },
  offline: { label: 'Offline', tone: 'danger' },
  'low-battery': { label: 'Low battery', tone: 'warn' },
}

export const GRN_DECISION = {
  accepted: { label: 'Accepted', tone: 'success' },
  partial: { label: 'Partially accepted', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'danger' },
  pending: { label: 'Pending check', tone: 'neutral' },
}

// Minutes a vehicle may stay on site before detention is flagged.
export const DETENTION_AMBER_MIN = 45
export const DETENTION_RED_MIN = 90

// The window fulfilment centres accept inbound in. Drives the calendar grid and
// the dock gantt; the API enforces the same bounds when a slot is requested.
export const OPERATING_START = 6
export const OPERATING_END = 22

// Shown on the signup form, which runs before there is an account to fetch
// reference data with. Kept deliberately generic — no real marketplace names.
export const SIGNUP_FC_OPTIONS = [
  { id: 'fc-bhiwandi', label: 'FC Bhiwandi — Bhiwandi' },
  { id: 'fc-manesar', label: 'FC Manesar — Manesar' },
  { id: 'fc-whitefield', label: 'FC Whitefield — Bengaluru' },
  { id: 'fc-sanand', label: 'FC Sanand — Ahmedabad' },
]

export const COMMODITIES = [
  'Cotton apparel — mixed cartons',
  'Consumer electronics accessories',
  'Packaged food — dry goods',
  'Home furnishings',
  'Footwear',
  'Personal care products',
  'Small kitchen appliances',
  'Stationery & office supplies',
  'Auto spare parts',
  'Toys & games',
]
