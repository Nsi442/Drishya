// One import surface for the whole app. Pages import from here, never from a
// service file directly, so the internal layout of this folder stays free to
// change when a real backend arrives.

export * as auth from './authService.js'
export * as shipments from './shipmentService.js'
export * as alerts from './alertService.js'
export * as appointments from './appointmentService.js'
export * as fleet from './fleetService.js'
export * as documents from './documentService.js'
export * as analytics from './analyticsService.js'
export * as fc from './fcService.js'
export { ServiceError, setFailureRate, getFailureRate } from './client.js'
