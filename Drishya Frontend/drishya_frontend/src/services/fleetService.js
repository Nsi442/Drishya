import { get, patch } from './client.js'

export function listCarriers() {
  return get('/carriers', { label: 'loading carriers' })
}

export function listVehicles({ search = '', deviceStatus = 'all', carrier = 'all' } = {}) {
  return get('/vehicles', { label: 'loading vehicles', params: { search, deviceStatus, carrier } })
}

export function listDrivers({ search = '', availability = 'all' } = {}) {
  return get('/drivers', { label: 'loading drivers', params: { search, availability } })
}

export function setDriverAvailability(id, available) {
  return patch(`/drivers/${id}/availability`, { available }, { label: 'updating availability' })
}

export function getDriver(id) {
  return get('/drivers', { label: 'loading driver' }).then(
    (drivers) => drivers.find((d) => d.id === id) ?? null,
  )
}

export function listVendors() {
  return get('/vendors', { label: 'loading vendors' })
}

export function listFulfilmentCentres() {
  return get('/fulfilment-centres', { label: 'loading fulfilment centres' })
}
