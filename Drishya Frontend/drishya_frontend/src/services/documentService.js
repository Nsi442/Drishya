import { get, post } from './client.js'

export function listDocuments({ status = 'all', type = 'all', search = '', shipmentId } = {}) {
  return get('/documents', {
    label: 'loading documents',
    params: { status, type, search, shipmentId },
  })
}

/**
 * Replaces a document. The shipment id is no longer needed — a document id is
 * globally unique — but it is kept in the signature so calling pages did not
 * have to change.
 */
export function reuploadDocument(_shipmentId, docId, { number, fileName }) {
  return post(`/documents/${docId}/reupload`, { number, fileName }, { label: 'uploading the document' })
}

export function validateDocument(_shipmentId, docId) {
  return post(`/documents/${docId}/validate`, null, { label: 'validating the document' })
}
