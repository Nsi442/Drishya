import { createContext, useContext } from 'react'

// The offline queue is owned by DriverLayout and read by the POD, checklist and
// incident screens, so a capture made in a dead spot survives navigation.
export const DriverQueueContext = createContext(null)

export function useDriverQueue() {
  const ctx = useContext(DriverQueueContext)
  if (!ctx) throw new Error('useDriverQueue must be used inside the driver layout')
  return ctx
}
